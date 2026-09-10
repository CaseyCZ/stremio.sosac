const axios = require('axios');
const crypto = require('crypto');

const QUALITY_LABELS = {
  HD: 'HD',
  SD: 'SD',
  FHD: '1080p',
  UHD: '4K',
  KINORIP: 'KinoRip',
  TVRIP: 'TVRip'
};

const FLAG_UNICODE = {
  CZ: '\u{1F1E8}\u{1F1FF}',
  CS: '\u{1F1E8}\u{1F1FF}',
  CZE: '\u{1F1E8}\u{1F1FF}',
  SK: '\u{1F1F8}\u{1F1F0}',
  SLK: '\u{1F1F8}\u{1F1F0}',
  EN: '\u{1F1EC}\u{1F1E7}',
  ENG: '\u{1F1EC}\u{1F1E7}'
};

const ISO_LANG = {
  CZ: 'cze', CS: 'cze', CZE: 'cze',
  SK: 'slk', SLK: 'slk',
  EN: 'eng', ENG: 'eng'
};

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

function flagFor(lang) {
  return FLAG_UNICODE[normalizeLang(lang)] || '🌐';
}

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

function localSubtitleUrl(url) {
  return `http://127.0.0.1:11470/subtitles.vtt?from=${encodeURIComponent(url)}`;
}

function collectSubtitles(langData) {
  const subtitles = langData && langData.subtitles;
  if (!subtitles || typeof subtitles !== 'object') return [];

  return Object.entries(subtitles)
    .filter(([, url]) => typeof url === 'string' && /^https?:\/\//i.test(url))
    .map(([lang, url], index) => ({
      id: `sosac-${normalizeLang(lang).toLowerCase()}-${index + 1}`,
      lang: isoFor(lang),
      sourceLang: normalizeLang(lang),
      directUrl: url
    }));
}

function toStremioSubtitle(sub, useLocalConversion = true) {
  return {
    id: sub.id,
    lang: sub.lang,
    url: useLocalConversion ? localSubtitleUrl(sub.directUrl) : sub.directUrl
  };
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
  const summary = {
    ok: Boolean(data && typeof data === 'object'),
    topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    streams: []
  };

  if (!data || !data.URL || typeof data.URL !== 'object') return summary;

  for (const [rawLang, langData] of Object.entries(data.URL)) {
    if (!langData || typeof langData !== 'object') continue;

    const qualities = Object.entries(langData)
      .filter(([key, value]) => key !== 'subtitles' && typeof value === 'string')
      .map(([key]) => String(key).toUpperCase());

    const subtitleLanguages = langData.subtitles && typeof langData.subtitles === 'object'
      ? Object.keys(langData.subtitles).map(normalizeLang)
      : [];

    summary.streams.push({
      audio: normalizeLang(rawLang),
      qualities,
      subtitles: subtitleLanguages
    });
  }

  return summary;
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
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Stremio Sosac Addon)',
        Accept: 'application/json, text/plain, */*'
      }
    });
  }

  isConfigured() {
    return Boolean(this.username && this.hasPassword && this.passwordHash);
  }

  async getVideoLinks(linkId) {
    if (!this.isConfigured() || !linkId) return null;

    const response = await this.http.get(`https://${this.provider}/json_api_player.php`, {
      params: {
        action: 'get-video-links',
        d: 18,
        link: linkId,
        login: this.username,
        password: this.passwordHash,
        location: this.location
      }
    });

    const data = response.data;

    try {
      console.log(`[streamuj summary link=${linkId}] ${JSON.stringify(safeResponseSummary(data))}`);
    } catch (_) {}

    if (this.debugRaw) {
      try {
        const raw = JSON.stringify(data, null, 2);
        console.log(`[streamuj RAW link=${linkId}]\n${raw.slice(0, 12000)}`);
      } catch (_) {}
    }

    return data;
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
    const data = await this.getVideoLinks(linkId);
    if (!data || !data.URL || typeof data.URL !== 'object') return [];

    const useLocalSubtitleConversion = options.localSubtitleConversion !== false;
    const result = [];

    for (const [rawLang, langData] of Object.entries(data.URL)) {
      if (!langData || typeof langData !== 'object') continue;
      const lang = normalizeLang(rawLang);
      const subtitles = collectSubtitles(langData);

      for (const [rawQuality, indirectUrl] of Object.entries(langData)) {
        if (rawQuality === 'subtitles') continue;
        if (typeof indirectUrl !== 'string' || !/^https?:\/\//i.test(indirectUrl)) continue;

        const quality = String(rawQuality).toUpperCase();
        const finalUrl = await this.resolveIndirectUrl(indirectUrl);
        if (!finalUrl) continue;

        const stream = { lang, quality, url: finalUrl, subtitles };

        result.push({
          url: finalUrl,
          name: `Sosáč • ${QUALITY_LABELS[quality] || quality}`,
          description: buildDescription(stream),
          subtitles: subtitles.map(sub => toStremioSubtitle(sub, useLocalSubtitleConversion)),
          behaviorHints: {
            notWebReady: true,
            bingeGroup: `sosac-${lang.toLowerCase()}-${quality.toLowerCase()}`
          },
          _sort: {
            lang: langIndex(lang),
            quality: qualityIndex(quality)
          }
        });
      }
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
  localSubtitleUrl
};
