// Platformer collision: an axis-aligned box swept against the tile grid, x then y, plus the moving
// platforms (logs) a box can stand on and ride.
//
// The engine's scene layer stops short of this on purpose (src/lib/scene/ SCENE_LAYER.md, "the
// known gap is collision"): only one game had continuous collision, and the library waits for a
// second data point before it abstracts anything. This file is that second data point, written in
// the game first, the way every module in the library started.
//
// Rules, all standard and all easy to get subtly wrong:
//   * x first, then y, each clamped to the first blocking tile edge it crosses -- so a cat running
//     into a wall while falling slides down it rather than sticking;
//   * a one-way platform blocks only a box moving DOWN whose feet were at or above its top last
//     step, and not at all while the box is dropping through on purpose;
//   * gravity is applied every step even when standing, and landing is re-detected every step: a box
//     is on the ground because it just failed to fall, never because a flag said so.
import { TILE } from '../config.ts';
import { C_ONEWAY, C_BOUNCE, C_CRACK, C_SOLID, colAt, tileOf, type Level } from './level.ts';

export interface Platform {
  /** The walkable top: from x to x + w at height y, world px. */
  x: number;
  y: number;
  w: number;
  /** How far it moved this step; riders are carried by exactly this. */
  dx: number;
  dy: number;
  alive: boolean;
}

export interface Body {
  /** Top-left of the box, world px. */
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** The moving platform under the box, if it is standing on one. */
  ride: Platform | null;
  /** -1 / 1 when the last horizontal move hit a wall on that side, else 0. */
  wall: number;
  ceiling: boolean;
  /** True on the step the box landed. */
  landed: boolean;
  /** True when the box landed on a bounce cushion this step. */
  bounced: boolean;
  /** Steps left during which one-way platforms are ignored (dropping through). */
  dropThrough: number;
  /** Tile the box was standing on when it last landed, for "break the block under me". */
  groundTile: { tx: number; ty: number } | null;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, ride: null, wall: 0, ceiling: false, landed: false, bounced: false, dropThrough: 0, groundTile: null };
}

function blocks(c: number): boolean { return c === C_SOLID || c === C_BOUNCE || c === C_CRACK; }

/** Move horizontally by dx, stopping at the first wall. */
export function moveX(lv: Level, b: Body, dx: number): void {
  b.wall = 0;
  if (!dx) return;
  const r0 = tileOf(b.y + 0.01), r1 = tileOf(b.y + b.h - 0.01);
  if (dx > 0) {
    const edge = b.x + b.w, c0 = tileOf(edge - 0.01), c1 = tileOf(edge + dx - 0.01);
    for (let c = c0 + 1; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) if (blocks(colAt(lv, c, r))) { b.x = c * TILE - b.w; b.wall = 1; return; }
    }
  } else {
    const edge = b.x, c0 = tileOf(edge + 0.01), c1 = tileOf(edge + dx + 0.01);
    for (let c = c0 - 1; c >= c1; c--) {
      for (let r = r0; r <= r1; r++) if (blocks(colAt(lv, c, r))) { b.x = (c + 1) * TILE; b.wall = -1; return; }
    }
  }
  b.x += dx;
}

/** Move vertically by dy, landing on floors, platforms and logs and bumping ceilings. */
export function moveY(lv: Level, b: Body, dy: number, platforms: readonly Platform[]): void {
  b.ceiling = false;
  const wasOnGround = b.onGround;
  b.onGround = false;
  b.landed = false;
  b.bounced = false;
  b.ride = null;
  const c0 = tileOf(b.x + 0.01), c1 = tileOf(b.x + b.w - 0.01);
  if (dy > 0) {
    const bottom = b.y + b.h, nb = bottom + dy;
    const r0 = tileOf(bottom - 0.01), r1 = tileOf(nb - 0.01);
    let landY = Infinity, landTile: { tx: number; ty: number } | null = null, bounce = false;
    for (let r = r0 + 1; r <= r1 && landY === Infinity; r++) {
      for (let c = c0; c <= c1; c++) {
        const code = colAt(lv, c, r);
        const top = r * TILE;
        if (blocks(code) || (code === C_ONEWAY && b.dropThrough <= 0 && bottom <= top + 0.5)) {
          if (top < landY) { landY = top; landTile = { tx: c, ty: r }; }
          if (code === C_BOUNCE) bounce = true;
        }
      }
    }
    let ride: Platform | null = null;
    for (const p of platforms) {
      if (!p.alive) continue;
      if (b.x + b.w <= p.x + 2 || b.x >= p.x + p.w - 2) continue;
      // was at or above its top (allowing for how far it rose this step), and would pass it now
      if (bottom <= p.y - p.dy + 1.5 && nb >= p.y && p.y < landY) { landY = p.y; ride = p; landTile = null; bounce = false; }
    }
    if (landY !== Infinity) {
      b.y = landY - b.h;
      b.vy = 0;
      b.onGround = true;
      b.landed = !wasOnGround;
      b.bounced = bounce;
      b.ride = ride;
      b.groundTile = landTile;
      return;
    }
  } else if (dy < 0) {
    const top = b.y, nt = top + dy;
    const r0 = tileOf(top + 0.01), r1 = tileOf(nt + 0.01);
    for (let r = r0 - 1; r >= r1; r--) {
      for (let c = c0; c <= c1; c++) {
        if (blocks(colAt(lv, c, r))) { b.y = (r + 1) * TILE; b.vy = 0; b.ceiling = true; return; }
      }
    }
  }
  b.y += dy;
}

/** Carry a rider along with the platform it stood on last step (before its own move). */
export function carry(lv: Level, b: Body, p: Platform): void {
  if (!p.alive) return;
  moveX(lv, b, p.dx);
  b.y = p.y - b.h;
}

/** Is there a box-blocking tile at this world point? */
export function solidAt(lv: Level, px: number, py: number): boolean {
  return blocks(colAt(lv, tileOf(px), tileOf(py)));
}

/** Could something stand at this world point (solid or one-way top)? */
export function floorAt(lv: Level, px: number, py: number): boolean {
  const c = colAt(lv, tileOf(px), tileOf(py));
  return blocks(c) || c === C_ONEWAY;
}

/** Would a box of this size fit here without overlapping a wall? */
export function fits(lv: Level, x: number, y: number, w: number, h: number): boolean {
  for (let r = tileOf(y + 0.01); r <= tileOf(y + h - 0.01); r++) {
    for (let c = tileOf(x + 0.01); c <= tileOf(x + w - 0.01); c++) if (blocks(colAt(lv, c, r))) return false;
  }
  return true;
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
