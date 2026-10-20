// Zero-dependency static file server for local testing: `npm start`.
// Listens on all network interfaces so an iPhone/iPad on the same Wi-Fi can open the printed URL.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8642;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = path.join(root, urlPath);
    const hidden = urlPath.split('/').some((part) => part.startsWith('.'));
    if (!file.startsWith(root + path.sep) || hidden) throw new Error('forbidden');
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Try: $env:PORT=9000; npm start`);
  else console.error(err);
  process.exit(1);
});
server.listen(port, () => { // no host = all interfaces, IPv4 and IPv6
  console.log(`Solitaire running at http://localhost:${port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`On your iPhone/iPad (same Wi-Fi): http://${a.address}:${port}`);
    }
  }
  console.log('Press Ctrl+C to stop.');
});
