const axios = require('axios');
const NodeCache = require('node-cache');

const BASE_URL = 'https://v3-cinemeta.strem.io';
const cache = new NodeCache({
  stdTTL: 6 * 60 * 60,
  checkperiod: 10 * 60,
  maxKeys: 4000,
  useClones: true
});
const resolveCache = new NodeCache({
  stdTTL: 12 * 60 * 60,
  checkperiod: 10 * 60,
  maxKeys: 2500,
  useClones: true
});
const pendingRequests = new Map();

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleScore(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.9;
  if (na.includes(nb) || nb.includes(na)) return 0.82;

  const aa = new Set(na.split(' ').filter(Boolean));
  const bb = new Set(nb.split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;

  let common = 0;
  for (const token of aa) if (bb.has(token)) common++;
  return common / Math.max(aa.size, bb.size);
}

function yearFromMeta(meta) {
  const direct = Number(meta && meta.year);
  if (Number.isFinite(direct) && direct > 1800) return direct;

  const release = String(meta && meta.releaseInfo || '');
  const match = release.match(/\b(18|19|20|21)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function normalizeImdbCandidate(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    const direct = text.match(/\btt\d{5,10}\b/i);
    if (direct) return direct[0].toLowerCase();

    if (/^\d{5,10}$/.test(text)) {
      return `tt${text.padStart(7, '0')}`.toLowerCase();
    }
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 10000) {
    const text = String(value);
    if (text.length <= 10) return `tt${text.padStart(7, '0')}`.toLowerCase();
  }

  return null;
}

function extractImdbId(value, depth = 0, seen = new Set()) {
  if (depth > 4 || value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const match = value.match(/\btt\d{5,10}\b/i);
    return match ? match[0].toLowerCase() : null;
  }

  if (typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImdbId(item, depth + 1, seen);
      if (found) return found;
    }
    return null;
  }

  // Official Kodi Sosáč používá m = IMDb. Novější API může používat i běžné názvy.
  // Čisté číslo přijmeme jen v těchto explicitních IMDb polích, ne obecně.
  const preferredKeys = ['imdb', 'imdb_id', 'imdbId', 'imdbid', 'imdbID', 'm'];
  for (const key of preferredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;

    const direct = normalizeImdbCandidate(value[key]);
    if (direct) return direct;

    const nested = extractImdbId(value[key], depth + 1, seen);
    if (nested) return nested;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (preferredKeys.includes(key)) continue;
    const found = extractImdbId(nestedValue, depth + 1, seen);
    if (found) return found;
  }

  return null;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = normalizeTitle(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function scoreCandidate(candidate, wantedTitles, year) {
  if (!candidate || !/^tt\d{5,10}$/i.test(String(candidate.id || ''))) return -1;

  const names = uniqueStrings([
    candidate.name,
    candidate.originalName,
    ...(Array.isArray(candidate.nameTranslations) ? candidate.nameTranslations : [])
  ]);

  let score = 0;
  for (const wanted of wantedTitles) {
    for (const name of names) {
      score = Math.max(score, titleScore(wanted, name));
    }
  }

  const candidateYear = yearFromMeta(candidate);
  if (year && candidateYear) {
    const diff = Math.abs(Number(year) - candidateYear);
    if (diff === 0) score += 0.12;
    else if (diff === 1) score += 0.06;
    else if (diff >= 3) score -= 0.20;
  }

  return score;
}

class CinemetaApi {
  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 8000,
      maxContentLength: 4 * 1024 * 1024,
      headers: {
        'User-Agent': 'Stremio-Sosac/0.4',
        Accept: 'application/json, text/plain, */*'
      }
    });
  }

  async _dedupedGet(key, requestFactory) {
    const existing = pendingRequests.get(key);
    if (existing) return existing;

    const pending = Promise.resolve()
      .then(requestFactory)
      .finally(() => {
        if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
      });

    pendingRequests.set(key, pending);
    return pending;
  }

  async getMeta(type, imdbId) {
    if (!['movie', 'series'].includes(type) || !/^tt\d{5,10}$/i.test(String(imdbId || ''))) {
      return null;
    }

    const id = String(imdbId).toLowerCase();
    const key = `meta:${type}:${id}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached || null;

    return this._dedupedGet(key, async () => {
      const again = cache.get(key);
      if (again !== undefined) return again || null;

      try {
        const response = await this.http.get(`/meta/${type}/${encodeURIComponent(id)}.json`);
        const meta = response.data && response.data.meta ? response.data.meta : null;
        cache.set(key, meta || false, meta ? 6 * 60 * 60 : 30 * 60);
        return meta;
      } catch (error) {
        console.warn(`[cinemeta] meta ${type}/${id} selhalo: ${error.message}`);
        return null;
      }
    });
  }

  async search(type, query) {
    if (!['movie', 'series'].includes(type)) return [];
    const q = String(query || '').trim();
    if (!q) return [];

    const key = `search:${type}:${normalizeTitle(q)}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    return this._dedupedGet(key, async () => {
      const again = cache.get(key);
      if (again !== undefined) return again;

      try {
        const response = await this.http.get(
          `/catalog/${type}/top/search=${encodeURIComponent(q)}.json`
        );
        const metas = Array.isArray(response.data && response.data.metas)
          ? response.data.metas
          : [];
        cache.set(key, metas, metas.length ? 60 * 60 : 15 * 60);
        return metas;
      } catch (error) {
        console.warn(`[cinemeta] search "${q}" selhalo: ${error.message}`);
        return [];
      }
    });
  }

  async resolveByTitle(type, titles, year) {
    const wantedTitles = uniqueStrings(titles);
    if (!wantedTitles.length) return null;

    const resolveKey = `resolve:${type}:${Number(year) || 0}:${wantedTitles.map(normalizeTitle).sort().join('|')}`;
    const cachedResolve = resolveCache.get(resolveKey);
    if (cachedResolve !== undefined) return cachedResolve || null;

    const pendingKey = `pending:${resolveKey}`;
    return this._dedupedGet(pendingKey, async () => {
      const again = resolveCache.get(resolveKey);
      if (again !== undefined) return again || null;

      let best = null;
      let bestScore = -1;

      for (const title of wantedTitles.slice(0, 4)) {
        // Většinou stačí jediný dotaz podle názvu. Rok se používá při skórování.
        // Druhý dotaz "název + rok" děláme jen pokud první nedal dobrou shodu.
        const firstResults = await this.search(type, title);
        for (const candidate of firstResults.slice(0, 12)) {
          const score = scoreCandidate(candidate, wantedTitles, year);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }

        if (bestScore >= 1.05) break;

        if (year && bestScore < 0.90) {
          const yearResults = await this.search(type, `${title} ${year}`);
          for (const candidate of yearResults.slice(0, 12)) {
            const score = scoreCandidate(candidate, wantedTitles, year);
            if (score > bestScore) {
              bestScore = score;
              best = candidate;
            }
          }
        }

        if (bestScore >= 1.05) break;
      }

      if (!best || bestScore < 0.68) {
        resolveCache.set(resolveKey, false, 30 * 60);
        return null;
      }

      const full = await this.getMeta(type, best.id);
      const result = full || best;
      resolveCache.set(resolveKey, result, 12 * 60 * 60);
      return result;
    });
  }
}

module.exports = {
  CinemetaApi,
  normalizeTitle,
  titleScore,
  yearFromMeta,
  extractImdbId,
  uniqueStrings
};
