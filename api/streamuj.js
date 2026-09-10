const axios = require('axios');
const crypto = require('crypto');

const QUALITY_LABELS = {
  HD: 'HD', SD: 'SD', FHD: '1080p', UHD: '4K', KINORIP: 'KinoRip', TVRIP: 'TVRip'
};
const FLAG_UNICODE = {
  CZ: '\u{1F1E8}\u{1F1FF}', CS: '\u{1F1E8}\u{1F1FF}', CZE: '\u{1F1E8}\u{1F1FF}',
  SK: '\u{1F1F8}\u{1F1F0}', SLK: '\u{1F1F8}\u{1F1F0}',
  EN: '\u{1F1EC}\u{1F1E7}', ENG: '\u{1F1EC}\u{1F1E7}'
};
const ISO_LANG = { CZ: 'cze', CS: 'cze', CZE: 'cze', SK: 'slk', SLK: 'slk', EN: 'eng', ENG: 'eng' };
const LANG_ORDER = ['CZ', 'SK', 'EN'];
const QUALITY_ORDER = ['UHD', 'FHD', 'HD', 'SD', 'KINORIP', 'TVRIP'];

function md5(value) {
  return crypto.createHash('md5').update(String(value || '')).digest('hex');
}
function normalizeLang(value) {
  const lang = String(value || '').trim().toUpperCase();
  if (lang === 'CS' || lang === 'CZE') return 'CZ';
  if (lang === 'SLK') return 'SK';
  if (lang === 'ENG') return 'EN';
  return lang || '??';
}
function flagFor(lang) { return FLAG_UNICODE[normalizeLang(lang)] || '🌐'; }
function isoFor(lang) {
  return ISO_LANG[String(lang || '').trim().toUpperCase()] || ISO_LANG[normalizeLang(lang)] || String(lang || 'und').toLowerCase();
}
function langIndex(lang) {
  const index = LANG_ORDER.indexOf(normalizeLang(lang));
  return index === -1 ? 999 : index;
}
function qualityIndex(quality) {
  const index = QUALITY_ORDER.indexOf(String(quality || '').toUpperCase());
  return index === -1 ? 999 : index;
}
function collectSubtitles(langData, branch = '') {
  const subtitles = langData && langData.subtitles;
  if (!subtitles || typeof subtitles !== 'object') return [];
  return Object.entries(subtitles)
    .filter(([, url]) => typeof url === 'string' && /^https?:\/\//i.test(url))
    .map(([lang, url], index) => ({
      id: `sosac-${normalizeLang(lang).toLowerCase()}-${index + 1}`,
      lang: isoFor(lang),
      sourceLang: normalizeLang(lang),
      branch: normalizeLang(branch),
      sourceUrl: url,
      directUrl: url
    }));
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
  const out = [];
  let cue = [];
  const timeLine = /^(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})(.*)$/;
  const fmt = (h, m, s, ms) => `${String(Number(h || 0)).padStart(2, '0')}:${m}:${s}.${ms}`;
  const flush = () => { if (cue.length) { out.push(cue.join('\n')); cue = []; } };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\d+$/.test(raw.trim()) && i + 1 < lines.length && timeLine.test(lines[i + 1].trim())) continue;
    const m = timeLine.exec(raw.trim());
    if (m) {
      flush();
      cue.push(`${fmt(m[1], m[2], m[3], m[4])} --> ${fmt(m[5], m[6], m[7], m[8])}${m[9] || ''}`);
      continue;
    }
    if (cue.length) cue.push(raw);
    else if (raw.trim()) throw new Error('Neplatný formát titulků.');
  }
  flush();
  if (!out.length) throw new Error('V souboru nebyly nalezeny titulky.');
  return `WEBVTT\n\n${out.join('\n\n')}\n`;
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

  async getVideoLinks(linkId, device = 18) {
    if (!this.isConfigured() || !linkId) return null;
    const response = await this.http.get(`https://${this.provider}/json_api_player.php`, {
      params: { action: 'get-video-links', d: device, link: linkId, login: this.username, password: this.passwordHash, location: this.location }
    });
    const data = response.data;
    try { console.log(`[streamuj summary link=${linkId}] ${JSON.stringify(safeResponseSummary(data))}`); } catch (_) {}
    if (this.debugRaw) {
      try { console.log(`[streamuj RAW link=${linkId}]\n${JSON.stringify(data, null, 2).slice(0, 12000)}`); } catch (_) {}
    }
    return data;
  }

  async getSubtitleTracks(linkId) {
    // d=19 je cesta ověřená v původním funkčním subtitle addonu.
    let data = await this.getVideoLinks(linkId, 19);
    if ((!data || !data.URL || typeof data.URL !== 'object')) data = await this.getVideoLinks(linkId, 18);
    if (!data || !data.URL || typeof data.URL !== 'object') return [];

    const tracks = [];
    const seen = new Set();
    for (const [branch, langData] of Object.entries(data.URL)) {
      for (const sub of collectSubtitles(langData, branch)) {
        const key = `${sub.lang}:${sub.sourceUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push(sub);
      }
    }
    const priority = { cze: 0, slk: 1, eng: 2 };
    tracks.sort((a, b) => (priority[a.lang] ?? 3) - (priority[b.lang] ?? 3));
    console.log(`[subtitle] link=${linkId} tracks=${tracks.length}`);
    return tracks.slice(0, 12);
  }

  async downloadSubtitleVtt(sourceUrl) {
    if (typeof sourceUrl !== 'string' || !/^https?:\/\//i.test(sourceUrl)) throw new Error('Neplatná URL titulků.');
    const parsed = new URL(sourceUrl);
    if (!(parsed.hostname === 'streamuj.tv' || parsed.hostname.endsWith('.streamuj.tv'))) throw new Error('Nepovolený host titulků.');
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';

    const response = await this.http.get(parsed.toString(), {
      responseType: 'text',
      transformResponse: [data => data],
      headers: {
        Accept: 'text/vtt,text/plain,application/x-subrip,*/*',
        Referer: 'https://www.streamuj.tv/',
        Cookie: `pass=${encodeURIComponent(this.username)}%3A%3A%3A${this.passwordHash}; sublanguage=1; quality=1; videolanguage=cs`
      }
    });
    const body = typeof response.data === 'string' ? response.data : String(response.data || '');
    if (!body || /^\s*</.test(body)) throw new Error('Streamuj nevrátil platná textová data titulků.');
    const vtt = convertSrtToVtt(body);
    return Buffer.from(vtt, 'utf8');
  }

  async resolveIndirectUrl(url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
    try {
      const response = await this.http.get(url, { responseType: 'text' });
      const body = typeof response.data === 'string' ? response.data.trim() : String(response.data || '').trim();
      return /^https?:\/\//i.test(body) ? body : url;
    } catch (error) {
      console.warn(`[streamuj] resolve failed: ${error.message}`);
      return url;
    }
  }

  async getStreams(linkId, options = {}) {
    const data = await this.getVideoLinks(linkId, 18);
    if (!data || !data.URL || typeof data.URL !== 'object') return [];
    const result = [];
    const prepareSubtitles = typeof options.prepareSubtitles === 'function' ? options.prepareSubtitles : null;

    for (const [rawLang, langData] of Object.entries(data.URL)) {
      if (!langData || typeof langData !== 'object') continue;
      const lang = normalizeLang(rawLang);
      const rawSubs = collectSubtitles(langData, rawLang);
      const subtitles = prepareSubtitles ? await prepareSubtitles(rawSubs) : rawSubs.map(sub => ({ id: sub.id, lang: sub.lang, url: sub.directUrl }));

      for (const [rawQuality, indirectUrl] of Object.entries(langData)) {
        if (rawQuality === 'subtitles' || typeof indirectUrl !== 'string' || !/^https?:\/\//i.test(indirectUrl)) continue;
        const quality = String(rawQuality).toUpperCase();
        const finalUrl = await this.resolveIndirectUrl(indirectUrl);
        if (!finalUrl) continue;
        const stream = { lang, quality, url: finalUrl, subtitles: rawSubs };
        result.push({
          url: finalUrl,
          name: `Sosáč • ${QUALITY_LABELS[quality] || quality}`,
          description: buildDescription(stream),
          subtitles,
          behaviorHints: { notWebReady: true, bingeGroup: `sosac-${lang.toLowerCase()}-${quality.toLowerCase()}` },
          _sort: { lang: langIndex(lang), quality: qualityIndex(quality) }
        });
      }
    }

    result.sort((a, b) => a._sort.lang - b._sort.lang || a._sort.quality - b._sort.quality);
    return result.map(({ _sort, ...stream }) => stream);
  }
}

module.exports = { StreamujApi, normalizeLang, flagFor, isoFor, collectSubtitles, convertSrtToVtt };
