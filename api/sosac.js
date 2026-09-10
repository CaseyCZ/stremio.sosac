const axios = require('axios');
const crypto = require('crypto');

const DEFAULT_DOMAIN = 'kodi-api.sosac.to';
const HTTP_TIMEOUT = 15000;

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

function moviePoster(item) {
  const direct = validHttpUrl(item && (item.ie || item.i));
  if (direct && !direct.includes('defaultnis')) return direct;
  return item && item._id
    ? `https://movies.sosac.tv/images/75x109/movie-${item._id}.jpg`
    : undefined;
}

function seriesPoster(item) {
  const direct = validHttpUrl(item && (item.i || item.ie));
  if (direct && !direct.includes('defaultnis')) return direct;
  return item && item._id
    ? `https://movies.sosac.tv/images/558x313/serial-${item._id}.jpg`
    : undefined;
}

function numberOrUndefined(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function movieToMeta(item, language = 'cs') {
  if (!item || item._id === undefined || item._id === null) return null;
  const name = getLocalizedTitle(item, language);
  if (!name) return null;

  const year = numberOrUndefined(item.y);
  const rating = numberOrUndefined(item.m);
  const durationSeconds = numberOrUndefined(item.dl);

  return {
    id: `sosac_m_${item._id}`,
    type: 'movie',
    name,
    poster: moviePoster(item),
    background: validHttpUrl(item.b),
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
  const rating = numberOrUndefined(item.m);

  return {
    id: `sosac_s_${item._id}`,
    type: 'series',
    name,
    poster: seriesPoster(item),
    background: validHttpUrl(item.b),
    description: getLocalizedDescription(item, language),
    releaseInfo: year ? String(Math.trunc(year)) : undefined,
    year: year ? Math.trunc(year) : undefined,
    imdbRating: rating !== undefined ? rating.toFixed(1) : undefined,
    genres: Array.isArray(item.g) ? item.g.filter(Boolean) : []
  };
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
    const response = await this.http.get(`${this.baseUrl}/${path.replace(/^\/+/, '')}`, {
      params: { ...params, ...this.authParams() }
    });
    return response.data;
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
  seriesToMeta
};
