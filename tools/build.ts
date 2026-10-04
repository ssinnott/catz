// Bundle the game into one self-contained page: dist/index.html, which opens from disk or serves
// from anywhere (GitHub Pages included). Same shape as game-engine's tools/build.ts: esbuild
// resolves the './foo.ts' specifiers directly, so the graph the dev server serves file by file is
// the one bundled here, and the module <script> tag is replaced by the inlined bundle.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
fs.mkdirSync(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [path.join(ROOT, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
  write: false,
  logLevel: 'error',
});
const out = result.outputFiles[0];
if (!out) throw new Error('esbuild produced no output file');
const js = out.text.replace(/<\/script/gi, '<\\/script');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const tagRe = /<script[^>]*type=["']module["'][^>]*src=["'][^"']*main\.ts["'][^>]*>\s*<\/script>/i;
if (!tagRe.test(html)) throw new Error('index.html: could not find <script type="module" src="src/main.ts"> to inline');
html = html.replace(tagRe, () => `<script>\n${js}\n</script>`);
if (/src=["'](\.\/)?src\//.test(html)) throw new Error('dist/index.html still references src/');
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
console.log(`built dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);
