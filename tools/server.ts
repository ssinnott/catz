// Zero-dependency static file server for development and the headless checks -- game-engine's
// tools/server.ts, pointed at this repository. A request for a .ts file is read from disk, has its
// types stripped by esbuild's `transformSync`, and is served as JavaScript with its import
// specifiers untouched, so the browser requests the next '.ts' file and the graph closes on itself:
// no watcher, no output directory, nothing to go stale between saving a file and reloading.
// Usage: node tools/server.ts [port]   (default 8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

/** Strip the types out of one module. Specifiers are left exactly as written. */
function transformTs(source: Buffer, file: string): Uint8Array {
  const { code } = transformSync(source.toString('utf8'), {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
    sourcefile: path.relative(ROOT, file),
    sourcemap: 'inline',
  });
  return Buffer.from(code, 'utf8');
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, onDisk) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + pathname); return; }
      const ext = path.extname(file).toLowerCase();
      let data: Uint8Array = onDisk;
      if (ext === '.ts') {
        // A syntax error must not take the server down from inside a request callback: report it as
        // the response, so the reload that caused it shows it and the server survives to serve the fix.
        try {
          data = transformTs(onDisk, file);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error(`transform failed: ${pathname}\n${message}`);
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(`transform failed: ${pathname}\n${message}`);
          return;
        }
      }
      res.writeHead(200, {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      res.end(data);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(`catz dev server: http://localhost:${PORT}/`));
}
