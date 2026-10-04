// Screenshot a screen: node tools/shot.ts "<query>" <out.png> [steps] [more steps:out2.png ...]
// e.g. node tools/shot.ts "screen=lab&arg=anim:run" .shots/run.png 30
import fs from 'node:fs';
import path from 'node:path';
import { openGame } from './browser.ts';

const [query = 'screen=lab', out = '.shots/shot.png', ...rest] = process.argv.slice(2);
fs.mkdirSync(path.dirname(out), { recursive: true });
const game = await openGame(query);
let steps = 0;
const plan: { n: number; file: string }[] = [];
if (rest.length && /^\d+$/.test(rest[0])) { steps = Number(rest.shift()); }
plan.push({ n: steps, file: out });
for (const r of rest) { const [n, f] = r.split(':'); plan.push({ n: Number(n), file: f }); }
for (const p of plan) {
  if (p.n) await game.step(p.n);
  await game.shot(p.file);
  console.log('wrote', p.file);
}
const errors = [...game.errors, ...(await game.eval<string[]>('window.__game.errors'))];
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await game.close();
