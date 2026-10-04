// A scripted run through the whole game in headless Chromium, the way a player would go:
//
//   title -> pick a cat -> the playhouse (eat, drink, scratch, bat the toy: a happy cat)
//   -> apple fishing (a full round) -> out the door -> the map -> the Town Run (fall in the pond,
//   come back dripping at the bell, then reach the gate) -> the results -> the water park unlocked
//   -> the Tube Maze and the Log Flume -> and every cat's special move, in every challenge.
//
// It asserts the game gets where it should and never throws. It also leaves screenshots of the cut
// scenes in .shots/playtest/ (not asserted on; they are for a person to look at).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame, type GameSession } from './browser.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.shots', 'playtest');
fs.mkdirSync(OUT, { recursive: true });

let bad = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? '  ok:   ' : '  FAIL: ') + msg); if (!cond) bad++; };

const g: GameSession = await openGame('fresh');
const step = (n: number) => g.step(n);
const tap = (a: string) => g.eval(`window.__game.tap(${JSON.stringify(a)})`);
const hold = (a: string, d: boolean) => g.eval(`window.__game.hold(${JSON.stringify(a)}, ${d})`);
const cheat = (c: string) => g.eval(`window.__game.cheat(${JSON.stringify(c)})`);
const peek = () => g.eval<Record<string, any>>('window.__game.peek()');
const screen = () => g.eval<string>('window.__game.screen');
const shot = (name: string) => g.shot(path.join(OUT, name + '.png'));
async function until(cond: () => Promise<boolean>, max: number, every = 10): Promise<boolean> {
  for (let i = 0; i < max; i += every) { if (await cond()) return true; await step(every); }
  return cond();
}

// ---- title and cat select
await step(40);
ok(await screen() === 'title', 'starts on the title');
await tap('confirm');
ok(await until(async () => await screen() === 'select', 120), 'the title leads to the cat select');
await step(30);
await tap('right'); await step(20); await tap('left'); await step(20);
await shot('01-select');
await tap('confirm');
ok(await until(async () => await screen() === 'house', 200), 'picking a cat goes home to the playhouse');
await step(140);
await shot('02-house');

// ---- the playhouse: eat, drink, scratch, the toy
async function station(name: string, frames: number, shotName?: string): Promise<void> {
  await cheat(`goto:${name}`); await step(4);
  await tap('action'); await step(2);
  ok((await peek()).busy === true, `the ${name} station starts a cut scene`);
  if (shotName) { await step(70); await shot(shotName); }
  ok(await until(async () => (await peek()).busy === false, frames), `the ${name} scene finishes`);
  await step(10);
}
await station('food', 600, '03-eat');
ok((await peek()).food === 3, 'eating fills FOOD');
await station('water', 500, '04-drink');
ok((await peek()).drink === 3, 'drinking fills DRINK');
await station('scratch', 500, '05-scratch');
await station('toy', 500, '06-toy');
const h = await peek();
ok(h.play === 3 && h.happy === true, `scratching and the toy fill PLAY: a happy cat (play ${h.play})`);

// ---- apple fishing
await cheat('goto:apples'); await step(4); await tap('action');
ok(await until(async () => await screen() === 'fishing', 120), 'the apple tub opens apple fishing');
await step(140);
for (let i = 0; i < 12; i++) { await tap('action'); await step(70); }
await shot('07-fishing');
// lean out over the far side until the cat goes in
await hold('right', true); await step(400); await hold('right', false);
await shot('08-fishing-splash');
await step(3000);
ok((await peek()).over === true, 'the fishing round ends on time');
await shot('09-fishing-over');
await tap('down'); await step(4); await tap('confirm');
ok(await until(async () => await screen() === 'house', 160), 'fishing returns to the playhouse');
await step(120);

// ---- out to the map, into town
await cheat('goto:door'); await step(4); await tap('action');
ok(await until(async () => await screen() === 'map', 120), 'the door leads to the map');
await step(40);
await tap('right');
await step(160);
await shot('10-map');
await tap('confirm');
ok(await until(async () => (await peek()).level === 'town', 120), 'the map leads into the Town Run');
await step(40);
await shot('11-town-intro');
await step(140);
// run and jump for a while
await hold('right', true);
for (let i = 0; i < 30; i++) { await step(12); if (i % 3 === 0) await tap('jump'); if (i % 7 === 0) await tap('action'); }
await shot('12-town-run');
await hold('right', false);
ok((await peek()).score > 0, `fish and bad guys score points (score ${(await peek()).score})`);
// into the fountain pond
await cheat('warp:51,14'); await step(4);
const before = (await peek()).splashes;
await hold('right', true); await step(30); await hold('right', false);
await step(30);
await shot('13-splash');
ok(await until(async () => (await peek()).splashes === before + 1, 200), 'falling in the pond is a splash');
await step(60);
await shot('14-respawn');
ok(await until(async () => (await peek()).state === 'play', 400), 'and the cat is back at the bell, playing again');
// every cat's special
await tap('special'); await step(60);
// to the gate
await cheat('goal'); await step(2);
await hold('right', true);
ok(await until(async () => (await peek()).finished === true, 300), 'reaching the gate finishes the level');
await hold('right', false);
await step(80);
await shot('15-goal');
ok(await until(async () => await screen() === 'results', 600), 'the goal leads to the results');
await step(400);
await shot('16-results');
await tap('confirm');
ok(await until(async () => await screen() === 'map', 120), 'ONWARD leads back to the map');
await step(60);
await shot('17-map-open');

// ---- every cat in every challenge, with its special
const cats = ['crush', 'sprout', 'sly', 'biscuit', 'truffle', 'pendragon'];
const spots: Record<string, string[]> = { town: ['warp:30,14', 'warp:113,10', 'warp:150,14'], tubes: ['warp:10,6', 'warp:50,14', 'warp:30,22'], flume: ['warp:21,9', 'warp:89,11', 'warp:151,12'] };
for (const level of ['town', 'tubes', 'flume']) {
  for (const c of cats) {
    await g.eval(`window.__game.goto('play', ${JSON.stringify(level + ':' + c)})`); await step(2);
    ok((await peek()).cat === c, `${level} opens as ${c}`);
    await cheat('skip');
    for (const spot of spots[level]) {
      await cheat(spot); await step(20);
      await tap('special'); await step(30);
      await hold('right', true); await tap('jump'); await step(40); await tap('action'); await step(30); await hold('right', false);
    }
    if (c === 'pendragon' || c === 'sly' || c === 'truffle') await shot(`20-${level}-${c}`);
    const errs = await g.eval<string[]>('window.__game.errors');
    ok(errs.length === 0, `${level} with ${c}: specials, attacks and jumps throw nothing`);
  }
}

const errors = [...new Set([...g.errors, ...(await g.eval<string[]>('window.__game.errors'))])];
ok(errors.length === 0, `no page errors${errors.length ? ' -> ' + errors.join(' | ') : ''}`);
await g.close();
console.log(bad ? `\nPLAYTEST FAILED (${bad})` : '\nPLAYTEST OK: the whole game plays through. Screenshots in .shots/playtest/');
process.exit(bad ? 1 : 0);
