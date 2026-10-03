// Can every cat finish every level, and reach every golden fish?
//
// Answered by search, not by eye. This drives the game's own Player class (src/world/player.ts) in
// Node -- the same movement code the browser runs, fed through the input module's test hook -- and
// does a breadth-first search over the places a cat can STAND. From each standing spot it tries a
// handful of moves (walk, hop, full jump, run-up jump, a jump that steers late, dropping through a
// thin platform, Biscuit's double jump) and simulates each until the cat is standing again, or in
// the water. Every spot reached is a new node.
//
// Bad guys and water jets are left out: they can be bonked, ducked, jumped or waited out, so they
// never make a level impossible -- geometry does. The flume's logs move, so for the flume the stream
// is treated as solid wherever a log could float: that checks the docks are reachable from a log,
// which is the geometry question; the timing one is the player's.
import { input, type Action } from '../src/core/input.ts';
import { Player } from '../src/world/player.ts';
import { Particles } from '../src/core/particles.ts';
import { C_WATER, colAt, inWater, parseLevel, type Level, type LevelDef } from '../src/world/level.ts';
import type { Platform } from '../src/world/physics.ts';
import type { CatId } from '../src/core/save.ts';
import { TILE } from '../src/config.ts';

interface Step { n: number; hold: Partial<Record<Action, boolean>> }
interface Move { name: string; steps: Step[]; then: Partial<Record<Action, boolean>> }

const HELD: Action[] = ['left', 'right', 'jump', 'down', 'special'];

function moves(cat: CatId): Move[] {
  const out: Move[] = [];
  for (const d of [-1, 1] as const) {
    const dir: Action = d < 0 ? 'left' : 'right';
    out.push({ name: `walk${d}`, steps: [{ n: 10, hold: { [dir]: true } }], then: {} });
    out.push({ name: `run${d}`, steps: [{ n: 30, hold: { [dir]: true } }], then: {} });
    out.push({ name: `hop${d}`, steps: [{ n: 5, hold: { jump: true, [dir]: true } }], then: { [dir]: true } });
    out.push({ name: `jump${d}`, steps: [{ n: 90, hold: { jump: true, [dir]: true } }], then: { [dir]: true } });
    out.push({ name: `runjump${d}`, steps: [{ n: 14, hold: { [dir]: true } }, { n: 90, hold: { jump: true, [dir]: true } }], then: { [dir]: true } });
    out.push({ name: `late${d}`, steps: [{ n: 14, hold: { jump: true } }, { n: 90, hold: { jump: true, [dir]: true } }], then: { [dir]: true } });
    out.push({ name: `drop${d}`, steps: [{ n: 3, hold: { down: true, jump: true } }, { n: 40, hold: { [dir]: true } }], then: { [dir]: true } });
    if (cat === 'biscuit') {
      out.push({ name: `double${d}`, steps: [{ n: 16, hold: { jump: true, [dir]: true } }, { n: 3, hold: { [dir]: true } }, { n: 90, hold: { jump: true, [dir]: true } }], then: { [dir]: true } });
    }
  }
  out.push({ name: 'up', steps: [{ n: 90, hold: { jump: true } }], then: {} });
  return out;
}

export interface ReachResult {
  goal: boolean;
  gold: number;
  goldTotal: number;
  /** Golden fish nobody could reach: their tile positions. */
  missedGold: { tx: number; ty: number }[];
  nodes: number;
  /** Set when the goal could not be reached: the standing spot nearest to it. */
  closest?: { x: number; y: number };
}

/** Floating platforms where logs would be: the flume's stream, as something a cat could stand on. */
function streamPlatforms(lv: Level): Platform[] {
  const out: Platform[] = [];
  let start = -1;
  for (let tx = 0; tx <= lv.w; tx++) {
    const top = tx < lv.w ? lv.waterTop[tx] : Infinity;
    const prev = tx > 0 ? lv.waterTop[tx - 1] : Infinity;
    if (start >= 0 && (top !== prev || top === Infinity)) {
      out.push({ x: start * TILE, y: prev - 6, w: (tx - start) * TILE, dx: 0, dy: 0, alive: true });
      start = -1;
    }
    if (start < 0 && top !== Infinity) start = tx;
  }
  return out;
}

export function reach(def: LevelDef, cat: CatId, opts: { logs?: boolean; budget?: number } = {}): ReachResult {
  const lv = parseLevel(def);
  const parts = new Particles();
  const platforms = opts.logs ? streamPlatforms(lv) : [];
  const goalSpawn = lv.spawns.find((s) => s.kind === 'goal');
  const golds = lv.spawns.filter((s) => s.kind === 'goldfish').map((s) => ({ tx: s.tx, ty: s.ty, x: s.x, y: s.y - 10, got: false }));
  const p = new Player(cat, lv.start.x, lv.start.y);
  const MOVES = moves(cat);
  const seen = new Set<string>();
  const queue: { x: number; y: number }[] = [];
  let goal = false;
  let closest = { x: lv.start.x, y: lv.start.y }, closeD = Infinity;
  const key = (x: number, y: number) => `${Math.round(x / 6)},${Math.round(y)}`;
  const dead = () => inWater(lv, p.feetX, p.centerY + 4) || p.feetY > lv.ph + 30;

  function setHolds(h: Partial<Record<Action, boolean>>): void { for (const a of HELD) input.force(a, !!h[a]); }

  /** Run one move from a standing spot. Returns where the cat ends up standing, or null. */
  function run(x: number, y: number, m: Move): { x: number; y: number } | null {
    p.placeAt(x, y, 1);
    p.cooldown = 0;
    setHolds({}); input.poll(); p.update(lv, platforms, parts);
    let f = 0;
    const touch = () => {
      const b = p.body;
      for (const g of golds) if (!g.got && Math.abs(g.x - (b.x + b.w / 2)) < b.w / 2 + 12 && g.y > b.y - 10 && g.y < b.y + b.h + 10) g.got = true;
      if (goalSpawn && Math.abs(goalSpawn.x - p.feetX) < 24 && Math.abs(goalSpawn.y - p.feetY) < 60) goal = true;
    };
    // A move that leaves the ground ends when it lands again: holding the direction on would run
    // the cat off the far side of whatever it just landed on.
    let airborne = false;
    steps: for (const s of m.steps) {
      for (let i = 0; i < s.n; i++, f++) {
        setHolds(s.hold); input.poll(); p.update(lv, platforms, parts);
        if (dead()) return null;
        touch();
        if (!p.body.onGround) airborne = true;
        else if (airborne) break steps;
      }
    }
    for (let i = 0; i < 200; i++) {
      if (p.body.onGround && (i > 1 || airborne)) break;
      setHolds(m.then); input.poll(); p.update(lv, platforms, parts);
      if (dead()) return null;
      touch();
    }
    // settle: stop moving, let any landing finish
    for (let i = 0; i < 40 && (Math.abs(p.body.vx) > 0.05 || !p.body.onGround); i++) {
      setHolds({}); input.poll(); p.update(lv, platforms, parts);
      if (dead()) return null;
      touch();
    }
    if (!p.body.onGround) return null;
    return { x: p.feetX, y: p.feetY };
  }

  const budget = opts.budget ?? 6000;
  queue.push({ x: lv.start.x, y: lv.start.y });
  seen.add(key(lv.start.x, lv.start.y));
  let nodes = 0;
  while (queue.length && nodes < budget) {
    const s = queue.shift()!;
    nodes++;
    if (goalSpawn) {
      const d = Math.hypot(goalSpawn.x - s.x, goalSpawn.y - s.y);
      if (d < closeD) { closeD = d; closest = s; }
    }
    for (const m of MOVES) {
      const e = run(s.x, s.y, m);
      if (!e) continue;
      const k = key(e.x, e.y);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(e);
    }
    if (goal && golds.every((g) => g.got)) break;
  }
  setHolds({}); input.poll();
  const got = golds.filter((g) => g.got).length;
  return {
    goal, gold: got, goldTotal: golds.length, nodes,
    missedGold: golds.filter((g) => !g.got).map((g) => ({ tx: g.tx, ty: g.ty })),
    closest: goal ? undefined : { x: Math.round(closest.x / TILE), y: Math.round(closest.y / TILE) },
  };
}

// Run directly: node tools/reach.ts <level> [cat]
if (process.argv[1] && process.argv[1].endsWith('reach.ts')) {
  const { LEVELS } = await import('../src/levels/index.ts');
  const { CAT_IDS } = await import('../src/core/save.ts');
  const which = process.argv[2] || 'town';
  const cats = process.argv[3] ? [process.argv[3] as CatId] : [...CAT_IDS];
  const def = LEVELS[which as keyof typeof LEVELS];
  for (const c of cats) {
    const t0 = Date.now();
    const r = reach(def, c, { logs: def.theme === 'flume' });
    console.log(`${which} ${c.padEnd(9)} goal:${r.goal ? 'yes' : 'NO '} gold:${r.gold}/${r.goldTotal} nodes:${r.nodes} ${Date.now() - t0}ms` +
      (r.missedGold.length ? ` missed:${JSON.stringify(r.missedGold)}` : '') + (r.closest ? ` closest:${JSON.stringify(r.closest)}` : ''));
  }
  void colAt; void C_WATER;
}
