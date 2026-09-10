const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = process.env.SUBTITLE_CACHE_DIR || path.join(os.tmpdir(), 'sosac-subtitle-files');
const MAX_BYTES = 2 * 1024 * 1024;
const SOURCE_REFRESH_MS = 2 * 60 * 60 * 1000;
const SOURCE_CACHE_MAX = 256;

function subtitleFilePath(hash) {
  return path.join(CACHE_DIR, `${hash}.vtt`);
}

async function readSubtitleFile(hash) {
  try {
    const body = await fs.promises.readFile(subtitleFilePath(hash));
    if (body.length > MAX_BYTES) return null;
    if (crypto.createHash('sha256').update(body).digest('hex') !== hash) return null;
    return body;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function storeSubtitleFile(body) {
  if (!Buffer.isBuffer(body) || !body.length || body.length > MAX_BYTES) {
    throw new Error('Neplatná velikost souboru titulků.');
  }

  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const existing = await readSubtitleFile(hash);
  if (existing) return hash;

  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  const temporary = path.join(CACHE_DIR, `.subtitle-${crypto.randomBytes(12).toString('hex')}.tmp`);

  try {
    await fs.promises.writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
    try {
      await fs.promises.rename(temporary, subtitleFilePath(hash));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }

  return hash;
}

function sourceKey(track, streamuj) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([
      track && (track.sourceUrl || track.url || track.directUrl),
      streamuj && streamuj.username,
      streamuj && streamuj.passwordHash
    ]))
    .digest('hex');
}

class SubtitleFileStore {
  constructor() {
    this.bySource = new Map();
    this.pending = new Map();
  }

  async prepareTrack(track, streamuj, baseUrl) {
    const sourceUrl = track && (track.sourceUrl || track.directUrl || track.url);
    if (!sourceUrl) throw new Error('Chybí zdrojová URL titulků.');

    const key = sourceKey({ sourceUrl }, streamuj);
    const cached = this.bySource.get(key);
    let hash = cached && Date.now() - cached.checkedAt < SOURCE_REFRESH_MS
      ? cached.hash
      : null;

    if (hash && !(await readSubtitleFile(hash))) {
      this.bySource.delete(key);
      hash = null;
    }

    if (!hash) {
      let pending = this.pending.get(key);
      if (!pending) {
        pending = (async () => {
          console.log('[SUBTITLE FILE] Stahuji a převádím titulky...');
          const body = await streamuj.downloadSubtitleVtt(sourceUrl);
          const result = await storeSubtitleFile(body);
          this.bySource.delete(key);
          this.bySource.set(key, { hash: result, checkedAt: Date.now() });

          while (this.bySource.size > SOURCE_CACHE_MAX) {
            this.bySource.delete(this.bySource.keys().next().value);
          }

          console.log(`[SUBTITLE FILE] Připraveno: ${body.length} bajtů`);
          return result;
        })();
        this.pending.set(key, pending);
      }

      try {
        hash = await pending;
      } finally {
        if (this.pending.get(key) === pending) this.pending.delete(key);
      }
    }

    const lang = String(track.lang || 'und');
    const publicUrl = new URL(`/subtitle-file/v1/${hash}.vtt`, baseUrl).toString();

    return {
      id: `file_v1_${hash}_${lang}`,
      lang,
      url: publicUrl
    };
  }

  async prepareTracks(tracks, streamuj, baseUrl) {
    const sourceSeen = new Set();
    const unique = [];

    for (const track of Array.isArray(tracks) ? tracks : []) {
      const sourceUrl = track && (track.sourceUrl || track.directUrl || track.url);
      if (!sourceUrl) continue;
      const key = `${track.lang || 'und'}:${sourceUrl}`;
      if (sourceSeen.has(key)) continue;
      sourceSeen.add(key);
      unique.push(track);
      if (unique.length >= 12) break;
    }

    const prepared = await Promise.all(unique.map(async track => {
      try {
        return await this.prepareTrack(track, streamuj, baseUrl);
      } catch (error) {
        console.warn(`[SUBTITLE FILE] Příprava selhala: ${error.message}`);
        return null;
      }
    }));

    const idSeen = new Set();
    return prepared.filter(track => {
      if (!track || idSeen.has(track.id)) return false;
      idSeen.add(track.id);
      return true;
    });
  }

  async sendFile(req, res, hash) {
    if (!/^[a-f0-9]{64}$/.test(String(hash || ''))) {
      return res.status(404).type('text/plain').send('Titulky nenalezeny.');
    }

    const body = await readSubtitleFile(hash);
    if (!body) {
      return res.status(404).type('text/plain').send('Soubor titulků není dostupný.');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    if (req.method === 'GET' && /^bytes=/i.test(req.headers.range || '') && !req.headers['if-range']) {
      const ranges = req.range(body.length, { combine: true });
      if (ranges === -1) {
        res.setHeader('Content-Range', `bytes */${body.length}`);
        res.setHeader('Content-Length', 0);
        return res.status(416).end();
      }

      if (Array.isArray(ranges) && ranges.type.toLowerCase() === 'bytes' && ranges.length === 1) {
        const { start, end } = ranges[0];
        const part = body.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${body.length}`);
        res.setHeader('Content-Length', part.length);
        return res.end(part);
      }
    }

    res.setHeader('Content-Length', body.length);
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  }
}

module.exports = {
  SubtitleFileStore
};
