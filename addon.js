const express = require('express');
const path = require('path');
const NodeCache = require('node-cache');
const { SosacApi, movieToMeta, seriesToMeta } = require('./api/sosac');

const app = express();
const PORT = process.env.PORT || 7000;
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', req.path.endsWith('.json') ? 'application/json; charset=utf-8' : res.getHeader('Content-Type'));
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
      movieRecent: '🆕 Sosáč – Nové filmy',
      movieRated: '⭐ Sosáč – Nejlépe hodnocené filmy',
      movieDub: '🎙️ Sosáč – Filmy s dabingem',
      movieSubs: '💬 Sosáč – Filmy s titulky',
      movieSearch: '🔎 Sosáč – Hledat filmy',
      seriesPopular: '🔥 Sosáč – Oblíbené seriály',
      seriesRecent: '🆕 Sosáč – Nové seriály',
      seriesRated: '⭐ Sosáč – Nejlépe hodnocené seriály',
      seriesDub: '🎙️ Sosáč – Seriály s dabingem',
      seriesSearch: '🔎 Sosáč – Hledat seriály'
    },
    sk: {
      name: 'Sosáč CZ/SK',
      moviePopular: '🔥 Sosáč – Obľúbené filmy',
      movieRecent: '🆕 Sosáč – Nové filmy',
      movieRated: '⭐ Sosáč – Najlepšie hodnotené filmy',
      movieDub: '🎙️ Sosáč – Filmy s dabingom',
      movieSubs: '💬 Sosáč – Filmy s titulkami',
      movieSearch: '🔎 Sosáč – Hľadať filmy',
      seriesPopular: '🔥 Sosáč – Obľúbené seriály',
      seriesRecent: '🆕 Sosáč – Nové seriály',
      seriesRated: '⭐ Sosáč – Najlepšie hodnotené seriály',
      seriesDub: '🎙️ Sosáč – Seriály s dabingom',
      seriesSearch: '🔎 Sosáč – Hľadať seriály'
    },
    en: {
      name: 'Sosac CZ/SK',
      moviePopular: '🔥 Sosac – Popular movies',
      movieRecent: '🆕 Sosac – Recently added movies',
      movieRated: '⭐ Sosac – Top rated movies',
      movieDub: '🎙️ Sosac – Dubbed movies',
      movieSubs: '💬 Sosac – Movies with subtitles',
      movieSearch: '🔎 Sosac – Search movies',
      seriesPopular: '🔥 Sosac – Popular series',
      seriesRecent: '🆕 Sosac – Recently added series',
      seriesRated: '⭐ Sosac – Top rated series',
      seriesDub: '🎙️ Sosac – Dubbed series',
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
    version: '0.2.0',
    name: labels.name,
    description: 'Sosac/Streamuj addon with CZ/SK/EN metadata, audio and subtitle preferences.',
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
      { type: 'series', id: 'ss-search', name: labels.seriesSearch, extra: searchExtra }
    ],
    behaviorHints: { configurable: true, configurationRequired: true }
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
  'ss-top-rated': 'top-rated',
  'ss-dubbing': 'news-with-dubbing'
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
      if (id === 'ss-search') items = await sosac.searchSeries(extra.search, page);
      else if (SERIES_MAP[id]) items = await sosac.getSeries(SERIES_MAP[id], page);
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
  res.json({
    id: 'cz.caseycz.stremio.sosac',
    version: '0.2.0',
    name: 'Sosáč CZ/SK',
    description: `Configure at ${getHost(req)}/configure`,
    types: [], resources: [], catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: true }
  });
});

app.get('/:cfg/manifest.json', (req, res) => {
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
      return res.json({ meta: seriesToMeta(info, cfg.uiLanguage) });
    }
  } catch (error) {
    console.error('[meta]', error.message);
  }

  return res.json({ meta: null });
});

app.get('/:cfg/stream/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ streams: [] });
  // Next phase: Streamuj resolver + audio language sorting.
  return res.json({ streams: [] });
});

app.get('/:cfg/subtitles/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ subtitles: [] });
  // Next phase: Streamuj subtitles + Stremio local subtitle conversion where supported.
  return res.json({ subtitles: [] });
});

app.get('/health', (req, res) => res.json({ ok: true, version: '0.2.0', cacheKeys: cache.keys().length }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sosac addon v0.2.0 listening on port ${PORT}`);
});
