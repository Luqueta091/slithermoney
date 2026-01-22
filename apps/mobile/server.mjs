import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const port = Number.parseInt(process.env.PORT || '3000', 10);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self' https: wss:; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'self'; base-uri 'self'",
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

function setHeaders(res, extra = {}) {
  for (const [key, value] of Object.entries(securityHeaders)) {
    res.setHeader(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    res.setHeader(key, value);
  }
}

function isPathInside(base, target) {
  const relative = path.relative(base, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = contentTypes[ext] || 'application/octet-stream';
  const body = await readFile(filePath);
  setHeaders(res, { 'Content-Type': contentType });
  res.statusCode = 200;
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const requestPath = decodeURIComponent(url.pathname);
    const normalizedPath = path.normalize(path.join(distDir, requestPath));

    if (!isPathInside(distDir, normalizedPath)) {
      setHeaders(res);
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    let filePath = normalizedPath;
    let stats;

    try {
      stats = await stat(filePath);
    } catch {
      stats = null;
    }

    if (stats && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stats = await stat(filePath);
    }

    if (stats && stats.isFile()) {
      await serveFile(res, filePath);
      return;
    }

    if (path.extname(requestPath)) {
      setHeaders(res, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    await serveFile(res, path.join(distDir, 'index.html'));
  } catch {
    setHeaders(res, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`mobile-web listening on ${port}`);
});
