// Servidor de desarrollo: sirve public/ y ejecuta los archivos de api/ igual que lo hará Vercel.
//   npm run dev   ->   http://localhost:3000
// En producción (Vercel) este archivo no se usa.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 100 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function wrap(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function handleApi(req, res, name) {
  if (!/^[a-z0-9_-]+$/.test(name)) return wrap(res).status(404).json({ error: 'not_found' });
  const file = path.join(ROOT, 'api', `${name}.js`);
  try { await fs.access(file); } catch { return wrap(res).status(404).json({ error: 'not_found' }); }
  try {
    if (req.method === 'POST') {
      const raw = await readBody(req);
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { return wrap(res).status(400).json({ error: 'bad_json' }); }
    }
    const mod = await import(pathToFileURL(file).href);
    await mod.default(req, wrap(res));
  } catch (err) {
    console.error('[api]', err);
    if (!res.headersSent) wrap(res).status(err.message === 'too_large' ? 413 : 500).json({ error: 'server_error' });
  }
}

async function handleStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.statusCode = 403; return res.end('Prohibido'); }
  try {
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('No encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const m = url.pathname.match(/^\/api\/([^/]+)$/);
  if (m) return handleApi(req, res, m[1]);
  return handleStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Rastro funcionando en http://localhost:${PORT}  (proveedor: ${process.env.TRACKING_PROVIDER || 'mock'})`);
});
