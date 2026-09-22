const axios = require('axios');
const crypto = require('crypto');
const NodeCache = require('node-cache');

const QUALITY_LABELS = {
  HD: 'HD', SD: 'SD', FHD: '1080p', UHD: '4K', KINORIP: 'KinoRip', TVRIP: 'TVRip'
};
const FLAG_UNICODE = {
  CZ: '\u{1F1E8}\u{1F1FF}', CS: '\u{1F1E8}\u{1F1FF}', CZE: '\u{1F1E8}\u{1F1FF}',
  SK: '\u{1F1F8}\u{1F1F0}', SLK: '\u{1F1F8}\u{1F1F0}',
  EN: '\u{1F1EC}\u{1F1E7}', ENG: '\u{1F1EC}\u{1F1E7}'
};
const ISO_LANG = {
  CZ: 'cze', CS: 'cze', CZE: 'cze', CES: 'cze',
  SK: 'slk', SLK: 'slk', SLO: 'slk',
  EN: 'eng', ENG: 'eng',
  DE: 'ger', GER: 'ger', DEU: 'ger',
  FR: 'fre', FRE: 'fre', FRA: 'fre',
  ES: 'spa', SPA: 'spa', IT: 'ita', ITA: 'ita',
  PL: 'pol', POL: 'pol', HU: 'hun', HUN: 'hun'
};
const LANG_ORDER = ['CZ', 'SK', 'EN'];
const QUALITY_ORDER = ['UHD', 'FHD', 'HD', 'SD', 'KINORIP', 'TVRIP'];

// Krátká sdílená cache. Stream URL mohou být časově omezené, proto jsou TTL záměrně krátké.
// Její hlavní účel je zabránit duplicitám, když Stremio současně volá stream + subtitles.
const videoLinksCache = new NodeCache({ stdTTL: 60, checkperiod: 30, maxKeys: 1200, useClones: true });
const indirectUrlCache = new NodeCache({ stdTTL: 45, checkperiod: 30, maxKeys: 2400, useClones: false });
const pendingVideoLinks = new Map();
const pendingIndirectUrls = new Map();

function md5(value) {
  return crypto.createHash('md5').update(String(value || '')).digest('hex');
}
function shortCacheKey(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
function normalizeLang(value) {
  const lang = String(value || '').trim().toUpperCase();
  if (lang === 'CS' || lang === 'CZE' || lang === 'CES') return 'CZ';
  if (lang === 'SLK' || lang === 'SLO') return 'SK';
  if (lang === 'ENG') return 'EN';
  return lang || '??';
}
function flagFor(lang) { return FLAG_UNICODE[normalizeLang(lang)] || '🌐'; }
function isoFor(lang) {
  const raw = String(lang || '').trim().toUpperCase();
  return ISO_LANG[raw] || ISO_LANG[normalizeLang(raw)] || (raw ? raw.toLowerCase() : 'und');
}
function langIndex(lang) {
  const index = LANG_ORDER.indexOf(normalizeLang(lang));
  return index === -1 ? 999 : index;
}
function qualityIndex(quality) {
  const index = QUALITY_ORDER.indexOf(String(quality || '').toUpperCase());
  return index === -1 ? 999 : index;
}
function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<');
}
function normalizeSubtitleSourceUrl(value, provider = 'www.streamuj.tv') {
  try {
    const url = new URL(decodeHtmlEntities(value), `https://${provider}/`);
    if (!(url.hostname === 'streamuj.tv' || url.hostname.endsWith('.streamuj.tv'))) return null;
    if (url.username || url.password) return null;
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
function collectSubtitles(langData, branch = '', provider = 'www.streamuj.tv') {
  const subtitles = langData && langData.subtitles;
  if (!subtitles || typeof subtitles !== 'object') return [];
  return Object.entries(subtitles)
    .map(([lang, url], index) => {
      const sourceUrl = typeof url === 'string' ? normalizeSubtitleSourceUrl(url, provider) : null;
      if (!sourceUrl) return null;
      return {
        id: `sosac-${normalizeLang(lang).toLowerCase()}-${index + 1}`,
        lang: isoFor(lang),
        sourceLang: normalizeLang(lang),
        branch: normalizeLang(branch),
        sourceUrl,
        directUrl: sourceUrl
      };
    })
    .filter(Boolean);
}
function collectSubtitleTracksFromData(data, provider = 'www.streamuj.tv') {
  if (!data || !data.URL || typeof data.URL !== 'object') return [];
  const result = [];
  const seen = new Set();
  for (const [branch, langData] of Object.entries(data.URL)) {
    for (const sub of collectSubtitles(langData, branch, provider)) {
      const key = `${sub.lang}:${sub.sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(sub);
    }
  }
  const priority = { cze: 0, slk: 1, eng: 2 };
  result.sort((a, b) => (priority[a.lang] ?? 3) - (priority[b.lang] ?? 3));
  return result.slice(0, 12);
}
function buildDescription(stream) {
  const audio = `🎧 ${flagFor(stream.lang)} ${normalizeLang(stream.lang)}`;
  const subs = stream.subtitles.length
    ? `💬 ${stream.subtitles.map(s => `${flagFor(s.sourceLang)} ${normalizeLang(s.sourceLang)}`).join(' • ')}`
    : '💬 Bez titulků';
  const quality = `🎬 ${QUALITY_LABELS[stream.quality] || stream.quality}`;
  return `${audio}\n${subs}\n${quality}`;
}
function safeResponseSummary(data) {
  const summary = { ok: Boolean(data && typeof data === 'object'), topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : [], streams: [] };
  if (!data || !data.URL || typeof data.URL !== 'object') return summary;
  for (const [rawLang, langData] of Object.entries(data.URL)) {
    if (!langData || typeof langData !== 'object') continue;
    const qualities = Object.entries(langData)
      .filter(([key, value]) => key !== 'subtitles' && typeof value === 'string')
      .map(([key]) => String(key).toUpperCase());
    const subtitleLanguages = langData.subtitles && typeof langData.subtitles === 'object'
      ? Object.keys(langData.subtitles).map(normalizeLang) : [];
    summary.streams.push({ audio: normalizeLang(rawLang), qualities, subtitles: subtitleLanguages });
  }
  return summary;
}
function convertSrtToVtt(content) {
  const text = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('Prázdný soubor titulků.');
  if (/^WEBVTT(?:[ \t]|\n|$)/i.test(text)) return text + '\n';

  const lines = text.split('\n');
  const cues = [];
  let current = null;
  const timeLine = /^(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})(.*)$/;
  const fmt = (h, m, s, ms) => `${String(Number(h || 0)).padStart(2, '0')}:${m}:${s}.${ms}`;
  const flush = () => {
    if (!current) return;
    const body = current.body.join('\n').replace(/\n[ \t]*\n+/g, '\n').trim();
    if (body) cues.push(`${current.time}\n${body}`);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\d+$/.test(raw.trim()) && i + 1 < lines.length && timeLine.test(lines[i + 1].trim())) continue;
    const m = timeLine.exec(raw.trim());
    if (m) {
      flush();
      current = {
        time: `${fmt(m[1], m[2], m[3], m[4])} --> ${fmt(m[5], m[6], m[7], m[8])}${m[9] || ''}`,
        body: []
      };
      continue;
    }
    if (current) current.body.push(raw);
    else if (raw.trim()) throw new Error('Neplatný formát titulků.');
  }
  flush();
  if (!cues.length) throw new Error('V souboru nebyly nalezeny titulky.');
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

class StreamujApi {
  constructor(options = {}) {
    this.username = String(options.username || '').trim();
    this.hasPassword = Boolean(String(options.password || ''));
    this.passwordHash = this.hasPassword ? md5(options.password) : '';
    this.provider = options.provider || 'www.streamuj.tv';
    this.location = String(options.location) === '2' ? '2' : '1';
    this.debugRaw = options.debugRaw === true;
    this.http = axios.create({
      timeout: 20000,
      maxContentLength: 2 * 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0 (Stremio Sosac Addon)', Accept: 'application/json, text/plain, */*' }
    });
  }
  isConfigured() { return Boolean(this.username && this.hasPassword && this.passwordHash); }
  authCookie() {
    return `pass=${encodeURIComponent(this.username)}%3A%3A%3A${this.passwordHash}; sublanguage=1; quality=1; videolanguage=cs`;
  }

  videoLinksCacheKey(linkId, device) {
    return shortCacheKey([
      this.provider,
      this.username,
      this.passwordHash,
      this.location,
      String(linkId),
      Number(device)
    ]);
  }

  async getVideoLinks(linkId, device = 18) {
    if (!this.isConfigured() || !linkId) return null;

    const key = this.videoLinksCacheKey(linkId, device);
    const cached = videoLinksCache.get(key);
    if (cached !== undefined) return cached;

    const existing = pendingVideoLinks.get(key);
    if (existing) return existing;

    const pending = this.http.get(`https://${this.provider}/json_api_player.php`, {
      params: { action: 'get-video-links', d: device, link: linkId, login: this.username, password: this.passwordHash, location: this.location }
    }).then(response => {
      const data = response.data;
      videoLinksCache.set(key, data, 60);
      try { console.log(`[streamuj summary d=${device} link=${linkId}] ${JSON.stringify(safeResponseSummary(data))}`); } catch (_) {}
      if (this.debugRaw) {
        try { console.log(`[streamuj RAW d=${device} link=${linkId}]\n${JSON.stringify(data, null, 2).slice(0, 12000)}`); } catch (_) {}
      }
      return data;
    }).finally(() => {
      if (pendingVideoLinks.get(key) === pending) pendingVideoLinks.delete(key);
    });

    pendingVideoLinks.set(key, pending);
    return pending;
  }

  async getSubtitleTracksFromHtml(linkId) {
    if (!/^[a-zA-Z0-9]{10,40}$/.test(String(linkId || ''))) return [];
    try {
      const response = await this.http.get(`https://${this.provider}/video/${encodeURIComponent(linkId)}?remote=1`, {
        responseType: 'text',
        transformResponse: [data => data],
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: `https://${this.provider}/video/${encodeURIComponent(linkId)}`,
          Cookie: this.authCookie()
        }
      });
      const html = typeof response.data === 'string' ? response.data : String(response.data || '');
      const tracks = [];
      const seen = new Set();
      const add = (rawUrl, rawLang) => {
        const sourceUrl = normalizeSubtitleSourceUrl(rawUrl, this.provider);
        if (!sourceUrl) return;
        const lang = isoFor(rawLang);
        const key = `${lang}:${sourceUrl}`;
        if (seen.has(key)) return;
        seen.add(key);
        tracks.push({
          id: `streamuj-html-${String(linkId)}-${tracks.length + 1}`,
          lang,
          sourceLang: normalizeLang(rawLang),
          branch: 'HTML',
          sourceUrl,
          directUrl: sourceUrl
        });
      };

      const subRegex = /\bsub\d+\s*:\s*["']([^"']+)["']/gi;
      let match;
      while ((match = subRegex.exec(html)) !== null) {
        const value = decodeHtmlEntities(match[1]);
        const splitAt = value.indexOf('>');
        if (splitAt >= 0) add(value.slice(splitAt + 1).trim(), value.slice(0, splitAt).trim());
      }
      if (!tracks.length) {
        const directRegex = /(https?:\/\/[^"'\s<>]+\?[^"'\s<>]*streamuj=subtitles[^"'\s<>]*)/gi;
        while ((match = directRegex.exec(html)) !== null) add(match[1], '');
      }
      console.log(`[subtitle html] link=${linkId} tracks=${tracks.length}`);
      return tracks.slice(0, 12);
    } catch (error) {
      console.warn(`[subtitle html] link=${linkId} selhalo: ${error.message}`);
      return [];
    }
  }

  async getSubtitleTracks(linkId) {
    const tracks = [];
    const seen = new Set();

    // d=19 je ověřená titulková cesta. d=18 ponecháváme kvůli úplnosti,
    // ale díky sdílené 60s cache se při současném stream requestu znovu nestahuje.
    for (const device of [19, 18]) {
      try {
        const data = await this.getVideoLinks(linkId, device);
        for (const sub of collectSubtitleTracksFromData(data, this.provider)) {
          const key = `${sub.lang}:${sub.sourceUrl}`;
          if (seen.has(key)) continue;
          seen.add(key);
          tracks.push(sub);
        }
      } catch (error) {
        console.warn(`[subtitle] Player API d=${device} link=${linkId} selhalo: ${error.message}`);
      }
    }
    if (!tracks.length) {
      for (const sub of await this.getSubtitleTracksFromHtml(linkId)) {
        const key = `${sub.lang}:${sub.sourceUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push(sub);
      }
    }
    const priority = { cze: 0, slk: 1, eng: 2 };
    tracks.sort((a, b) => (priority[a.lang] ?? 3) - (priority[b.lang] ?? 3));
    console.log(`[subtitle] link=${linkId} celkem=${tracks.length}`);
    return tracks.slice(0, 12);
  }

  async downloadSubtitleVtt(sourceUrl) {
    const normalized = normalizeSubtitleSourceUrl(sourceUrl, this.provider);
    if (!normalized) throw new Error('Neplatná nebo nepovolená URL titulků.');
    const response = await this.http.get(normalized, {
      responseType: 'text',
      transformResponse: [data => data],
      headers: {
        Accept: 'text/vtt,text/plain,application/x-subrip,*/*',
        Referer: `https://${this.provider}/`,
        Cookie: this.authCookie()
      }
    });
    const body = typeof response.data === 'string' ? response.data : String(response.data || '');
    if (!body || /^\s*</.test(body)) throw new Error('Streamuj nevrátil platná textová data titulků.');
    return Buffer.from(convertSrtToVtt(body), 'utf8');
  }

  async resolveIndirectUrl(url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;

    const key = shortCacheKey(['resolve', url]);
    const cached = indirectUrlCache.get(key);
    if (cached !== undefined) return cached;

    const existing = pendingIndirectUrls.get(key);
    if (existing) return existing;

    const pending = this.http.get(url, { responseType: 'text' })
      .then(response => {
        const body = typeof response.data === 'string' ? response.data.trim() : String(response.data || '').trim();
        const result = /^https?:\/\//i.test(body) ? body : url;
        indirectUrlCache.set(key, result, 45);
        return result;
      })
      .catch(error => {
        console.warn(`[streamuj] resolve failed: ${error.message}`);
        return url;
      })
      .finally(() => {
        if (pendingIndirectUrls.get(key) === pending) pendingIndirectUrls.delete(key);
      });

    pendingIndirectUrls.set(key, pending);
    return pending;
  }

  async getStreams(linkId, options = {}) {
    const data = await this.getVideoLinks(linkId, 18);
    if (!data || !data.URL || typeof data.URL !== 'object') return [];

    const prepareSubtitles = typeof options.prepareSubtitles === 'function' ? options.prepareSubtitles : null;
    let rawSubtitles = collectSubtitleTracksFromData(data, this.provider);
    if (!rawSubtitles.length && prepareSubtitles) rawSubtitles = await this.getSubtitleTracks(linkId);

    const preparedPromise = prepareSubtitles
      ? prepareSubtitles(rawSubtitles)
      : Promise.resolve(rawSubtitles.map(sub => ({ id: sub.id, lang: sub.lang, url: sub.directUrl })));

    const jobs = [];
    for (const [rawLang, langData] of Object.entries(data.URL)) {
      if (!langData || typeof langData !== 'object') continue;
      const lang = normalizeLang(rawLang);

      for (const [rawQuality, indirectUrl] of Object.entries(langData)) {
        if (rawQuality === 'subtitles' || typeof indirectUrl !== 'string' || !/^https?:\/\//i.test(indirectUrl)) continue;
        const quality = String(rawQuality).toUpperCase();

        jobs.push((async () => {
          const finalUrl = await this.resolveIndirectUrl(indirectUrl);
          if (!finalUrl) return null;
          return {
            lang,
            quality,
            finalUrl
          };
        })());
      }
    }

    const [preparedSubtitles, resolved] = await Promise.all([
      preparedPromise,
      Promise.all(jobs)
    ]);

    const result = [];
    for (const item of resolved) {
      if (!item) continue;
      const stream = { lang: item.lang, quality: item.quality, url: item.finalUrl, subtitles: rawSubtitles };
      result.push({
        url: item.finalUrl,
        name: `Sosáč • ${QUALITY_LABELS[item.quality] || item.quality}`,
        description: buildDescription(stream),
        subtitles: preparedSubtitles,
        behaviorHints: { notWebReady: true, bingeGroup: `sosac-${item.lang.toLowerCase()}-${item.quality.toLowerCase()}` },
        _sort: { lang: langIndex(item.lang), quality: qualityIndex(item.quality) }
      });
    }

    result.sort((a, b) => a._sort.lang - b._sort.lang || a._sort.quality - b._sort.quality);
    return result.map(({ _sort, ...stream }) => stream);
  }
}

module.exports = {
  StreamujApi,
  normalizeLang,
  flagFor,
  isoFor,
  collectSubtitles,
  collectSubtitleTracksFromData,
  convertSrtToVtt,
  normalizeSubtitleSourceUrl
};
