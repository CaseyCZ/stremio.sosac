const axios = require('axios');
const crypto = require('crypto');
const NodeCache = require('node-cache');

const DEFAULT_DOMAIN = 'kodi-api.sosac.to';
const HTTP_TIMEOUT = 15000;

// Sdílená RAM cache pro všechny requesty a všechny instance SosacApi.
// Zabraňuje tomu, aby Stremio při současném načítání meta/stream/subtitles
// volalo stejné Sosáč endpointy několikrát.
const responseCache = new NodeCache({
  stdTTL: 600,
  checkperiod: 60,
  maxKeys: 1500,
  useClones: true
});
const pendingRequests = new Map();

function sosacHash(username, password) {
  const step1 = crypto.createHash('md5').update(`${username}:${password}`).digest('hex');
  return crypto.createHash('md5').update(step1 + 'EWs5yVD4QF2sshGm22EWVa').digest('hex');
}

function normalizeLanguage(value) {
  return ['cs', 'sk', 'en'].includes(value) ? value : 'cs';
}

function firstText(value) {
  if (Array.isArray(value)) return value.find(Boolean) || '';
  return typeof value === 'string' ? value : '';
}

function getLocalizedTitle(item, language = 'cs') {
  const names = item && item.n;
  if (typeof names === 'string') return names;
  if (!names || typeof names !== 'object') return '';

  const lang = normalizeLanguage(language);
  const fallbackOrder = lang === 'sk'
    ? ['sk', 'cs', 'en']
    : lang === 'en'
      ? ['en', 'cs', 'sk']
      : ['cs', 'sk', 'en'];

  for (const key of fallbackOrder) {
    const text = firstText(names[key]);
    if (text) return text;
  }
  return '';
}

function getLocalizedDescription(item, language = 'cs') {
  if (!item) return '';
  if (typeof item.p === 'string') return item.p;
  if (item.p && typeof item.p === 'object') {
    const lang = normalizeLanguage(language);
    const fallbackOrder = lang === 'sk'
      ? ['sk', 'cs', 'en']
      : lang === 'en'
        ? ['en', 'cs', 'sk']
        : ['cs', 'sk', 'en'];
    for (const key of fallbackOrder) {
      const text = firstText(item.p[key]);
      if (text) return text;
    }
  }
  return '';
}

function validHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined;
}

function firstArtworkUrl(...values) {
  for (const value of values) {
    if (!value) continue;

    if (typeof value === 'string') {
      const url = validHttpUrl(value);
      if (url && !url.includes('defaultnis')) return url;
      continue;
    }

    if (Array.isArray(value)) {
      const nested = firstArtworkUrl(...value);
      if (nested) return nested;
      continue;
    }

    if (typeof value === 'object') {
      const preferred = [
        value.poster, value.image, value.original, value.large,
        value.medium, value.small, value.url, value.src
      ];
      const nested = firstArtworkUrl(...preferred, ...Object.values(value));
      if (nested) return nested;
    }
  }

  return undefined;
}

function simpleArtworkToken(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || /^https?:\/\//i.test(text) || /defaultnis/i.test(text)) return '';
  if (/[\\/]/.test(text)) return '';
  return text;
}

function buildSosacImageUrl(kind, item) {
  const token = simpleArtworkToken(item && item.i);
  const fallbackId = item && item._id !== undefined && item._id !== null
    ? String(item._id)
    : '';
  let id = token || fallbackId;
  if (!id) return undefined;

  id = id.replace(/^movie-/i, '').replace(/^serial-/i, '');
  if (!/\.[a-z0-9]{2,5}$/i.test(id)) id += '.jpg';

  return kind === 'series'
    ? `https://movies.sosac.tv/images/558x313/serial-${id}`
    : `https://movies.sosac.tv/images/75x109/movie-${id}`;
}

function moviePoster(item) {
  const direct = firstArtworkUrl(
    item && item.ie,
    item && item.i,
    item && item.poster,
    item && item.image,
    item && item.thumbnail,
    item && item.thumb
  );
  return direct || buildSosacImageUrl('movie', item);
}

function seriesPoster(item) {
  const direct = firstArtworkUrl(
    item && item.i,
    item && item.ie,
    item && item.poster,
    item && item.image,
    item && item.thumbnail,
    item && item.thumb
  );
  return direct || buildSosacImageUrl('series', item);
}

function itemBackground(item) {
  return firstArtworkUrl(
    item && item.b,
    item && item.background,
    item && item.backdrop,
    item && item.fanart
  );
}

function numberOrUndefined(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeRating(value) {
  const rating = numberOrUndefined(value);
  if (rating === undefined || rating < 0 || rating > 100) return undefined;
  if (rating > 10) return rating / 10;
  return rating;
}

// V official Kodi Sosáči je r = rating a m = IMDb.
// Kvůli kompatibilitě s novějšími odpověďmi ponecháváme m jako nouzový rating
// jen tehdy, když vypadá skutečně jako hodnocení (0–100), nikoli jako IMDb ID.
function ratingFromItem(item) {
  const fromR = normalizeRating(item && item.r);
  if (fromR !== undefined) return fromR;

  const rawM = numberOrUndefined(item && item.m);
  if (rawM !== undefined && rawM >= 0 && rawM <= 100) return normalizeRating(rawM);
  return undefined;
}

function movieToMeta(item, language = 'cs') {
  if (!item || item._id === undefined || item._id === null) return null;
  const name = getLocalizedTitle(item, language);
  if (!name) return null;

  const year = numberOrUndefined(item.y);
  const rating = ratingFromItem(item);
  const durationSeconds = numberOrUndefined(item.dl);

  return {
    id: `sosac_m_${item._id}`,
    type: 'movie',
    name,
    poster: moviePoster(item),
    background: itemBackground(item),
    description: getLocalizedDescription(item, language),
    releaseInfo: year ? String(Math.trunc(year)) : undefined,
    year: year ? Math.trunc(year) : undefined,
    runtime: durationSeconds ? `${Math.max(1, Math.round(durationSeconds / 60))} min` : undefined,
    imdbRating: rating !== undefined ? rating.toFixed(1) : undefined,
    genres: Array.isArray(item.g) ? item.g.filter(Boolean) : [],
    cast: Array.isArray(item.f) ? item.f.filter(Boolean) : [],
    director: Array.isArray(item.s) ? item.s.filter(Boolean).join(', ') : firstText(item.s) || undefined,
    behaviorHints: { defaultVideoId: `sosac_m_${item._id}` }
  };
}

function seriesToMeta(item, language = 'cs') {
  if (!item || item._id === undefined || item._id === null) return null;
  const name = getLocalizedTitle(item, language);
  if (!name) return null;

  const year = numberOrUndefined(item.y);
  const rating = ratingFromItem(item);

  return {
    id: `sosac_s_${item._id}`,
    type: 'series',
    name,
    poster: seriesPoster(item),
    background: itemBackground(item),
    description: getLocalizedDescription(item, language),
    releaseInfo: year ? String(Math.trunc(year)) : undefined,
    year: year ? Math.trunc(year) : undefined,
    imdbRating: rating !== undefined ? rating.toFixed(1) : undefined,
    genres: Array.isArray(item.g) ? item.g.filter(Boolean) : []
  };
}

function cacheTtlForPath(path) {
  if (/\/(?:simple-search)$/i.test(path)) return 30 * 60;
  if (/\/(?:lists)\//i.test(path)) return 15 * 60;
  if (/^(?:movies|serials|episodes)\//i.test(path)) return 10 * 60;
  return 5 * 60;
}

function requestCacheKey(domain, username, passwordHash, path, params) {
  return crypto.createHash('sha256').update(JSON.stringify([
    domain,
    username,
    passwordHash,
    path,
    params
  ])).digest('hex');
}

class SosacApi {
  constructor(options = {}) {
    this.username = String(options.username || '').trim();
    this.password = String(options.password || '');
    this.domain = options.domain || DEFAULT_DOMAIN;
    this.baseUrl = `https://${this.domain}`;
    this.passwordHash = this.username && this.password
      ? sosacHash(this.username, this.password)
      : '';

    this.http = axios.create({
      timeout: HTTP_TIMEOUT,
      maxContentLength: 4 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Stremio Sosac Addon)',
        Accept: 'application/json, text/plain, */*'
      }
    });
  }

  isConfigured() {
    return Boolean(this.username && this.passwordHash);
  }

  authParams() {
    if (!this.isConfigured()) throw new Error('Sosac credentials are missing');
    return { username: this.username, password: this.passwordHash };
  }

  async get(path, params = {}) {
    const cleanPath = path.replace(/^\/+/, '');
    const key = requestCacheKey(
      this.domain,
      this.username,
      this.passwordHash,
      cleanPath,
      params
    );

    const cached = responseCache.get(key);
    if (cached !== undefined) return cached;

    const existing = pendingRequests.get(key);
    if (existing) return existing;

    const pending = this.http.get(`${this.baseUrl}/${cleanPath}`, {
      params: { ...params, ...this.authParams() }
    }).then(response => {
      const data = response.data;
      responseCache.set(key, data, cacheTtlForPath(cleanPath));
      return data;
    }).finally(() => {
      if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
    });

    pendingRequests.set(key, pending);
    return pending;
  }

  async getMovies(listType = 'popular', page = 1, pageSize = 100) {
    return this.get(`movies/lists/${listType}`, {
      pocet: pageSize,
      stranka: Math.max(1, Number(page) || 1)
    });
  }

  async getSeries(listType = 'popular', page = 1, pageSize = 100) {
    return this.get(`serials/lists/${listType}`, {
      pocet: pageSize,
      stranka: Math.max(1, Number(page) || 1)
    });
  }

  async getEpisodes(listType = 'last-added', page = 1, pageSize = 100) {
    return this.get(`episodes/lists/${listType}`, {
      pocet: pageSize,
      stranka: Math.max(1, Number(page) || 1)
    });
  }

  async searchMovies(query, page = 1, pageSize = 100) {
    if (!String(query || '').trim()) return [];
    return this.get('movies/simple-search', {
      q: String(query).trim(),
      pocet: pageSize,
      stranka: Math.max(1, Number(page) || 1)
    });
  }

  async searchSeries(query, page = 1, pageSize = 100) {
    if (!String(query || '').trim()) return [];
    return this.get('serials/simple-search', {
      q: String(query).trim(),
      pocet: pageSize,
      stranka: Math.max(1, Number(page) || 1)
    });
  }

  async getMovie(id) {
    return this.get(`movies/${encodeURIComponent(id)}`);
  }

  async getSeriesDetail(id) {
    return this.get(`serials/${encodeURIComponent(id)}`);
  }

  async getEpisode(id) {
    return this.get(`episodes/${encodeURIComponent(id)}`);
  }
}

module.exports = {
  SosacApi,
  getLocalizedTitle,
  getLocalizedDescription,
  movieToMeta,
  seriesToMeta,
  moviePoster,
  seriesPoster,
  itemBackground,
  firstArtworkUrl
};
