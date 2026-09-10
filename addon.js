const express = require('express');
const path = require('path');
const NodeCache = require('node-cache');
const { SosacApi, movieToMeta, seriesToMeta, getLocalizedTitle, getLocalizedDescription } = require('./api/sosac');
const { StreamujApi } = require('./api/streamuj');

const app = express();
const PORT = process.env.PORT || 7000;
const VERSION = '0.3.3';
const DEBUG_STREAMUJ_RAW = process.env.DEBUG_STREAMUJ_RAW === '1';
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.path.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
      moviePopular: '🔥 Sosáč – Oblíbené',
      movieRecent: '🆕 Sosáč – Nové',
      movieRated: '⭐ Sosáč – Nejlépe hodnocené',
      movieDub: '🎙️ Sosáč – S dabingem',
      movieSubs: '💬 Sosáč – S titulky',
      movieSearch: '🔎 Sosáč – Hledat',
      seriesPopular: '🔥 Sosáč – Oblíbené',
      seriesRecent: '🆕 Sosáč – Nové',
      seriesRated: '⭐ Sosáč – Nejlépe hodnocené',
      seriesDub: '🎙️ Sosáč – S dabingem',
      seriesSubs: '💬 Sosáč – S titulky',
      seriesSearch: '🔎 Sosáč – Hledat'
    },
    sk: {
      name: 'Sosáč CZ/SK',
      moviePopular: '🔥 Sosáč – Obľúbené',
      movieRecent: '🆕 Sosáč – Nové',
      movieRated: '⭐ Sosáč – Najlepšie hodnotené',
      movieDub: '🎙️ Sosáč – S dabingom',
      movieSubs: '💬 Sosáč – S titulkami',
      movieSearch: '🔎 Sosáč – Hľadať',
      seriesPopular: '🔥 Sosáč – Obľúbené',
      seriesRecent: '🆕 Sosáč – Nové',
      seriesRated: '⭐ Sosáč – Najlepšie hodnotené',
      seriesDub: '🎙️ Sosáč – S dabingom',
      seriesSubs: '💬 Sosáč – S titulkami',
      seriesSearch: '🔎 Sosáč – Hľadať'
    },
    en: {
      name: 'Sosac CZ/SK',
      moviePopular: '🔥 Sosac – Popular',
      movieRecent: '🆕 Sosac – Recently added',
      movieRated: '⭐ Sosac – Top rated',
      movieDub: '🎙️ Sosac – Dubbed',
      movieSubs: '💬 Sosac – Subtitled',
      movieSearch: '🔎 Sosac – Search',
      seriesPopular: '🔥 Sosac – Popular',
      seriesRecent: '🆕 Sosac – Recently added',
      seriesRated: '⭐ Sosac – Top rated',
      seriesDub: '🎙️ Sosac – Dubbed',
      seriesSubs: '💬 Sosac – Subtitled',
      seriesSearch: '🔎 Sosac – Search'
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
    description: 'Sosac/Streamuj addon with CZ/SK/EN metadata, audio and subtitles.',
    logo: `${host}/logo.png`,
    types: ['movie', 'series'],
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    catalogs: [
      { type: 'movie', id: 'sm-popular', name: labels.moviePopular, extra: pageExtra },
      { type: 'movie', id: 'sm-last-added', name: labels.movieRecent, extra: pageExtra },
      { type: 'movie', id: 'sm-top-rated', name: labels.movieRated, extra: pageExtra },
      { type: 'movie', id: 'sm-dubbing', name: labels.movieDub, extra: pageExtra },
      { type: 'movie', id: 'sm-subtitles', name: labels.movieSubs, extra: pageExtra },
      { type: 'movie', id: 'sm-search', name: labels.movieSearch, extra: searchExtra },
      { type: 'series', id: 'ss-popular', name: labels.seriesPopular, extra: pageExtra },
      { type: 'series', id: 'ss-last-added', name: labels.seriesRecent, extra: pageExtra },
      { type: 'series', id: 'ss-top-rated', name: labels.seriesRated, extra: pageExtra },
      { type: 'series', id: 'ss-dubbing', name: labels.seriesDub, extra: pageExtra },
      { type: 'series', id: 'ss-subtitles', name: labels.seriesSubs, extra: pageExtra },
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

function safeIsoDate(value) {
  if (value === null || value === undefined || value === '') return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.warn('[meta] Přeskakuji neplatné datum epizody:', value);
    return undefined;
  }

  return date.toISOString();
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
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw) && !raw.includes('defaultnis')) return raw;
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
      const metas = (Array.isArray(items) ? items : []).map(item => movieToMeta(item, cfg.uiLanguage)).filter(Boolean);
      const payload = { metas };
      cache.set(cacheKey, payload, 180);
      return res.json(payload);
    }

    if (type === 'series') {
      if (id === 'ss-search') {
        items = await sosac.searchSeries(extra.search, page);
        const metas = (Array.isArray(items) ? items : []).map(item => seriesToMeta(item, cfg.uiLanguage)).filter(Boolean);
        const payload = { metas };
        cache.set(cacheKey, payload, 180);
        return res.json(payload);
      }

      if (SERIES_EPISODE_MAP[id]) {
        items = await sosac.getEpisodes(SERIES_EPISODE_MAP[id], page);
        const metas = (Array.isArray(items) ? items : []).map(item => episodeToCatalogMeta(item, cfg.uiLanguage)).filter(Boolean);
        const payload = { metas };
        cache.set(cacheKey, payload, 180);
        return res.json(payload);
      }

      if (SERIES_MAP[id]) items = await sosac.getSeries(SERIES_MAP[id], page);
      const metas = (Array.isArray(items) ? items : []).map(item => seriesToMeta(item, cfg.uiLanguage)).filter(Boolean);
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
app.get('/configure', (req, res) => res.sendFile(path.join(__dirname, 'public', 'configure.html')));

app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id: 'cz.caseycz.stremio.sosac',
    version: VERSION,
    name: 'Sosáč CZ/SK',
    description: `Configure at ${getHost(req)}/configure`,
    types: [], resources: [], catalogs: [],
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
  const id = req.params.id.replace(/\.json$/, '');

  try {
    const sosac = makeSosac(cfg);

    if (req.params.type === 'movie' && id.startsWith('sosac_m_')) {
      const item = await sosac.getMovie(id.slice('sosac_m_'.length));
      return res.json({ meta: movieToMeta(item, cfg.uiLanguage) });
    }

    if (req.params.type === 'series' && id.startsWith('sosac_s_')) {
      const detail = await sosac.getSeriesDetail(id.slice('sosac_s_'.length));
      const info = detail && detail.info ? detail.info : detail;
      const meta = seriesToMeta(info, cfg.uiLanguage);
      if (meta) meta.videos = buildSeriesVideos(detail, cfg.uiLanguage);
      return res.json({ meta });
    }

    if (req.params.type === 'series' && id.startsWith('sosac_ep_')) {
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
  const id = req.params.id.replace(/\.json$/, '');

  try {
    const sosac = makeSosac(cfg);
    const streamuj = makeStreamuj(cfg);
    if (!sosac.isConfigured() || !streamuj.isConfigured()) return res.json({ streams: [] });

    let linkId = null;

    if (req.params.type === 'movie' && id.startsWith('sosac_m_')) {
      const item = await sosac.getMovie(id.slice('sosac_m_'.length));
      linkId = item && item.l;
    }

    if (req.params.type === 'series' && id.startsWith('sosac_ep_')) {
      const episode = await sosac.getEpisode(id.slice('sosac_ep_'.length));
      linkId = episode && episode.l;
    }

    if (!linkId) return res.json({ streams: [] });

    const streams = await streamuj.getStreams(linkId, {
      localSubtitleConversion: true
    });

    return res.json({ streams });
  } catch (error) {
    console.error('[stream]', error.message);
    return res.json({ streams: [] });
  }
});

app.get('/:cfg/subtitles/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ subtitles: [] });
  return res.json({ subtitles: [] });
});

app.get('/health', (req, res) => res.json({
  ok: true,
  version: VERSION,
  cacheKeys: cache.keys().length,
  debugStreamujRaw: DEBUG_STREAMUJ_RAW
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sosac addon v${VERSION} listening on port ${PORT}`);
});
