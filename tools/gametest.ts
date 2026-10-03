// The game's own Node tests: the rules that are cheap to check without a browser, and the one that
// is not cheap but matters most -- that every cat can finish every challenge and reach every golden
// fish (tools/reach.ts, which drives the real Player code).
//
// Usage: node tools/gametest.ts            everything
//        node tools/gametest.ts --quick    skip the reachability search
import { parseLevel, LEGEND, C_SOLID, colAt, type LevelDef } from '../src/world/level.ts';
import { LEVELS } from '../src/levels/index.ts';
import { HOUSE } from '../src/levels/house.ts';
import { CAT_IDS, LEVEL_IDS, loadSave, save, NEED_MAX } from '../src/core/save.ts';
import { animsFor, REQUIRED_ANIMS } from '../src/cats/catAnims.ts';
import { CATS } from '../src/cats/roster.ts';
import { TRACKS } from '../src/core/music.ts';
import { SFX } from '../src/core/sfx.ts';
import { compileTrack } from '../src/lib/audio/sequencer.ts';
import { makeBody, moveX, moveY } from '../src/world/physics.ts';
import { reach } from './reach.ts';
import { TILE } from '../src/config.ts';

let failed = 0, passed = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) passed++;
  else { failed++; console.log('  FAIL: ' + msg); }
}
function section(name: string): void { console.log(name); }

// ---------------------------------------------------------------- levels
section('levels');
const ALL: LevelDef[] = [...LEVEL_IDS.map((id) => LEVELS[id]), HOUSE];
for (const def of ALL) {
  const w = def.rows[0].length;
  ok(def.rows.every((r) => r.length === w), `${def.id}: every row is ${w} wide`);
  const bad = new Set<string>();
  for (const r of def.rows) for (const ch of r) if (!LEGEND.has(ch)) bad.add(ch);
  ok(bad.size === 0, `${def.id}: only legend characters (found ${[...bad].join(' ')})`);
  const lv = parseLevel(def);
  const starts = lv.spawns.filter((s) => s.kind === 'start');
  ok(starts.length === 1, `${def.id}: exactly one start (P), found ${starts.length}`);
  const s = starts[0];
  ok(!!s && colAt(lv, s.tx, s.ty) !== C_SOLID && colAt(lv, s.tx, s.ty + 1) !== 0, `${def.id}: the start is in the open, standing on something`);
  if (def.id !== 'house') {
    ok(lv.spawns.filter((x) => x.kind === 'goal').length === 1, `${def.id}: exactly one goal (E)`);
    ok(lv.spawns.filter((x) => x.kind === 'goldfish').length === 3, `${def.id}: three golden fish`);
    ok(lv.spawns.filter((x) => x.kind === 'checkpoint').length >= 3, `${def.id}: at least three checkpoint bells`);
    ok(lv.spawns.filter((x) => x.kind === 'fish').length >= 30, `${def.id}: plenty of fish treats`);
    ok(def.par > 0 && def.silver > 0, `${def.id}: has a par time and a silver score`);
  } else {
    ok(lv.spawns.filter((x) => x.kind === 'station').length === (def.stations || []).length, 'house: one station per name');
  }
  // nothing spawns inside a wall
  const buried = lv.spawns.filter((x) => ['fish', 'goldfish', 'checkpoint', 'goal', 'raccoon', 'rat', 'dog', 'crab', 'frog'].includes(x.kind) && colAt(lv, x.tx, x.ty) === C_SOLID);
  ok(buried.length === 0, `${def.id}: nothing buried in a wall (${buried.map((b) => `${b.kind}@${b.tx},${b.ty}`).join(' ')})`);
}
ok(LEVELS.flume.stream !== undefined && lvHasLogs(), 'flume: has a stream speed and log spawners');
function lvHasLogs(): boolean { return parseLevel(LEVELS.flume).spawns.some((s) => s.kind === 'logs'); }

// ---------------------------------------------------------------- cats
section('cats');
for (const id of CAT_IDS) {
  const set = animsFor(id);
  const missing = REQUIRED_ANIMS.filter((n) => !set[n] || !set[n].frames.length);
  ok(missing.length === 0, `${id}: has every animation (missing ${missing.join(', ')})`);
  const badDur = Object.entries(set).filter(([, a]) => a.frames.some((f) => !(f.dur > 0)));
  ok(badDur.length === 0, `${id}: every frame has a duration`);
  const d = CATS[id];
  // a head-high shot flies 34 px above the floor and is 10 px tall: its bottom edge is 29 px up
  ok(Math.round(d.hitbox.h * 0.56) < 29, `${id}: ducks low enough to pass under a head-high water shot`);
  ok(d.hitbox.h > 29 + 2, `${id}: stands tall enough that a head-high shot is a real threat`);
}
ok(CATS.biscuit.airJumps === 1 && CATS.truffle.float && CATS.truffle.trips && CATS.sly.quiet && CATS.pendragon.dragons && CATS.crush.power === 2, 'every cat\'s description is a mechanic');
ok(CATS.truffle.jump > Math.max(...CAT_IDS.filter((c) => c !== 'truffle').map((c) => CATS[c].jump)), 'Truffle jumps highest');
ok(CATS.biscuit.speed > Math.max(...CAT_IDS.filter((c) => c !== 'biscuit').map((c) => CATS[c].speed)), 'Biscuit is fastest');
ok(CATS.sprout.hitbox.h < Math.min(...CAT_IDS.filter((c) => c !== 'sprout').map((c) => CATS[c].hitbox.h)), 'Sprout is smallest');
ok(CATS.crush.hitbox.h > Math.max(...CAT_IDS.filter((c) => c !== 'crush').map((c) => CATS[c].hitbox.h)), 'Crush is biggest');

// ---------------------------------------------------------------- audio data
section('audio');
for (const [name, tr] of Object.entries(TRACKS)) {
  const c = compileTrack(tr);
  for (const ch of c.channels) ok(ch.len % c.stepsPerBar === 0, `track ${name}: channel ${ch.inst} is a whole number of bars (${ch.len} steps)`);
}
ok(Object.values(SFX).every((f) => typeof f === 'function'), 'every sfx is playable');
for (const n of ['meow', 'splash', 'jump', 'fish', 'goldfish', 'bonk', 'checkpoint', 'win', 'eat', 'drink']) ok(n in SFX, `sfx '${n}' exists`);

// ---------------------------------------------------------------- physics
section('physics');
{
  const lv = parseLevel({ id: 'house', name: 't', theme: 'house', music: '', par: 0, silver: 0, intro: '', rows: [
    '..........',
    '..........',
    '...===....',
    '..........',
    '..........',
    '#######O##',
  ] });
  const b = makeBody(2 * TILE, 0, 16, 40);
  for (let i = 0; i < 80; i++) { b.vy = Math.min(b.vy + 0.42, 9); moveY(lv, b, b.vy, []); }
  ok(b.onGround && Math.abs(b.y + b.h - 5 * TILE) < 0.01, 'a falling box lands on the floor');
  const p = makeBody(3.5 * TILE, 0, 16, 40);
  for (let i = 0; i < 40; i++) { p.vy = Math.min(p.vy + 0.42, 9); moveY(lv, p, p.vy, []); }
  ok(p.onGround && Math.abs(p.y + p.h - 2 * TILE) < 0.01, 'a box falling onto a thin platform stands on it');
  const u = makeBody(3.5 * TILE, 3 * TILE + 1, 16, 40);
  u.y = 5 * TILE - 40; u.vy = -8;
  for (let i = 0; i < 6; i++) { moveY(lv, u, u.vy, []); u.vy += 0.42; }
  ok(u.y < 3 * TILE, 'a box jumping up passes through a thin platform');
  const w = makeBody(8 * TILE, 5 * TILE - 40, 16, 40);
  moveX(lv, w, 200);
  ok(w.x + w.w <= 10 * TILE + 0.01 && w.wall === 1, 'the map edge is a wall');
  const c = makeBody(7 * TILE + 4, 0, 16, 40);
  for (let i = 0; i < 80 && !c.bounced; i++) { c.vy = Math.min(c.vy + 0.42, 9); moveY(lv, c, c.vy, []); }
  ok(c.bounced, 'landing on a cushion bounces');
}

// ---------------------------------------------------------------- save
section('save');
{
  loadSave(false);
  ok(!save.unlocked('tubes') && save.unlocked('town'), 'the water park starts locked');
  save.finishLevel('town', 500, 2);
  ok(save.unlocked('tubes') && save.unlocked('flume'), 'running the town opens the water park');
  ok(!save.finishLevel('town', 400, 1) && save.data.best.town === 500 && save.data.stars.town === 2, 'a worse run keeps the best score and stars');
  ok(save.finishLevel('town', 900, 3) && save.data.stars.town === 3, 'a better run is a new best');
  save.addNeed('biscuit', 'food', 99);
  ok(save.needs('biscuit').food === NEED_MAX, 'needs never go over the top');
  save.addNeed('biscuit', 'food', -99);
  ok(save.needs('biscuit').food === 0, '...or under zero');
  for (const n of ['food', 'drink', 'play'] as const) save.addNeed('sly', n, 3);
  ok(save.isHappy('sly') && !save.isHappy('crush'), 'a cat with every need full is happy');
}

// ---------------------------------------------------------------- reachability
if (!process.argv.includes('--quick')) {
  section('reachability (every cat, every challenge, every golden fish)');
  for (const id of LEVEL_IDS) {
    for (const cat of CAT_IDS) {
      const r = reach(LEVELS[id], cat, { logs: LEVELS[id].theme === 'flume' });
      ok(r.goal, `${id}: ${cat} can reach the goal${r.closest ? ` (got as close as tile ${r.closest.x},${r.closest.y})` : ''}`);
      ok(r.gold === r.goldTotal, `${id}: ${cat} can reach every golden fish (missed ${JSON.stringify(r.missedGold)})`);
      process.stdout.write('.');
    }
  }
  console.log();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
