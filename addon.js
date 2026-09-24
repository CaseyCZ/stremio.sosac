const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const NodeCache = require('node-cache');
const {
  SosacApi,
  movieToMeta,
  seriesToMeta,
  getLocalizedTitle,
  getLocalizedDescription
} = require('./api/sosac');
const { StreamujApi } = require('./api/streamuj');
const {
  CinemetaApi,
  titleScore,
  extractImdbId,
  uniqueStrings
} = require('./api/cinemeta');

const app = express();
const PORT = process.env.PORT || 7000;
const VERSION = '0.5.1';
const DEBUG_STREAMUJ_RAW = process.env.DEBUG_STREAMUJ_RAW === '1';
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const idMapCache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 10 * 60 });
const subtitleLookupCache = new NodeCache({ stdTTL: 120, checkperiod: 60 });
const SUBTITLE_CACHE_DIR = process.env.SUBTITLE_CACHE_DIR || path.join(os.tmpdir(), 'stremio-sosac-subtitles');
const SUBTITLE_FILE_MAX_BYTES = 2 * 1024 * 1024;
const cinemeta = new CinemetaApi();

app.disable('etag');
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.path.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

function decodeConfig(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function getSubtitleMode(cfg) {
  return cfg && cfg.subtitleMode === 'direct-test' ? 'direct-test' : 'hybrid';
}

function getHost(req) {
  const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).split(',')[0].trim();
  const prefixRaw = String(req.headers['x-forwarded-prefix'] || '').split(',')[0].trim();
  const prefix = prefixRaw && prefixRaw !== '/' ? `/${prefixRaw.replace(/^\/+|\/+$/g, '')}` : '';
  return `${proto}://${host}${prefix}`;
}

function labelsFor(language) {
  const lang = ['cs', 'sk', 'en'].includes(language) ? language : 'cs';
  return {
    cs: {
      name: 'Sosáč CZ/SK',
      moviePopular: '🔥 Sosáč – Oblíbené filmy', seriesPopular: '🔥 Sosáč – Oblíbené seriály',
      movieRecent: '🆕 Sosáč – Nové filmy', seriesRecent: '🆕 Sosáč – Nové seriály',
      movieRated: '⭐ Sosáč – Nejlépe hodnocené filmy', seriesRated: '⭐ Sosáč – Nejlépe hodnocené seriály',
      movieDub: '🎙️ Sosáč – S dabingem filmy', seriesDub: '🎙️ Sosáč – Nové epizody s dabingem',
      movieSubs: '💬 Sosáč – S titulky filmy', seriesSubs: '💬 Sosáč – Nové epizody s titulky',
      movieSearch: '🔎 Sosáč – Hledat filmy', seriesSearch: '🔎 Sosáč – Hledat seriály'
    },
    sk: {
      name: 'Sosáč CZ/SK',
      moviePopular: '🔥 Sosáč – Obľúbené filmy', seriesPopular: '🔥 Sosáč – Obľúbené seriály',
      movieRecent: '🆕 Sosáč – Nové filmy', seriesRecent: '🆕 Sosáč – Nové seriály',
      movieRated: '⭐ Sosáč – Najlepšie hodnotené filmy', seriesRated: '⭐ Sosáč – Najlepšie hodnotené seriály',
      movieDub: '🎙️ Sosáč – S dabingom filmy', seriesDub: '🎙️ Sosáč – Nové epizódy s dabingom',
      movieSubs: '💬 Sosáč – S titulkami filmy', seriesSubs: '💬 Sosáč – Nové epizódy s titulkami',
      movieSearch: '🔎 Sosáč – Hľadať filmy', seriesSearch: '🔎 Sosáč – Hľadať seriály'
    },
    en: {
      name: 'Sosac CZ/SK',
      moviePopular: '🔥 Sosac – Popular movies', seriesPopular: '🔥 Sosac – Popular series',
      movieRecent: '🆕 Sosac – Recently added movies', seriesRecent: '🆕 Sosac – Recently added series',
      movieRated: '⭐ Sosac – Top rated movies', seriesRated: '⭐ Sosac – Top rated series',
      movieDub: '🎙️ Sosac – Dubbed movies', seriesDub: '🎙️ Sosac – New dubbed episodes',
      movieSubs: '💬 Sosac – Subtitled movies', seriesSubs: '💬 Sosac – New subtitled episodes',
      movieSearch: '🔎 Sosac – Search movies', seriesSearch: '🔎 Sosac – Search series'
    }
  }[lang];
}

function buildManifest(cfg, host) {
  const labels = labelsFor(cfg.uiLanguage);
  const searchExtra = [{ name: 'search', isRequired: true }];
  const pageExtra = [{ name: 'skip', isRequired: false }];
  const directTest = getSubtitleMode(cfg) === 'direct-test';
  return {
    id: directTest
      ? 'cz.caseycz.stremio.sosac.test.direct.directtest'
      : 'cz.caseycz.stremio.sosac.test.direct',
    version: VERSION,
    name: directTest ? `${labels.name} [DIRECT TEST]` : labels.name,
    description: directTest
      ? 'Cinemeta metadata + Sosáč/Streamuj CZ/SK streamy a přímé Streamuj titulky (test).'
      : 'Cinemeta metadata + Sosáč/Streamuj CZ/SK streamy a kompatibilní titulky přes soubor s příponou.',
    logo: `${host}/logo.png`,
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'sosac_m_', 'sosac_s_', 'sosac_ep_'],
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    catalogs: [
      { type: 'movie', id: 'sm-popular', name: labels.moviePopular, extra: pageExtra },
      { type: 'series', id: 'ss-popular', name: labels.seriesPopular, extra: pageExtra },
      { type: 'movie', id: 'sm-last-added', name: labels.movieRecent, extra: pageExtra },
      { type: 'series', id: 'ss-last-added', name: labels.seriesRecent, extra: pageExtra },
      { type: 'movie', id: 'sm-top-rated', name: labels.movieRated, extra: pageExtra },
      { type: 'series', id: 'ss-top-rated', name: labels.seriesRated, extra: pageExtra },
      { type: 'movie', id: 'sm-dubbing', name: labels.movieDub, extra: pageExtra },
      { type: 'series', id: 'ss-dubbing', name: labels.seriesDub, extra: pageExtra },
      { type: 'movie', id: 'sm-subtitles', name: labels.movieSubs, extra: pageExtra },
      { type: 'series', id: 'ss-subtitles', name: labels.seriesSubs, extra: pageExtra },
      { type: 'movie', id: 'sm-search', name: labels.movieSearch, extra: searchExtra },
      { type: 'series', id: 'ss-search', name: labels.seriesSearch, extra: searchExtra }
    ],
    behaviorHints: { configurable: true, configurationRequired: false }
  };
}

const MOVIE_MAP = {
  'sm-popular': 'popular', 'sm-last-added': 'last-added', 'sm-top-rated': 'top-rated',
  'sm-dubbing': 'news-with-dubbing', 'sm-subtitles': 'news-with-subtitles'
};
const SERIES_MAP = {
  'ss-popular': 'popular', 'ss-last-added': 'last-added', 'ss-top-rated': 'top-rated'
};
const SERIES_EPISODE_MAP = {
  'ss-dubbing': 'news-with-dubbing', 'ss-subtitles': 'news-with-subtitles'
};

function parseExtra(extraRaw) {
  const result = {};
  if (!extraRaw) return result;
  String(extraRaw).replace(/\.json$/, '').split('&').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) result[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  });
  return result;
}

function makeSosac(cfg) {
  return new SosacApi({ username: cfg.sosacUser, password: cfg.sosacPass, domain: cfg.sosacDomain });
}
function makeStreamuj(cfg) {
  return new StreamujApi({
    username: cfg.streamujUser,
    password: cfg.streamujPass,
    provider: cfg.streamujProvider || 'www.streamuj.tv',
    location: cfg.location || '1',
    debugRaw: DEBUG_STREAMUJ_RAW
  });
}
function firstLocalized(value, language = 'cs') {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const order = language === 'sk' ? ['sk', 'cs', 'en'] : language === 'en' ? ['en', 'cs', 'sk'] : ['cs', 'sk', 'en'];
  for (const key of order) {
    const v = value[key];
    if (Array.isArray(v) && v.find(Boolean)) return v.find(Boolean);
    if (typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(value)) {
    if (Array.isArray(v) && v.find(Boolean)) return v.find(Boolean);
    if (typeof v === 'string' && v) return v;
  }
  return '';
}
function allLocalizedTitles(item) {
  if (!item) return [];
  const values = [];
  const add = value => {
    if (typeof value === 'string') values.push(value);
    else if (Array.isArray(value)) values.push(...value);
    else if (value && typeof value === 'object') Object.values(value).forEach(add);
  };
  add(item.n); add(item.originalName); add(item.title);
  return uniqueStrings(values);
}
function episodeSeriesTitles(item) {
  if (!item) return [];
  const values = [];
  if (item.ne) {
    if (typeof item.n === 'object') Object.values(item.n).forEach(v => Array.isArray(v) ? values.push(...v) : values.push(v));
    else values.push(item.n);
  } else {
    values.push(item.t, item.seriesTitle, item.show);
  }
  return uniqueStrings(values);
}
function safeIsoDate(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.warn('[meta] Přeskakuji neplatné datum epizody:', value);
    return undefined;
  }
  return date.toISOString();
}
function itemYear(item) {
  const n = Number(item && item.y);
  return Number.isFinite(n) && n > 1800 ? Math.trunc(n) : undefined;
}
function candidateYear(meta) {
  const direct = Number(meta && meta.year);
  if (Number.isFinite(direct) && direct > 1800) return Math.trunc(direct);
  const match = String(meta && meta.releaseInfo || '').match(/\b(18|19|20|21)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}
function sosacCandidateScore(item, wantedTitles, year) {
  const candidateTitles = uniqueStrings([
    getLocalizedTitle(item, 'cs'), getLocalizedTitle(item, 'sk'), getLocalizedTitle(item, 'en'), ...allLocalizedTitles(item)
  ]);
  let score = 0;
  for (const wanted of wantedTitles) for (const candidate of candidateTitles) score = Math.max(score, titleScore(wanted, candidate));
  const y = itemYear(item);
  if (year && y) {
    const diff = Math.abs(year - y);
    if (diff === 0) score += 0.12;
    else if (diff === 1) score += 0.06;
    else if (diff >= 3) score -= 0.20;
  }
  return score;
}
async function findBestSosacMatch(sosac, type, titles, year) {
  const wantedTitles = uniqueStrings(titles);
  if (!wantedTitles.length) return null;
  let best = null;
  let bestScore = -1;
  for (const title of wantedTitles.slice(0, 4)) {
    let results = [];
    try {
      results = type === 'movie' ? await sosac.searchMovies(title, 1, 100) : await sosac.searchSeries(title, 1, 100);
    } catch (error) {
      console.warn(`[resolve] Sosáč search "${title}" selhal: ${error.message}`);
      continue;
    }
    for (const item of Array.isArray(results) ? results : []) {
      const score = sosacCandidateScore(item, wantedTitles, year);
      if (score > bestScore) { best = item; bestScore = score; }
    }
    if (bestScore >= 1.05) break;
  }
  if (!best || bestScore < 0.55) return null;
  console.log(`[resolve] Sosáč ${type}: id=${best._id}, score=${bestScore.toFixed(2)}`);
  return best;
}
function cinemetaTitles(meta) {
  return uniqueStrings([meta && meta.name, meta && meta.originalName, ...(Array.isArray(meta && meta.nameTranslations) ? meta.nameTranslations : [])]);
}
function isUsableArtwork(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) && !/defaultnis|undefined|null/i.test(value);
}
function mergeCinemetaMeta(meta, sosacItem, language) {
  if (!meta) return null;

  const localizedName = sosacItem ? getLocalizedTitle(sosacItem, language) : '';
  const localizedDescription = sosacItem ? getLocalizedDescription(sosacItem, language) : '';

  let fallbackMeta = null;
  if (sosacItem) {
    fallbackMeta = String(meta.type || '').toLowerCase() === 'series'
      ? seriesToMeta(sosacItem, language)
      : movieToMeta(sosacItem, language);
  }

  const poster = isUsableArtwork(meta.poster)
    ? meta.poster
    : (fallbackMeta && isUsableArtwork(fallbackMeta.poster) ? fallbackMeta.poster : undefined);

  const background = isUsableArtwork(meta.background)
    ? meta.background
    : (fallbackMeta && isUsableArtwork(fallbackMeta.background)
      ? fallbackMeta.background
      : poster);

  if (!isUsableArtwork(meta.poster) && poster) {
    console.log(`[artwork] Cinemeta bez posteru → používám Sosáč pro ${meta.id || meta.name || 'položku'}`);
  }

  return {
    ...meta,
    id: String(meta.id || '').toLowerCase(),
    name: localizedName || meta.name,
    description: localizedDescription || meta.description,
    poster,
    background
  };
}
function catalogMetaFromCinemeta(meta, sosacItem, language) {
  const merged = mergeCinemetaMeta(meta, sosacItem, language);
  if (!merged) return null;
  const { videos, trailerStreams, ...catalogMeta } = merged;
  return catalogMeta;
}
function episodeTitle(item, language = 'cs') {
  let show = '';
  let name = '';
  if (item && item.ne) { show = firstLocalized(item.n, language); name = firstLocalized(item.ne, language); }
  else { name = firstLocalized(item && item.n, language); show = firstLocalized(item && item.t, language); }
  const s = String(item && item.s !== undefined ? item.s : '').padStart(2, '0');
  const e = String(item && item.ep !== undefined ? item.ep : '').padStart(2, '0');
  const se = s && e ? `${s}x${e}` : '';
  if (show && se && name) return `${show}: ${se} - ${name}`;
  if (show && se) return `${show}: ${se}`;
  if (se && name) return `${se} - ${name}`;
  return show || name || 'Epizoda';
}
function episodePoster(item) {
  const candidates = [item && item.i, item && item.ie, item && item.poster, item && item.image, item && item.thumbnail];
  for (const raw of candidates) {
    if (Array.isArray(raw)) {
      const found = raw.find(v => isUsableArtwork(v));
      if (found) return found;
    }
    if (isUsableArtwork(raw)) return raw;
  }
  return undefined;
}
function episodeToCatalogMeta(item, language = 'cs') {
  if (!item || item._id === undefined || item._id === null) return null;
  const id = `sosac_ep_${item._id}`;
  const season = Number(item.s), episode = Number(item.ep), title = episodeTitle(item, language);
  return {
    id, type: 'series', name: title, poster: episodePoster(item), description: getLocalizedDescription(item, language),
    behaviorHints: { defaultVideoId: id },
    videos: [{ id, title, season: Number.isFinite(season) ? season : 0, episode: Number.isFinite(episode) ? episode : 0, thumbnail: episodePoster(item) }]
  };
}
function buildSeriesVideos(detail, uiLanguage) {
  if (!detail || typeof detail !== 'object') return [];
  const videos = [];
  for (const seasonKey of Object.keys(detail).filter(k => k !== 'info' && /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))) {
    const seasonData = detail[seasonKey];
    if (!seasonData || typeof seasonData !== 'object') continue;
    for (const episodeKey of Object.keys(seasonData).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))) {
      const ep = seasonData[episodeKey];
      if (!ep || ep._id === undefined || ep._id === null) continue;
      videos.push({
        id: `sosac_ep_${ep._id}`,
        title: getLocalizedTitle(ep, uiLanguage) || `S${seasonKey}E${episodeKey}`,
        season: Number(seasonKey), episode: Number(episodeKey), released: safeIsoDate(ep.r),
        overview: getLocalizedDescription(ep, uiLanguage) || '', thumbnail: ep.ie || ep.i || undefined
      });
    }
  }
  return videos;
}
async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.isArray(items) ? items : [];
  const result = new Array(source.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= source.length) return;
      try { result[index] = await mapper(source[index], index); }
      catch (error) { console.warn('[catalog] mapping selhal:', error.message); result[index] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, source.length) }, () => worker()));
  return result.filter(Boolean);
}
function rememberMapping(type, sosacItem, imdbId) {
  if (!sosacItem || sosacItem._id === undefined || sosacItem._id === null || !/^tt\d{5,10}$/i.test(String(imdbId || ''))) return;
  const id = String(imdbId).toLowerCase();
  idMapCache.set(`s2i:${type}:${sosacItem._id}`, id);
  idMapCache.set(`i2s:${type}:${id}`, String(sosacItem._id));
}
async function resolveSosacCatalogItem(type, item, cfg) {
  if (!item) return null;
  return type === 'movie'
    ? movieToMeta(item, cfg.uiLanguage)
    : seriesToMeta(item, cfg.uiLanguage);
}
async function resolveEpisodeCatalogItem(item, cfg) {
  if (!item) return null;
  return episodeToCatalogMeta(item, cfg.uiLanguage);
}
async function resolveSosacForImdb(sosac, type, imdbId) {
  const id = String(imdbId || '').toLowerCase();
  if (!/^tt\d{5,10}$/.test(id)) return null;
  const reverseKey = `i2s:${type}:${id}`;
  const cachedSosacId = idMapCache.get(reverseKey);
  if (cachedSosacId) {
    try {
      return type === 'movie' ? await sosac.getMovie(cachedSosacId) : { ...(await sosac.getSeriesDetail(cachedSosacId)), _resolvedSosacId: cachedSosacId };
    } catch (error) {
      idMapCache.del(reverseKey);
    }
  }
  const meta = await cinemeta.getMeta(type, id);
  if (!meta) return null;
  const match = await findBestSosacMatch(sosac, type, cinemetaTitles(meta), candidateYear(meta));
  if (!match || match._id === undefined || match._id === null) return null;
  rememberMapping(type, match, id);
  if (type === 'movie') {
    try { return await sosac.getMovie(match._id); } catch { return match; }
  }
  const detail = await sosac.getSeriesDetail(match._id);
  if (detail && typeof detail === 'object') detail._resolvedSosacId = String(match._id);
  return detail;
}
function findEpisodeInDetail(detail, season, episode) {
  if (!detail || typeof detail !== 'object') return null;
  const seasonData = detail[String(season)];
  if (seasonData && typeof seasonData === 'object' && seasonData[String(episode)]) return seasonData[String(episode)];
  for (const [seasonKey, value] of Object.entries(detail)) {
    if (seasonKey === 'info' || !value || typeof value !== 'object') continue;
    for (const candidate of Object.values(value)) {
      if (!candidate || typeof candidate !== 'object') continue;
      if (Number(candidate.s) === Number(season) && Number(candidate.ep) === Number(episode)) return candidate;
    }
  }
  return null;
}
async function cinemetaMetaWithLocalizedOverlay(sosac, type, imdbId, language) {
  const meta = await cinemeta.getMeta(type, imdbId);
  if (!meta) return null;
  let sosacItem = null;
  try {
    if (type === 'movie') sosacItem = await resolveSosacForImdb(sosac, 'movie', imdbId);
    else { const detail = await resolveSosacForImdb(sosac, 'series', imdbId); sosacItem = detail && detail.info ? detail.info : detail; }
  } catch (error) {
    console.warn(`[meta] Lokalizační overlay selhal: ${error.message}`);
  }
  return mergeCinemetaMeta(meta, sosacItem, language);
}

async function resolveLinkId(sosac, type, id) {
  if (type === 'movie') {
    if (id.startsWith('sosac_m_')) {
      const item = await sosac.getMovie(id.slice('sosac_m_'.length));
      return item && item.l;
    }
    if (/^tt\d{5,10}$/i.test(id)) {
      const item = await resolveSosacForImdb(sosac, 'movie', id);
      return item && item.l;
    }
  }

  if (type === 'series') {
    if (id.startsWith('sosac_ep_')) {
      const ep = await sosac.getEpisode(id.slice('sosac_ep_'.length));
      return ep && ep.l;
    }
    const match = id.match(/^(tt\d{5,10}):(\d+):(\d+)$/i);
    if (match) {
      const [, imdbId, seasonRaw, episodeRaw] = match;
      const detail = await resolveSosacForImdb(sosac, 'series', imdbId.toLowerCase());
      let ep = findEpisodeInDetail(detail, Number(seasonRaw), Number(episodeRaw));
      if (ep && !ep.l && ep._id !== undefined && ep._id !== null) {
        try { ep = await sosac.getEpisode(ep._id); } catch (_) {}
      }
      return ep && ep.l;
    }
  }
  return null;
}

async function handleCatalog(req, res, extraRaw) {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ metas: [] });
  const type = req.params.type;
  const id = req.params.id.replace(/\.json$/, '');
  const extra = parseExtra(extraRaw);
  const skip = Math.max(0, Number.parseInt(extra.skip || '0', 10) || 0);
  const page = Math.floor(skip / 100) + 1;
  const cacheKey = `catalog:${req.params.cfg}:${type}:${id}:${JSON.stringify(extra)}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const sosac = makeSosac(cfg);
    if (!sosac.isConfigured()) return res.json({ metas: [] });
    let items = [];

    if (type === 'movie') {
      if (id === 'sm-search') items = await sosac.searchMovies(extra.search, page);
      else if (MOVIE_MAP[id]) items = await sosac.getMovies(MOVIE_MAP[id], page);
      const payload = { metas: await mapWithConcurrency(items, 8, item => resolveSosacCatalogItem('movie', item, cfg)) };
      cache.set(cacheKey, payload, 900);
      return res.json(payload);
    }

    if (type === 'series') {
      if (id === 'ss-search') {
        items = await sosac.searchSeries(extra.search, page);
        const payload = { metas: await mapWithConcurrency(items, 8, item => resolveSosacCatalogItem('series', item, cfg)) };
        cache.set(cacheKey, payload, 900);
        return res.json(payload);
      }
      if (SERIES_EPISODE_MAP[id]) {
        const listType = SERIES_EPISODE_MAP[id];
        items = await sosac.getEpisodes(listType, page);
        console.log(`[catalog] ${id} → episodes/lists/${listType}: ${Array.isArray(items) ? items.length : 0} položek`);
        const payload = { metas: await mapWithConcurrency(items, 8, item => resolveEpisodeCatalogItem(item, cfg)) };
        cache.set(cacheKey, payload, 900);
        return res.json(payload);
      }
      if (SERIES_MAP[id]) items = await sosac.getSeries(SERIES_MAP[id], page);
      const payload = { metas: await mapWithConcurrency(items, 8, item => resolveSosacCatalogItem('series', item, cfg)) };
      cache.set(cacheKey, payload, 900);
      return res.json(payload);
    }

    return res.json({ metas: [] });
  } catch (error) {
    console.error('[catalog]', error.message);
    return res.json({ metas: [] });
  }
}

function subtitleProxyFilePath(hash, ext) {
  return path.join(SUBTITLE_CACHE_DIR, `${hash}.${ext}`);
}

async function storeSubtitleProxyFile(body, ext) {
  if (!Buffer.isBuffer(body) || !body.length || body.length > SUBTITLE_FILE_MAX_BYTES) {
    throw new Error('Neplatná velikost souboru titulků.');
  }
  if (!['srt', 'vtt'].includes(ext)) throw new Error('Nepodporovaný formát titulků.');

  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const target = subtitleProxyFilePath(hash, ext);
  await fs.promises.mkdir(SUBTITLE_CACHE_DIR, { recursive: true });

  try {
    await fs.promises.writeFile(target, body, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  return { hash, ext };
}

async function readSubtitleProxyFile(hash, ext) {
  if (!/^[a-f0-9]{64}$/i.test(hash) || !['srt', 'vtt'].includes(ext)) return null;
  try {
    const body = await fs.promises.readFile(subtitleProxyFilePath(hash.toLowerCase(), ext));
    if (!body.length || body.length > SUBTITLE_FILE_MAX_BYTES) return null;
    const actual = crypto.createHash('sha256').update(body).digest('hex');
    return actual === hash.toLowerCase() ? body : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function prepareHybridSubtitleTrack(req, streamuj, track, index) {
  const sourceUrl = track && (track.directUrl || track.sourceUrl);
  if (!/^https:\/\//i.test(String(sourceUrl || ''))) return null;

  try {
    const file = await streamuj.downloadSubtitleFile(sourceUrl);
    const stored = await storeSubtitleProxyFile(file.body, file.ext);
    const base = getHost(req).replace(/\/$/, '');
    const url = `${base}/subtitle-file/v1/${stored.hash}.${stored.ext}`;
    return {
      id: `sosac-hybrid-${track.lang || 'und'}-${stored.hash.slice(0, 12)}`,
      url,
      lang: track.lang || 'und',
      delivery: `proxy-${stored.ext}`
    };
  } catch (error) {
    console.warn(`[subtitle-hybrid] proxy selhal pro stopu ${index + 1}: ${error.message}; vracím direct`);
    return {
      id: `sosac-direct-fallback-${track.lang || 'und'}-${index + 1}`,
      url: sourceUrl,
      lang: track.lang || 'und',
      delivery: 'direct-fallback'
    };
  }
}

async function handleSubtitles(req, res) {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ subtitles: [] });
  const type = req.params.type;
  const id = req.params.id.replace(/\.json$/, '');
  if (!['movie', 'series'].includes(type)) return res.json({ subtitles: [] });

  try {
    const sosac = makeSosac(cfg);
    const streamuj = makeStreamuj(cfg);
    if (!sosac.isConfigured() || !streamuj.isConfigured()) return res.json({ subtitles: [] });

    const mode = getSubtitleMode(cfg);
    const lookupKey = `sub:${req.params.cfg}:${type}:${id}`;
    const cached = subtitleLookupCache.get(lookupKey);
    if (cached) {
      console.log(`[subtitle-${mode}] ${type}/${id}: používám krátkou cache (${cached.length} stop)`);
      return res.json({ subtitles: cached });
    }

    const linkId = await resolveLinkId(sosac, type, id);
    if (!linkId) {
      console.warn(`[subtitle] Sosáč zdroj nenalezen pro ${type}/${id}`);
      return res.json({ subtitles: [] });
    }

    const tracks = await streamuj.getSubtitleTracks(linkId);
    let subtitles = [];

    if (mode === 'direct-test') {
      subtitles = tracks
        .map((track, index) => ({
          id: `sosac-direct-${track.lang || 'und'}-${index + 1}`,
          url: track.directUrl || track.sourceUrl,
          lang: track.lang || 'und',
          delivery: 'direct-test'
        }))
        .filter(track => /^https:\/\//i.test(String(track.url || '')));
    } else {
      subtitles = (await Promise.all(
        tracks.slice(0, 12).map((track, index) =>
          prepareHybridSubtitleTrack(req, streamuj, track, index)
        )
      )).filter(Boolean);
    }

    const publicSubtitles = subtitles.map(({ id: subtitleId, url, lang }) => ({
      id: subtitleId,
      url,
      lang
    }));

    if (publicSubtitles.length) subtitleLookupCache.set(lookupKey, publicSubtitles, 120);

    console.log(`[subtitle-${mode}] ${type}/${id}: vracím ${publicSubtitles.length} stop ${JSON.stringify(
      subtitles.map(track => ({
        lang: track.lang,
        delivery: track.delivery || mode
      }))
    )}`);

    return res.json({ subtitles: publicSubtitles });
  } catch (error) {
    console.error('[subtitle]', error.message);
    return res.json({ subtitles: [] });
  }
}

app.get('/', (req, res) => res.redirect('/configure'));
app.get('/configure', (req, res) => res.sendFile(path.join(__dirname, 'public', 'configure.html')));

app.get('/subtitle-file/v1/:hash.:ext', async (req, res) => {
  const hash = String(req.params.hash || '').toLowerCase();
  const ext = String(req.params.ext || '').toLowerCase();

  try {
    const body = await readSubtitleProxyFile(hash, ext);
    if (!body) return res.status(404).type('text/plain').send('Titulky nenalezeny.');

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', ext === 'vtt'
      ? 'text/vtt; charset=utf-8'
      : 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', body.length);
    console.log(`[subtitle-hybrid-serve] ${hash.slice(0, 12)}.${ext} bytes=${body.length} ua=${String(req.headers['user-agent'] || '').slice(0, 120)}`);

    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  } catch (error) {
    console.error('[subtitle-hybrid-serve]', error.message);
    return res.status(500).type('text/plain').send('Chyba titulků.');
  }
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id: 'cz.caseycz.stremio.sosac', version: VERSION, name: 'Sosáč CZ/SK',
    description: `Configure at ${getHost(req)}/configure`, types: [], resources: [], catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: true }
  });
});
app.get('/:cfg/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.status(400).json({ error: 'Invalid configuration' });
  return res.json(buildManifest(cfg, getHost(req)));
});

app.get('/:cfg/catalog/:type/:id.json', (req, res) => handleCatalog(req, res, null));
app.get('/:cfg/catalog/:type/:id/:extra.json', (req, res) => handleCatalog(req, res, req.params.extra));

app.get('/:cfg/meta/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ meta: null });
  const type = req.params.type;
  const id = req.params.id.replace(/\.json$/, '');
  try {
    const sosac = makeSosac(cfg);
    if (['movie', 'series'].includes(type) && /^tt\d{5,10}$/i.test(id)) {
      return res.json({ meta: await cinemetaMetaWithLocalizedOverlay(sosac, type, id.toLowerCase(), cfg.uiLanguage) });
    }
    if (type === 'movie' && id.startsWith('sosac_m_')) {
      return res.json({ meta: movieToMeta(await sosac.getMovie(id.slice('sosac_m_'.length)), cfg.uiLanguage) });
    }
    if (type === 'series' && id.startsWith('sosac_s_')) {
      const detail = await sosac.getSeriesDetail(id.slice('sosac_s_'.length));
      const info = detail && detail.info ? detail.info : detail;
      const meta = seriesToMeta(info, cfg.uiLanguage);
      if (meta) meta.videos = buildSeriesVideos(detail, cfg.uiLanguage);
      return res.json({ meta });
    }
    if (type === 'series' && id.startsWith('sosac_ep_')) {
      return res.json({ meta: episodeToCatalogMeta(await sosac.getEpisode(id.slice('sosac_ep_'.length)), cfg.uiLanguage) });
    }
  } catch (error) {
    console.error('[meta]', error.message);
  }
  return res.json({ meta: null });
});

app.get('/:cfg/stream/:type/:id.json', async (req, res) => {
  // Streamuj media URLs are short-lived. Never let Stremio/CDNs reuse an old stream response.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ streams: [] });
  const type = req.params.type;
  const id = req.params.id.replace(/\.json$/, '');
  try {
    const sosac = makeSosac(cfg);
    const streamuj = makeStreamuj(cfg);
    if (!sosac.isConfigured() || !streamuj.isConfigured()) return res.json({ streams: [] });
    const linkId = await resolveLinkId(sosac, type, id);
    if (!linkId) return res.json({ streams: [] });

    const streams = await streamuj.getStreams(linkId);
    return res.json({ streams });
  } catch (error) {
    console.error('[stream]', error.message);
    return res.json({ streams: [] });
  }
});

app.get('/:cfg/subtitles/:type/:id.json', handleSubtitles);
app.get('/:cfg/subtitles/:type/:id/:extra.json', handleSubtitles);


app.get('/health', (req, res) => res.json({
  ok: true,
  version: VERSION,
  cacheKeys: cache.keys().length,
  idMappings: idMapCache.keys().length,
  subtitleLookups: subtitleLookupCache.keys().length,
  debugStreamujRaw: DEBUG_STREAMUJ_RAW,
  mediaProxy: false,
  subtitleModeDefault: 'hybrid',
  subtitleProxy: true,
  directTest: true
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sosac addon v${VERSION} listening on port ${PORT}`);
});