'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CONFIG_STORE_DIR = process.env.SOSAC_CONFIG_STORE_DIR || path.join(os.homedir(), '.stremio-sosac-configs');
const TOKEN_RE = /^cfg\.[a-f0-9]{64}$/;
const originalBufferFrom = Buffer.from.bind(Buffer);
const createBuckets = new Map();

function configFile(token) {
  const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
  return path.join(CONFIG_STORE_DIR, `${hash}.json`);
}

function ensureStore() {
  fs.mkdirSync(CONFIG_STORE_DIR, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(CONFIG_STORE_DIR, 0o700); } catch {}
}

function readStoredConfig(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  try {
    const raw = fs.readFileSync(configFile(token), 'utf8');
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizeConfig(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const text = (name, max = 512) => String(source[name] ?? '').trim().slice(0, max);
  const password = name => String(source[name] ?? '').slice(0, 512);

  const cfg = {
    uiLanguage: ['cs', 'sk', 'en'].includes(text('uiLanguage', 8)) ? text('uiLanguage', 8) : 'cs',
    sosacUser: text('sosacUser'),
    sosacPass: password('sosacPass'),
    streamujUser: text('streamujUser'),
    streamujPass: password('streamujPass'),
    location: /^\d{1,4}$/.test(text('location', 8)) ? text('location', 8) : '1',
    subtitleMode: text('subtitleMode', 32) === 'direct-test' ? 'direct-test' : 'hybrid'
  };

  if (!cfg.sosacUser || !cfg.sosacPass || !cfg.streamujUser || !cfg.streamujPass) return null;
  return cfg;
}

function createStoredConfig(input) {
  const cfg = normalizeConfig(input);
  if (!cfg) return null;

  ensureStore();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = `cfg.${crypto.randomBytes(32).toString('hex')}`;
    const target = configFile(token);
    try {
      fs.writeFileSync(target, JSON.stringify(cfg), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      try { fs.chmodSync(target, 0o600); } catch {}
      return token;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Unable to allocate configuration token.');
}

function clientKey(req) {
  return String(
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();
}

function allowConfigCreate(req) {
  const minute = Math.floor(Date.now() / 60_000);
  const key = `${clientKey(req)}:${minute}`;
  const used = (createBuckets.get(key) || 0) + 1;
  createBuckets.set(key, used);

  if (createBuckets.size > 2000) {
    for (const bucket of createBuckets.keys()) {
      const bucketMinute = Number(bucket.slice(bucket.lastIndexOf(':') + 1));
      if (bucketMinute < minute - 1) createBuckets.delete(bucket);
    }
  }

  return used <= 20;
}

// Existing addon code decodes the route token with Buffer.from(..., 'base64').
// For opaque cfg.<hex> tokens, transparently provide the stored JSON instead.
Buffer.from = function secureConfigBufferFrom(value, encoding, ...rest) {
  if (encoding === 'base64' && TOKEN_RE.test(String(value || ''))) {
    const cfg = readStoredConfig(value);
    if (cfg) return originalBufferFrom(JSON.stringify(cfg), 'utf8');
  }
  return originalBufferFrom(value, encoding, ...rest);
};

function secureConfigureHtml(html) {
  let output = String(html || '');
  output = output.replace(
    'Instalační konfigurace je v odkazu zapsaná jako Base64URL. Není běžně čitelná na první pohled, ale Base64 není šifrování, proto instalační odkaz nesdílej.',
    'Přihlašovací údaje se ukládají pouze na serveru. Instalační odkaz obsahuje náhodný přístupový token; odkaz proto stále nesdílej.'
  );

  const start = output.indexOf('function buildInstallLink(showValidation=true){');
  const endMarker = "document.getElementById('generate').addEventListener('click',()=>{\n  buildInstallLink(true);\n});";
  const endStart = output.indexOf(endMarker, start);
  if (start < 0 || endStart < 0) throw new Error('Configure page structure changed; secure installer patch was not applied.');

  const replacement = `async function buildInstallLink(showValidation=true){
  const cfg={
    uiLanguage:document.getElementById('uiLanguage').value,
    sosacUser:document.getElementById('sosacUser').value.trim(),
    sosacPass:document.getElementById('sosacPass').value,
    streamujUser:document.getElementById('streamujUser').value.trim(),
    streamujPass:document.getElementById('streamujPass').value,
    location:document.getElementById('location').value,
    subtitleMode:selectedMode
  };
  const status=document.getElementById('status');

  if(!cfg.sosacUser||!cfg.sosacPass||!cfg.streamujUser||!cfg.streamujPass){
    if(showValidation){
      document.getElementById('result').style.display='block';
      status.textContent='Vyplň všechna přihlašovací pole.';
    }
    return false;
  }

  generateBtn.disabled=true;
  try{
    const basePath=getBasePath();
    const response=await fetch(\`${'${basePath}'}/api/config\`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      cache:'no-store',
      body:JSON.stringify(cfg)
    });
    if(!response.ok)throw new Error(\`HTTP ${'${response.status}'}\`);
    const data=await response.json();
    const token=String(data&&data.token||'');
    if(!/^cfg\\.[a-f0-9]{64}$/.test(token))throw new Error('Neplatný token konfigurace.');

    const path=\`${'${basePath}'}/${'${token}'}/manifest.json\`;
    const manifest=\`${'${location.origin}'}${'${path}'}\`;
    const install=\`stremio://${'${location.host}'}${'${path}'}\`;
    document.getElementById('installUrl').value=manifest;
    stremioBtn.href=install;
    document.getElementById('result').style.display='block';
    status.textContent=selectedMode==='direct-test'
      ? 'Připravený bezpečný Direct test odkaz.'
      : 'Připravený bezpečný Hybrid odkaz.';
    return true;
  }catch(error){
    document.getElementById('result').style.display='block';
    status.textContent='Konfiguraci se nepodařilo bezpečně uložit. Zkus to znovu.';
    return false;
  }finally{
    generateBtn.disabled=false;
  }
}

hybridMode.addEventListener('click',()=>applyMode('hybrid'));
directMode.addEventListener('click',()=>applyMode('direct-test'));

document.getElementById('generate').addEventListener('click',async()=>{
  await buildInstallLink(true);
});`;

  output = output.slice(0, start) + replacement + output.slice(endStart + endMarker.length);
  return output;
}

const expressPath = require.resolve('express');
const originalExpress = require(expressPath);

function secureExpress(...args) {
  const app = originalExpress(...args);
  app.use(originalExpress.json({ limit: '16kb' }));

  app.post('/api/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!allowConfigCreate(req)) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Too many configuration requests.' });
    }

    try {
      const token = createStoredConfig(req.body);
      if (!token) return res.status(400).json({ error: 'Invalid configuration.' });
      return res.status(201).json({ token });
    } catch (error) {
      console.error('[config-store]', error.message);
      return res.status(500).json({ error: 'Configuration could not be stored.' });
    }
  });

  app.use((req, res, next) => {
    if (req.method !== 'GET' || !/^\/configure\/?$/.test(req.path)) return next();
    try {
      const source = fs.readFileSync(path.join(__dirname, 'public', 'configure.html'), 'utf8');
      res.setHeader('Cache-Control', 'no-store');
      return res.type('html').send(secureConfigureHtml(source));
    } catch (error) {
      console.error('[config-page]', error.message);
      return res.status(500).type('text/plain').send('Configuration page unavailable.');
    }
  });

  return app;
}

Object.assign(secureExpress, originalExpress);
require.cache[expressPath].exports = secureExpress;

module.exports = {
  TOKEN_RE,
  normalizeConfig,
  createStoredConfig,
  readStoredConfig,
  secureConfigureHtml
};
