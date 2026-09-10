const express = require('express');
const path = require('path');
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
const VERSION = '0.4.1';
const DEBUG_STREAMUJ_RAW = process.env.DEBUG_STREAMUJ_RAW === '1';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const idMapCache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 10 * 60 });
const cinemeta = new CinemetaApi();

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.path.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});

function decodeConfig(value) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function getHost(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function labelsFor(language) {
  const lang = ['cs', 'sk', 'en'].includes(language) ? language : 'cs';

  return {
    cs: {
      name: 'Sosáč CZ/SK',
      moviePopular: '🔥 Sosáč – Oblíbené filmy',
      seriesPopular: '🔥 Sosáč – Oblíbené seriály',
      movieRecent: '🆕 Sosáč – Nové filmy',
      seriesRecent: '🆕 Sosáč – Nové seriály',
      movieRated: '⭐ Sosáč – Nejlépe hodnocené filmy',
      seriesRated: '⭐ Sosáč – Nejlépe hodnocené seriály',
      movieDub: '🎙️ Sosáč – S dabingem filmy',
      seriesDub: '🎙️ Sosáč – S dabingem seriály',
      movieSubs: '💬 Sosáč – S titulky filmy',
      seriesSubs: '💬 Sosáč – S titulky seriály',
      movieSearch: '🔎 Sosáč – Hledat filmy',
      seriesSearch: '🔎 Sosáč – Hledat seriály'
    },
    sk: {
      name: 'Sosáč CZ/SK',
      moviePopular: '🔥 Sosáč – Obľúbené filmy',
      seriesPopular: '🔥 Sosáč – Obľúbené seriály',
      movieRecent: '🆕 Sosáč – Nové filmy',
      seriesRecent: '🆕 Sosáč – Nové seriály',
      movieRated: '⭐ Sosáč – Najlepšie hodnotené filmy',
      seriesRated: '⭐ Sosáč – Najlepšie hodnotené seriály',
      movieDub: '🎙️ Sosáč – S dabingom filmy',
      seriesDub: '🎙️ Sosáč – S dabingom seriály',
      movieSubs: '💬 Sosáč – S titulkami filmy',
      seriesSubs: '💬 Sosáč – S titulkami seriály',
      movieSearch: '🔎 Sosáč – Hľadať filmy',
      seriesSearch: '🔎 Sosáč – Hľadať seriály'
    },
    en: {
      name: 'Sosac CZ/SK',
      moviePopular: '🔥 Sosac – Popular movies',
      seriesPopular: '🔥 Sosac – Popular series',
      movieRecent: '🆕 Sosac – Recently added movies',
      seriesRecent: '🆕 Sosac – Recently added series',
      movieRated: '⭐ Sosac – Top rated movies',
      seriesRated: '⭐ Sosac – Top rated series',
      movieDub: '🎙️ Sosac – Dubbed movies',
      seriesDub: '🎙️ Sosac – Dubbed series',
      movieSubs: '💬 Sosac – Subtitled movies',
      seriesSubs: '💬 Sosac – Subtitled series',
      movieSearch: '🔎 Sosac – Search movies',
      seriesSearch: '🔎 Sosac – Search series'
    }
  }[lang];
}

function buildManifest(cfg, host) {
  const labels = labelsFor(cfg.uiLanguage);
  const searchExtra = [{ name: 'search', isRequired: true }];
  const pageExtra = [{ name: 'skip', isRequired: false }];

  return {
    id: 'cz.caseycz.stremio.sosac',
    version: VERSION,
    name: labels.name,
    description: 'Cinemeta metadata + Sosáč/Streamuj CZ/SK streamy a titulky.',
    logo: `${host}/logo.png`,
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'sosac_m_', 'sosac_s_', 'sosac_ep_'],
    resources: ['catalog', 'meta', 'stream', 'subtitles'],

    // Pořadí je záměrně po dvojicích: nejdřív filmy, hned za nimi seriály.
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
  'sm-popular': 'popular',
  'sm-last-added': 'last-added',
  'sm-top-rated': 'top-rated',
  'sm-dubbing': 'news-with-dubbing',
  'sm-subtitles': 'news-with-subtitles'
};

const SERIES_MAP = {
  'ss-popular': 'popular',
  'ss-last-added': 'last-added',
  'ss-top-rated': 'top-rated'
};

// Sosáč tyto dva seriálové seznamy vrací jako seznam epizod,
// nikoli jako seznam seriálů. Je to stejné chování jako Kodi addon.
const SERIES_EPISODE_MAP = {
  'ss-dubbing': 'news-with-dubbing',
  'ss-subtitles': 'news-with-subtitles'
};

function parseExtra(extraRaw) {
  const result = {};
  if (!extraRaw) return result;

  extraRaw.replace(/\.json$/, '').split('&').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) result[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  });

  return result;
}

function makeSosac(cfg) {
  return new SosacApi({
    username: cfg.sosacUser,
    password: cfg.sosacPass,
    domain: cfg.sosacDomain
  });
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

  const order = language === 'sk'
    ? ['sk', 'cs', 'en']
    : language === 'en'
      ? ['en', 'cs', 'sk']
      : ['cs', 'sk', 'en'];

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
    else if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) add(nested);
    }
  };

  add(item.n);
  if (item.originalName) add(item.originalName);
  if (item.title) add(item.title);
  return uniqueStrings(values);
}

function episodeSeriesTitles(item) {
  if (!item) return [];
  const values = [];

  if (item.ne) {
    if (typeof item.n === 'object') {
      for (const v of Object.values(item.n)) {
        if (Array.isArray(v)) values.push(...v);
        else values.push(v);
      }
    } else {
      values.push(item.n);
    }
  } else {
    values.push(item.t);
    if (item.seriesTitle) values.push(item.seriesTitle);
    if (item.show) values.push(item.show);
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

  const releaseInfo = String(meta && meta.releaseInfo || '');
  const match = releaseInfo.match(/\b(18|19|20|21)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function sosacCandidateScore(item, wantedTitles, year) {
  const candidateTitles = uniqueStrings([
    getLocalizedTitle(item, 'cs'),
    getLocalizedTitle(item, 'sk'),
    getLocalizedTitle(item, 'en'),
    ...allLocalizedTitles(item)
  ]);

  let score = 0;

  for (const wanted of wantedTitles) {
    for (const candidate of candidateTitles) {
      score = Math.max(score, titleScore(wanted, candidate));
    }
  }

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
      results = type === 'movie'
        ? await sosac.searchMovies(title, 1, 100)
        : await sosac.searchSeries(title, 1, 100);
    } catch (error) {
      console.warn(`[resolve] Sosáč search "${title}" selhal: ${error.message}`);
      continue;
    }

    if (!Array.isArray(results)) continue;

    for (const item of results) {
      const score = sosacCandidateScore(item, wantedTitles, year);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }

    if (bestScore >= 1.05) break;
  }

  if (!best || bestScore < 0.55) {
    console.warn(`[resolve] Sosáč ${type}: shoda nenalezena pro ${wantedTitles.join(' | ')}`);
    return null;
  }

  console.log(
    `[resolve] Sosáč ${type}: "${getLocalizedTitle(best, 'cs') || getLocalizedTitle(best, 'en')}" ` +
    `(score=${bestScore.toFixed(2)}, id=${best._id})`
  );

  return best;
}

function cinemetaTitles(meta) {
  return uniqueStrings([
    meta && meta.name,
    meta && meta.originalName,
    ...(Array.isArray(meta && meta.nameTranslations) ? meta.nameTranslations : [])
  ]);
}

function mergeCinemetaMeta(meta, sosacItem, language) {
  if (!meta) return null;

  const localizedName = sosacItem ? getLocalizedTitle(sosacItem, language) : '';
  const localizedDescription = sosacItem
    ? getLocalizedDescription(sosacItem, language)
    : '';

  return {
    ...meta,
    id: String(meta.id || '').toLowerCase(),
    name: localizedName || meta.name,
    description: localizedDescription || meta.description
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

  if (item && item.ne) {
    show = firstLocalized(item.n, language);
    name = firstLocalized(item.ne, language);
  } else {
    name = firstLocalized(item && item.n, language);
    show = firstLocalized(item && item.t, language);
  }

  const s = String(item && item.s !== undefined ? item.s : '').padStart(2, '0');
  const e = String(item && item.ep !== undefined ? item.ep : '').padStart(2, '0');
  const se = s && e ? `${s}x${e}` : '';

  if (show && se && name) return `${show}: ${se} - ${name}`;
  if (show && se) return `${show}: ${se}`;
  if (se && name) return `${se} - ${name}`;
  return show || name || 'Epizoda';
}

function episodePoster(item) {
  const raw = item && item.i;

  if (Array.isArray(raw)) {
    const found = raw.find(v => typeof v === 'string' && /^https?:\/\//i.test(v));
    if (found) return found;
  }

  if (
    typeof raw === 'string' &&
    /^https?:\/\//i.test(raw) &&
    !raw.includes('defaultnis')
  ) {
    return raw;
  }

  return undefined;
}

function episodeToCatalogMeta(item, language = 'cs') {
  if (!item || item._id === undefined || item._id === null) return null;

  const id = `sosac_ep_${item._id}`;
  const season = Number(item.s);
  const episode = Number(item.ep);
  const title = episodeTitle(item, language);

  return {
    id,
    type: 'series',
    name: title,
    poster: episodePoster(item),
    description: getLocalizedDescription(item, language),
    behaviorHints: { defaultVideoId: id },
    videos: [{
      id,
      title,
      season: Number.isFinite(season) ? season : 0,
      episode: Number.isFinite(episode) ? episode : 0,
      thumbnail: episodePoster(item)
    }]
  };
}

function buildSeriesVideos(detail, uiLanguage) {
  if (!detail || typeof detail !== 'object') return [];
  const videos = [];

  const seasonKeys = Object.keys(detail)
    .filter(key => key !== 'info' && /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b));

  for (const seasonKey of seasonKeys) {
    const seasonData = detail[seasonKey];
    if (!seasonData || typeof seasonData !== 'object') continue;

    const episodeKeys = Object.keys(seasonData)
      .filter(key => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));

    for (const episodeKey of episodeKeys) {
      const episode = seasonData[episodeKey];
      if (!episode || episode._id === undefined || episode._id === null) continue;

      videos.push({
        id: `sosac_ep_${episode._id}`,
        title: getLocalizedTitle(episode, uiLanguage) || `S${seasonKey}E${episodeKey}`,
        season: Number(seasonKey),
        episode: Number(episodeKey),
        released: safeIsoDate(episode.r),
        overview: getLocalizedDescription(episode, uiLanguage) || '',
        thumbnail: episode.ie || episode.i || undefined
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

      try {
        result[index] = await mapper(source[index], index);
      } catch (error) {
        console.warn('[catalog] Cinemeta mapping selhal:', error.message);
        result[index] = null;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, source.length) }, () => worker())
  );

  return result.filter(Boolean);
}

function rememberMapping(type, sosacItem, imdbId) {
  if (
    !sosacItem ||
    sosacItem._id === undefined ||
    sosacItem._id === null ||
    !/^tt\d{5,10}$/i.test(String(imdbId || ''))
  ) {
    return;
  }

  const id = String(imdbId).toLowerCase();
  idMapCache.set(`s2i:${type}:${sosacItem._id}`, id);
  idMapCache.set(`i2s:${type}:${id}`, String(sosacItem._id));
}

async function resolveSosacCatalogItem(type, item, cfg) {
  if (!item) return null;

  const mapKey = item._id !== undefined && item._id !== null
    ? `s2i:${type}:${item._id}`
    : null;

  let imdbId = extractImdbId(item);
  if (!imdbId && mapKey) imdbId = idMapCache.get(mapKey) || null;

  let meta = null;

  if (imdbId) {
    meta = await cinemeta.getMeta(type, imdbId);
  }

  if (!meta) {
    meta = await cinemeta.resolveByTitle(type, allLocalizedTitles(item), itemYear(item));
    imdbId = meta && meta.id;
  }

  if (!meta || !/^tt\d{5,10}$/i.test(String(meta.id || ''))) {
    return type === 'movie'
      ? movieToMeta(item, cfg.uiLanguage)
      : seriesToMeta(item, cfg.uiLanguage);
  }

  rememberMapping(type, item, meta.id);
  return catalogMetaFromCinemeta(meta, item, cfg.uiLanguage);
}

async function resolveEpisodeCatalogItem(item, cfg) {
  const season = Number(item && item.s);
  const episode = Number(item && item.ep);
  const titles = episodeSeriesTitles(item);

  if (!titles.length || !Number.isFinite(season) || !Number.isFinite(episode)) {
    return episodeToCatalogMeta(item, cfg.uiLanguage);
  }

  const meta = await cinemeta.resolveByTitle('series', titles, itemYear(item));
  if (!meta || !/^tt\d{5,10}$/i.test(String(meta.id || ''))) {
    return episodeToCatalogMeta(item, cfg.uiLanguage);
  }

  const base = catalogMetaFromCinemeta(meta, null, cfg.uiLanguage);
  if (!base) return episodeToCatalogMeta(item, cfg.uiLanguage);

  return {
    ...base,
    id: String(meta.id).toLowerCase(),
    name: episodeTitle(item, cfg.uiLanguage),
    behaviorHints: {
      ...(base.behaviorHints || {}),
      defaultVideoId: `${String(meta.id).toLowerCase()}:${season}:${episode}`
    }
  };
}

async function resolveSosacForImdb(sosac, type, imdbId) {
  const id = String(imdbId || '').toLowerCase();
  if (!/^tt\d{5,10}$/.test(id)) return null;

  const reverseKey = `i2s:${type}:${id}`;
  const cachedSosacId = idMapCache.get(reverseKey);

  if (cachedSosacId) {
    try {
      return type === 'movie'
        ? await sosac.getMovie(cachedSosacId)
        : {
            ...(await sosac.getSeriesDetail(cachedSosacId)),
            _resolvedSosacId: cachedSosacId
          };
    } catch (error) {
      idMapCache.del(reverseKey);
      console.warn(`[resolve] Cache ${reverseKey} neplatná: ${error.message}`);
    }
  }

  const meta = await cinemeta.getMeta(type, id);
  if (!meta) return null;

  const match = await findBestSosacMatch(
    sosac,
    type,
    cinemetaTitles(meta),
    candidateYear(meta)
  );

  if (!match || match._id === undefined || match._id === null) return null;

  rememberMapping(type, match, id);

  if (type === 'movie') {
    try {
      return await sosac.getMovie(match._id);
    } catch {
      return match;
    }
  }

  const detail = await sosac.getSeriesDetail(match._id);
  if (detail && typeof detail === 'object') {
    detail._resolvedSosacId = String(match._id);
  }

  return detail;
}

function findEpisodeInDetail(detail, season, episode) {
  if (!detail || typeof detail !== 'object') return null;

  const seasonData = detail[String(season)];
  if (seasonData && typeof seasonData === 'object') {
    const direct = seasonData[String(episode)];
    if (direct && typeof direct === 'object') return direct;
  }

  for (const [seasonKey, value] of Object.entries(detail)) {
    if (seasonKey === 'info' || !value || typeof value !== 'object') continue;

    for (const candidate of Object.values(value)) {
      if (!candidate || typeof candidate !== 'object') continue;

      const s = Number(candidate.s);
      const e = Number(candidate.ep);
      if (s === Number(season) && e === Number(episode)) return candidate;
    }
  }

  return null;
}

async function cinemetaMetaWithLocalizedOverlay(sosac, type, imdbId, language) {
  const meta = await cinemeta.getMeta(type, imdbId);
  if (!meta) return null;

  let sosacItem = null;

  try {
    if (type === 'movie') {
      sosacItem = await resolveSosacForImdb(sosac, 'movie', imdbId);
    } else {
      const detail = await resolveSosacForImdb(sosac, 'series', imdbId);
      sosacItem = detail && detail.info ? detail.info : detail;
    }
  } catch (error) {
    console.warn(`[meta] Lokalizační overlay selhal: ${error.message}`);
  }

  return mergeCinemetaMeta(meta, sosacItem, language);
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
      if (id === 'sm-search') {
        items = await sosac.searchMovies(extra.search, page);
      } else if (MOVIE_MAP[id]) {
        items = await sosac.getMovies(MOVIE_MAP[id], page);
      }

      const metas = await mapWithConcurrency(items, 8, item =>
        resolveSosacCatalogItem('movie', item, cfg)
      );

      const payload = { metas };
      cache.set(cacheKey, payload, 180);
      return res.json(payload);
    }

    if (type === 'series') {
      if (id === 'ss-search') {
        items = await sosac.searchSeries(extra.search, page);

        const metas = await mapWithConcurrency(items, 8, item =>
          resolveSosacCatalogItem('series', item, cfg)
        );

        const payload = { metas };
        cache.set(cacheKey, payload, 180);
        return res.json(payload);
      }

      if (SERIES_EPISODE_MAP[id]) {
        const listType = SERIES_EPISODE_MAP[id];
        items = await sosac.getEpisodes(listType, page);

        console.log(
          `[catalog] ${id} → episodes/lists/${listType}: ` +
          `${Array.isArray(items) ? items.length : 0} položek`
        );

        const metas = await mapWithConcurrency(items, 8, item =>
          resolveEpisodeCatalogItem(item, cfg)
        );

        const payload = { metas };
        cache.set(cacheKey, payload, 180);
        return res.json(payload);
      }

      if (SERIES_MAP[id]) {
        items = await sosac.getSeries(SERIES_MAP[id], page);
      }

      const metas = await mapWithConcurrency(items, 8, item =>
        resolveSosacCatalogItem('series', item, cfg)
      );

      const payload = { metas };
      cache.set(cacheKey, payload, 180);
      return res.json(payload);
    }

    return res.json({ metas: [] });
  } catch (error) {
    console.error('[catalog]', error.message);
    return res.json({ metas: [] });
  }
}

app.get('/', (req, res) => res.redirect('/configure'));
app.get('/configure', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'configure.html'))
);

app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id: 'cz.caseycz.stremio.sosac',
    version: VERSION,
    name: 'Sosáč CZ/SK',
    description: `Configure at ${getHost(req)}/configure`,
    types: [],
    resources: [],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: true }
  });
});

app.get('/:cfg/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.status(400).json({ error: 'Invalid configuration' });
  return res.json(buildManifest(cfg, getHost(req)));
});

app.get('/:cfg/catalog/:type/:id.json', (req, res) =>
  handleCatalog(req, res, null)
);

app.get('/:cfg/catalog/:type/:id/:extra.json', (req, res) =>
  handleCatalog(req, res, req.params.extra)
);

app.get('/:cfg/meta/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ meta: null });

  const type = req.params.type;
  const id = req.params.id.replace(/\.json$/, '');

  try {
    const sosac = makeSosac(cfg);

    if (
      ['movie', 'series'].includes(type) &&
      /^tt\d{5,10}$/i.test(id)
    ) {
      const meta = await cinemetaMetaWithLocalizedOverlay(
        sosac,
        type,
        id.toLowerCase(),
        cfg.uiLanguage
      );
      return res.json({ meta });
    }

    if (type === 'movie' && id.startsWith('sosac_m_')) {
      const item = await sosac.getMovie(id.slice('sosac_m_'.length));
      return res.json({ meta: movieToMeta(item, cfg.uiLanguage) });
    }

    if (type === 'series' && id.startsWith('sosac_s_')) {
      const detail = await sosac.getSeriesDetail(id.slice('sosac_s_'.length));
      const info = detail && detail.info ? detail.info : detail;
      const meta = seriesToMeta(info, cfg.uiLanguage);
      if (meta) meta.videos = buildSeriesVideos(detail, cfg.uiLanguage);
      return res.json({ meta });
    }

    if (type === 'series' && id.startsWith('sosac_ep_')) {
      const episode = await sosac.getEpisode(id.slice('sosac_ep_'.length));
      return res.json({ meta: episodeToCatalogMeta(episode, cfg.uiLanguage) });
    }
  } catch (error) {
    console.error('[meta]', error.message);
  }

  return res.json({ meta: null });
});

app.get('/:cfg/stream/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ streams: [] });

  const type = req.params.type;
  const id = req.params.id.replace(/\.json$/, '');

  try {
    const sosac = makeSosac(cfg);
    const streamuj = makeStreamuj(cfg);

    if (!sosac.isConfigured() || !streamuj.isConfigured()) {
      return res.json({ streams: [] });
    }

    let linkId = null;

    if (type === 'movie' && id.startsWith('sosac_m_')) {
      const item = await sosac.getMovie(id.slice('sosac_m_'.length));
      linkId = item && item.l;
    }

    if (type === 'series' && id.startsWith('sosac_ep_')) {
      const episode = await sosac.getEpisode(id.slice('sosac_ep_'.length));
      linkId = episode && episode.l;
    }

    if (type === 'movie' && /^tt\d{5,10}$/i.test(id)) {
      const movie = await resolveSosacForImdb(sosac, 'movie', id);
      linkId = movie && movie.l;
    }

    const seriesMatch = type === 'series'
      ? id.match(/^(tt\d{5,10}):(\d+):(\d+)$/i)
      : null;

    if (seriesMatch) {
      const [, imdbId, seasonRaw, episodeRaw] = seriesMatch;
      const season = Number(seasonRaw);
      const episodeNumber = Number(episodeRaw);

      const detail = await resolveSosacForImdb(
        sosac,
        'series',
        imdbId.toLowerCase()
      );

      let episode = findEpisodeInDetail(detail, season, episodeNumber);

      if (
        episode &&
        !episode.l &&
        episode._id !== undefined &&
        episode._id !== null
      ) {
        try {
          episode = await sosac.getEpisode(episode._id);
        } catch (error) {
          console.warn(`[stream] Detail epizody ${episode._id} selhal: ${error.message}`);
        }
      }

      linkId = episode && episode.l;
    }

    if (!linkId) {
      console.warn(`[stream] Sosáč zdroj nenalezen pro ${type}/${id}`);
      return res.json({ streams: [] });
    }

    const streams = await streamuj.getStreams(linkId, {
      localSubtitleConversion: true
    });

    return res.json({ streams });
  } catch (error) {
    console.error('[stream]', error.message);
    return res.json({ streams: [] });
  }
});

// Samostatný subtitle resource bude doplněn stejnou robustní logikou,
// kterou používal původní titulkový addon. Zatím zde nic nefabrikujeme.
app.get('/:cfg/subtitles/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ subtitles: [] });
  return res.json({ subtitles: [] });
});

app.get('/health', (req, res) => res.json({
  ok: true,
  version: VERSION,
  cacheKeys: cache.keys().length,
  idMappings: idMapCache.keys().length,
  debugStreamujRaw: DEBUG_STREAMUJ_RAW
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sosac addon v${VERSION} listening on port ${PORT}`);
});
