// drift — backend
// Plain Node.js. No npm dependencies. Run with: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

// DATA_DIR can be overridden with an environment variable. This matters when
// hosting on a platform with a persistent disk (like Render): point DATA_DIR
// at the disk's mount path so products and settings survive redeploys,
// instead of living on the app's ephemeral filesystem.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Optional: store data in Upstash Redis (a free, hosted key-value store)
// instead of local files. This is the recommended setup for free hosting
// tiers, since those tiers usually wipe local files on every restart, but
// Upstash keeps the data regardless of what the host does to the server.
// Set these two environment variables to turn it on — leave them unset to
// keep using local files (e.g. when running on your own machine).
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_UPSTASH = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashCommand(command) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(command)
  });
  const data = await res.json();
  if (data.error) throw new Error(`Upstash error: ${data.error}`);
  return data.result;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8MB, enough for a base64 product photo
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// The very first time drift runs — whether that's a brand-new local data
// folder, a freshly mounted disk, or a brand-new Upstash database — there's
// no data yet. Create sensible defaults rather than crash.
const DEFAULT_PRODUCTS = [
  {
    id: 'p1',
    name: 'Cloud Wool Sweater',
    price: 145,
    description: 'Heavyweight merino, brushed soft. Made to be lived in.',
    image: 'https://images.unsplash.com/photo-1614975059251-992f11792b9f?q=80&w=800&auto=format&fit=crop',
    category: 'Outerwear',
    inStock: true
  }
];

function defaultConfig() {
  // Default admin password is "drift2026" — the same default no matter which
  // storage backend is in use, so behaviour is predictable on first run.
  const salt = 'fcf1adf4bcbf99c65e9c87b9d5f3f32f';
  const hash = crypto.scryptSync('drift2026', salt, 64).toString('hex');
  return {
    storeName: 'drift',
    whatsappNumber: '233000000000',
    currency: '$',
    adminPasswordSalt: salt,
    adminPasswordHash: hash
  };
}

// ---------- data access (local file or Upstash, chosen automatically) ----------

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function getProducts() {
  if (USE_UPSTASH) {
    const raw = await upstashCommand(['GET', 'drift:products']);
    return raw ? JSON.parse(raw) : [];
  }
  return readJSON(PRODUCTS_FILE);
}

async function saveProducts(products) {
  if (USE_UPSTASH) {
    await upstashCommand(['SET', 'drift:products', JSON.stringify(products)]);
    return;
  }
  writeJSON(PRODUCTS_FILE, products);
}

async function getConfig() {
  if (USE_UPSTASH) {
    const raw = await upstashCommand(['GET', 'drift:config']);
    return raw ? JSON.parse(raw) : null;
  }
  return readJSON(CONFIG_FILE);
}

async function saveConfig(config) {
  if (USE_UPSTASH) {
    await upstashCommand(['SET', 'drift:config', JSON.stringify(config)]);
    return;
  }
  writeJSON(CONFIG_FILE, config);
}

async function ensureDataReady() {
  if (USE_UPSTASH) {
    console.log('Using Upstash Redis for storage.');
    const existingProducts = await upstashCommand(['GET', 'drift:products']);
    if (!existingProducts) {
      await upstashCommand(['SET', 'drift:products', JSON.stringify(DEFAULT_PRODUCTS)]);
      console.log('No products found in Upstash — added a starter item.');
    }
    const existingConfig = await upstashCommand(['GET', 'drift:config']);
    if (!existingConfig) {
      await upstashCommand(['SET', 'drift:config', JSON.stringify(defaultConfig())]);
      console.log('No config found in Upstash — created defaults.');
      console.log('Default admin password is "drift2026" — change it from /admin right away.');
    }
    return;
  }

  // Local file storage. A fresh persistent disk mounts as an empty folder,
  // so on first boot there may be no data files yet at DATA_DIR.
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created data directory at ${DATA_DIR}`);
  }
  if (!fs.existsSync(PRODUCTS_FILE)) {
    writeJSON(PRODUCTS_FILE, DEFAULT_PRODUCTS);
    console.log(`No products.json found — created one with a starter item at ${PRODUCTS_FILE}`);
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    writeJSON(CONFIG_FILE, defaultConfig());
    console.log(`No config.json found — created one with defaults at ${CONFIG_FILE}`);
    console.log(`Default admin password is "drift2026" — change it from /admin right away.`);
  }
}

function publicConfig(config) {
  return {
    storeName: config.storeName,
    whatsappNumber: config.whatsappNumber,
    currency: config.currency
  };
}

// ---------- sessions ----------

const sessions = new Map(); // token -> expiry timestamp

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function requireAuth(req) {
  const cookies = parseCookies(req);
  return isValidSession(cookies.drift_session);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, config) {
  const attempt = hashPassword(password, config.adminPasswordSalt);
  const stored = Buffer.from(config.adminPasswordHash, 'hex');
  const given = Buffer.from(attempt, 'hex');
  if (stored.length !== given.length) return false;
  return crypto.timingSafeEqual(stored, given);
}

// ---------- body parsing ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJSONBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('BAD_JSON');
  }
}

// ---------- response helpers ----------

function sendJSON(res, status, data, extraHeaders) {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  }, extraHeaders || {}));
  res.end(body);
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', `drift_session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'drift_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

// ---------- validation ----------

function sanitizeProductInput(body) {
  const name = String(body.name || '').trim().slice(0, 120);
  const description = String(body.description || '').trim().slice(0, 500);
  const category = String(body.category || '').trim().slice(0, 60);
  const image = String(body.image || '').trim().slice(0, 5_000_000);
  const price = Number(body.price);
  const inStock = body.inStock === undefined ? true : Boolean(body.inStock);

  if (!name) throw new Error('Name is required.');
  if (!Number.isFinite(price) || price < 0) throw new Error('Price must be a positive number.');

  return { name, description, category, image, price, inStock };
}

// ---------- static file serving ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html'
    : pathname === '/admin' ? '/admin.html'
    : pathname;

  // prevent path traversal
  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, safePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- request router ----------

async function handleApi(req, res, pathname) {
  const method = req.method;

  // --- public reads ---
  if (method === 'GET' && pathname === '/api/products') {
    return sendJSON(res, 200, await getProducts());
  }

  if (method === 'GET' && pathname === '/api/config') {
    return sendJSON(res, 200, publicConfig(await getConfig()));
  }

  if (method === 'GET' && pathname === '/api/session') {
    return sendJSON(res, 200, { loggedIn: requireAuth(req) });
  }

  // --- auth ---
  if (method === 'POST' && pathname === '/api/login') {
    const body = await readJSONBody(req);
    const config = await getConfig();
    if (!body.password || !verifyPassword(String(body.password), config)) {
      return sendJSON(res, 401, { error: "That password doesn't match. Try again." });
    }
    const token = createSession();
    setSessionCookie(res, token);
    return sendJSON(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const cookies = parseCookies(req);
    sessions.delete(cookies.drift_session);
    clearSessionCookie(res);
    return sendJSON(res, 200, { ok: true });
  }

  // --- everything below requires an admin session ---
  const authed = requireAuth(req);

  if (method === 'POST' && pathname === '/api/products') {
    if (!authed) return sendJSON(res, 401, { error: 'Sign in required.' });
    const body = await readJSONBody(req);
    let clean;
    try {
      clean = sanitizeProductInput(body);
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
    const products = await getProducts();
    const product = Object.assign({ id: crypto.randomUUID() }, clean);
    products.unshift(product);
    await saveProducts(products);
    return sendJSON(res, 201, product);
  }

  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch) {
    if (!authed) return sendJSON(res, 401, { error: 'Sign in required.' });
    const id = decodeURIComponent(productMatch[1]);
    const products = await getProducts();
    const idx = products.findIndex(p => p.id === id);

    if (method === 'PUT') {
      if (idx === -1) return sendJSON(res, 404, { error: 'Item not found.' });
      const body = await readJSONBody(req);
      let clean;
      try {
        clean = sanitizeProductInput(Object.assign({}, products[idx], body));
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
      products[idx] = Object.assign({}, products[idx], clean);
      await saveProducts(products);
      return sendJSON(res, 200, products[idx]);
    }

    if (method === 'DELETE') {
      if (idx === -1) return sendJSON(res, 404, { error: 'Item not found.' });
      const [removed] = products.splice(idx, 1);
      await saveProducts(products);
      return sendJSON(res, 200, { ok: true, removed });
    }
  }

  if (method === 'PUT' && pathname === '/api/config') {
    if (!authed) return sendJSON(res, 401, { error: 'Sign in required.' });
    const body = await readJSONBody(req);
    const config = await getConfig();
    if (typeof body.storeName === 'string' && body.storeName.trim()) {
      config.storeName = body.storeName.trim().slice(0, 60);
    }
    if (typeof body.whatsappNumber === 'string') {
      const digits = body.whatsappNumber.replace(/[^\d]/g, '');
      if (!digits) return sendJSON(res, 400, { error: 'Enter a valid WhatsApp number, digits only, with country code.' });
      config.whatsappNumber = digits;
    }
    if (typeof body.currency === 'string' && body.currency.trim()) {
      config.currency = body.currency.trim().slice(0, 6);
    }
    await saveConfig(config);
    return sendJSON(res, 200, publicConfig(config));
  }

  if (method === 'POST' && pathname === '/api/change-password') {
    if (!authed) return sendJSON(res, 401, { error: 'Sign in required.' });
    const body = await readJSONBody(req);
    const config = await getConfig();
    if (!body.currentPassword || !verifyPassword(String(body.currentPassword), config)) {
      return sendJSON(res, 401, { error: 'Current password is incorrect.' });
    }
    const next = String(body.newPassword || '');
    if (next.length < 6) {
      return sendJSON(res, 400, { error: 'New password needs to be at least 6 characters.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    config.adminPasswordSalt = salt;
    config.adminPasswordHash = hashPassword(next, salt);
    await saveConfig(config);
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: 'Unknown endpoint.' });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return sendJSON(res, 413, { error: 'That image is too large. Try a smaller photo.' });
    }
    if (err.message === 'BAD_JSON') {
      return sendJSON(res, 400, { error: 'Malformed request.' });
    }
    console.error(err);
    sendJSON(res, 500, { error: 'Something went wrong on the server.' });
  }
});

async function start() {
  await ensureDataReady();
  server.listen(PORT, () => {
    console.log(`drift is running at http://localhost:${PORT}`);
    console.log(`admin panel at http://localhost:${PORT}/admin`);
    console.log(USE_UPSTASH ? 'storage: Upstash Redis' : `storage: local files at ${DATA_DIR}`);
  });
}

start().catch(err => {
  console.error('Failed to start drift:', err);
  process.exit(1);
});
