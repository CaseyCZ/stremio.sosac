const express = require('express');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 7000;
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
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

function buildManifest(cfg, host) {
  const uiLanguage = ['cs', 'sk', 'en'].includes(cfg.uiLanguage) ? cfg.uiLanguage : 'cs';
  const labels = {
    cs: { name: 'Sosáč CZ/SK', movies: 'Sosáč – Filmy', series: 'Sosáč – Seriály' },
    sk: { name: 'Sosáč CZ/SK', movies: 'Sosáč – Filmy', series: 'Sosáč – Seriály' },
    en: { name: 'Sosac CZ/SK', movies: 'Sosac – Movies', series: 'Sosac – Series' }
  }[uiLanguage];

  return {
    id: 'cz.caseycz.stremio.sosac',
    version: '0.1.0',
    name: labels.name,
    description: 'Configurable Sosac/Streamuj Stremio addon with CZ/SK/EN metadata, audio and subtitle preferences.',
    logo: `${host}/logo.png`,
    types: ['movie', 'series'],
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    catalogs: [
      { type: 'movie', id: 'sosac-movies', name: labels.movies, extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
      { type: 'series', id: 'sosac-series', name: labels.series, extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] }
    ],
    behaviorHints: { configurable: true, configurationRequired: true }
  };
}

app.get('/', (req, res) => res.redirect('/configure'));
app.get('/configure', (req, res) => res.sendFile(path.join(__dirname, 'public', 'configure.html')));

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'cz.caseycz.stremio.sosac',
    version: '0.1.0',
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

app.get('/:cfg/catalog/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ metas: [] });
  // TODO: Sosac catalog implementation.
  return res.json({ metas: [] });
});

app.get('/:cfg/catalog/:type/:id/:extra.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ metas: [] });
  // TODO: Sosac search/pagination implementation.
  return res.json({ metas: [] });
});

app.get('/:cfg/meta/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ meta: null });
  // TODO: Cinemeta + CZ/SK/EN metadata overlay.
  return res.json({ meta: null });
});

app.get('/:cfg/stream/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ streams: [] });
  // TODO: Sosac/Streamuj stream resolver respecting cfg.audioLanguages.
  return res.json({ streams: [] });
});

app.get('/:cfg/subtitles/:type/:id.json', async (req, res) => {
  const cfg = decodeConfig(req.params.cfg);
  if (!cfg) return res.json({ subtitles: [] });
  // TODO: Return external subtitles respecting cfg.subtitleLanguages.
  // Direct subtitle URLs can later use Stremio local conversion where supported.
  return res.json({ subtitles: [] });
});

app.get('/health', (req, res) => res.json({ ok: true, cacheKeys: cache.keys().length }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sosac addon listening on port ${PORT}`);
});
