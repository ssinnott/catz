// Levels are drawn in ASCII, one character per 24 px tile, and parsed into three things: a
// collision grid (what a cat stands on, bumps into or falls in), an art grid (what each solid tile
// looks like), and a list of spawns (cats, bad guys, fish, hazards, the goal).
//
//   terrain   #  ground / wall        B  brick / plank wall     =  thin platform you can jump up through
//             ~  deep water           O  bounce cushion         X  cracked block (Crush can smash it)
//             T  trash can            K  crate                  k  bench (stand on it)
//             h  fire hydrant         m  mailbox
//   spawns    P  the cat starts here  C  checkpoint bell        E  the goal
//             f  fish treat           F  golden fish
//             r  rat     R  raccoon bandit     D  bulldog     p  pigeon     c  crab     g  frog
//             > <  water jet in a wall, shooting right / left   v  sewer pipe pouring from above
//             S  splash geyser (in water)                       L  logs come from here (on water)
//   decor     l  lamp post   t  tree   b  bush   u  flowers   z  fence   n  sign   s  station (playhouse)
//
// Everything is in world px from here on: x right, y DOWN, a tile is TILE px square. The scene
// layer's flatProjection with 1 px tiles is the projection (strict 2D, see src/lib/scene/).
import { TILE } from '../config.ts';
import { createByteGrid, gridGet, gridSet, type Grid } from '../lib/scene/grid.ts';
import type { LevelId } from '../core/save.ts';

export const C_EMPTY = 0, C_SOLID = 1, C_ONEWAY = 2, C_WATER = 3, C_BOUNCE = 4, C_CRACK = 5;

export type Theme = 'town' | 'tubes' | 'flume' | 'house';

export type SpawnKind =
  | 'start' | 'checkpoint' | 'goal' | 'fish' | 'goldfish'
  | 'rat' | 'raccoon' | 'dog' | 'pigeon' | 'crab' | 'frog'
  | 'jetR' | 'jetL' | 'pour' | 'geyser' | 'logs'
  | 'lamp' | 'tree' | 'bush' | 'flowers' | 'fence' | 'sign' | 'station';

export interface Spawn {
  kind: SpawnKind;
  /** Tile coordinates. */
  tx: number;
  ty: number;
  /** World px of the tile's bottom-centre: where a thing standing in that tile has its feet. */
  x: number;
  y: number;
  /** Running index per kind, used to stagger timers and name stations. */
  index: number;
}

export interface LevelDef {
  id: LevelId | 'house';
  name: string;
  theme: Theme;
  music: string;
  rows: readonly string[];
  /** Seconds: finish inside this for the full time bonus. */
  par: number;
  /** Score for the second star. */
  silver: number;
  /** Lines the cat says at the start. */
  intro: string;
  /** Logs on this level drift right at this speed, px/frame. */
  stream?: number;
  /** Frames between logs from each spawner. */
  logEvery?: number;
  /** Station names for the playhouse, by index, left to right. */
  stations?: readonly string[];
}

export interface Level {
  def: LevelDef;
  /** Size in tiles. */
  w: number;
  h: number;
  /** Size in px. */
  pw: number;
  ph: number;
  col: Grid<number>;
  /** The map character of each tile (its char code), for the tile art. */
  art: Grid<number>;
  spawns: Spawn[];
  start: { x: number; y: number };
  /** Per column: y px of the topmost water surface, or Infinity. */
  waterTop: Float64Array;
}

const TERRAIN: Readonly<Record<string, number>> = {
  '#': C_SOLID, B: C_SOLID, '=': C_ONEWAY, '~': C_WATER, O: C_BOUNCE, X: C_CRACK,
  T: C_SOLID, K: C_SOLID, k: C_ONEWAY, h: C_SOLID, m: C_SOLID,
  '>': C_SOLID, '<': C_SOLID, v: C_SOLID, S: C_WATER, L: C_WATER,
};

const SPAWN: Readonly<Record<string, SpawnKind>> = {
  P: 'start', C: 'checkpoint', E: 'goal', f: 'fish', F: 'goldfish',
  r: 'rat', R: 'raccoon', D: 'dog', p: 'pigeon', c: 'crab', g: 'frog',
  '>': 'jetR', '<': 'jetL', v: 'pour', S: 'geyser', L: 'logs',
  l: 'lamp', t: 'tree', b: 'bush', u: 'flowers', z: 'fence', n: 'sign', s: 'station',
};

/** Every character a map may use. tools/gametest.ts rejects anything else. */
export const LEGEND = new Set(['.', ' ', ...Object.keys(TERRAIN), ...Object.keys(SPAWN)]);

export function parseLevel(def: LevelDef): Level {
  const h = def.rows.length, w = Math.max(...def.rows.map((r) => r.length));
  const col = createByteGrid(w, h, C_EMPTY);
  const art = createByteGrid(w, h, 0);
  const spawns: Spawn[] = [];
  const counts: Partial<Record<SpawnKind, number>> = {};
  let start = { x: 2 * TILE, y: 2 * TILE };
  for (let ty = 0; ty < h; ty++) {
    const row = def.rows[ty];
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx] ?? '.';
      const c = TERRAIN[ch];
      if (c !== undefined) { gridSet(col, tx, ty, c); gridSet(art, tx, ty, ch.charCodeAt(0)); }
      const kind = SPAWN[ch];
      if (kind) {
        const index = counts[kind] ?? 0;
        counts[kind] = index + 1;
        const s: Spawn = { kind, tx, ty, x: (tx + 0.5) * TILE, y: (ty + 1) * TILE, index };
        spawns.push(s);
        if (kind === 'start') start = { x: s.x, y: s.y };
      }
    }
  }
  // Water fills down: a column of '~' under a spawner is all water.
  const waterTop = new Float64Array(w).fill(Infinity);
  for (let tx = 0; tx < w; tx++) {
    for (let ty = 0; ty < h; ty++) if (gridGet(col, tx, ty, C_EMPTY) === C_WATER) { waterTop[tx] = ty * TILE + 4; break; }
  }
  return { def, w, h, pw: w * TILE, ph: h * TILE, col, art, spawns, start, waterTop };
}

/** Collision code at a tile; outside the map left/right is wall, above is air, below is water. */
export function colAt(lv: Level, tx: number, ty: number): number {
  if (tx < 0 || tx >= lv.w) return C_SOLID;
  if (ty < 0) return C_EMPTY;
  if (ty >= lv.h) return C_WATER;
  return lv.col.cells[ty * lv.w + tx];
}

export function artAt(lv: Level, tx: number, ty: number): string {
  if (tx < 0 || ty < 0 || tx >= lv.w || ty >= lv.h) return '';
  const c = lv.art.cells[ty * lv.w + tx];
  return c ? String.fromCharCode(c) : '';
}

export function isSolidCode(c: number): boolean { return c === C_SOLID || c === C_BOUNCE || c === C_CRACK; }

/** World px -> tile index. */
export function tileOf(px: number): number { return Math.floor(px / TILE); }

/** Smash a cracked block. Returns true if there was one. */
export function breakTile(lv: Level, tx: number, ty: number): boolean {
  if (colAt(lv, tx, ty) !== C_CRACK) return false;
  gridSet(lv.col, tx, ty, C_EMPTY);
  gridSet(lv.art, tx, ty, 0);
  return true;
}

/** Is this world point inside a water tile? */
export function inWater(lv: Level, x: number, y: number): boolean {
  return colAt(lv, tileOf(x), tileOf(y)) === C_WATER;
}

/** The surface of the body of water containing this point: its top tile's top, plus the ripple. */
export function surfaceAt(lv: Level, x: number, y: number): number {
  const tx = tileOf(x);
  let ty = tileOf(y);
  while (ty > 0 && colAt(lv, tx, ty - 1) === C_WATER) ty--;
  return ty * TILE + 4;
}
