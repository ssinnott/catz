// Headless proof that the game loads and draws in a real browser, served as TypeScript through the
// dev server with nothing compiled to disk -- and that every screen can be opened without an error.
import { openGame } from './browser.ts';

const SCREENS = ['title', 'select', 'house', 'map', 'fishing', 'results', 'play:town', 'play:tubes', 'play:flume', 'lab'];
let bad = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? '  ok:   ' : '  FAIL: ') + msg); if (!cond) bad++; };

const game = await openGame('');
await game.step(60);
const colours = await game.eval<number>(`(() => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return seen.size;
})()`);
ok(colours > 40, `the title screen is drawn (${colours} distinct colours)`);
for (const s of SCREENS) {
  const [name, arg] = s.split(':');
  await game.eval(`window.__game.goto(${JSON.stringify(name)}, ${JSON.stringify(arg ?? '')})`);
  await game.step(90);
  const top = await game.eval<string>('window.__game.screen');
  ok(top === name, `opens the ${s} screen (on top: ${top})`);
}
// every sound effect and track renders to something audible (OfflineAudioContext, no speaker needed)
const report = await game.eval<{ sfx: { name: string; rms: number; peak: number; error?: string }[]; music: { name: string; rms: number; error?: string }[] }>('window.__game.audioSelfTest()');
const silent = report.sfx.filter((r) => r.error || !(r.peak > 0.01));
ok(silent.length === 0, `all ${report.sfx.length} sound effects render and are audible${silent.length ? ' -> ' + silent.map((r) => r.name + (r.error ? '(' + r.error + ')' : '')).join(', ') : ''}`);
const quiet = report.music.filter((r) => r.error || !(r.rms > 0.005));
ok(quiet.length === 0, `all ${report.music.length} music tracks render and are audible${quiet.length ? ' -> ' + quiet.map((r) => r.name).join(', ') : ''}`);
const loud = report.sfx.filter((r) => r.peak > 1.5);
ok(loud.length === 0, `no sound effect clips${loud.length ? ' -> ' + loud.map((r) => `${r.name} ${r.peak.toFixed(2)}`).join(', ') : ''}`);
const errors = [...new Set([...game.errors, ...(await game.eval<string[]>('window.__game.errors'))])];
ok(errors.length === 0, `no page errors${errors.length ? ' -> ' + errors.join(' | ') : ''}`);
await game.close();
console.log(bad ? '\nSMOKE FAILED' : '\nSMOKE OK: the game loads and every screen draws in a browser.');
process.exit(bad ? 1 : 0);
