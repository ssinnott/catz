// World -> screen projection for flat 2D, 3/4 top-down and isometric views.
//
// All three games in this account draw a ground plane and put things on it, and all three do it with
// the same arithmetic written three times:
//
//   Gauntlet (3/4 top-down)   sx = x * TILE - camX             sy = y * TILE - camY
//   Foodie Truck (flat 2D)    sx = x - camX                    sy = y - camY
//   Aether & Brass (band)     sx = x - camX                    sy = FLOOR_TOP + depth - height
//
// Those are one formula. A ground position is two world axes and a height off the plane, and the
// screen position is a fixed linear map of them:
//
//   sx = originX + x * xx + y * yx
//   sy = originY + x * xy + y * yy - z * zScale
//
// `x` runs east, `y` runs south INTO the screen (so it is depth, not height), and `z` is height
// above the ground plane, positive up. That last choice is the one worth reading twice: Aether &
// Brass names its depth axis `z` and its height axis `y`, which is the opposite of the convention
// here. Its `z` is this module's `y` and its `y` is this module's `z`; nothing else about it moves.
//
// The whole of a view's character is then four numbers -- the screen delta for one step of x
// (`xx`, `xy`) and for one step of y (`yx`, `yy`):
//
//   flat / top-down    xx = tileW   xy = 0          yx = 0        yy = tileH
//   isometric 2:1      xx = tileW/2 xy = tileH/2    yx = -tileW/2 yy = tileH/2
//   a depth band       xx = 1       xy = 0          yx = 0        yy = 1     (A&B, with tiles of 1px)
//
// Being linear buys three things that are otherwise written by hand per game: an exact inverse (so a
// pointer becomes a tile with no search), a depth key for the painter's algorithm that is correct in
// every one of those views (see `depthOf`), and a visible-tile range from the camera rect.
//
// DETERMINISM: every function here uses only + - * / on its inputs, so results are bit-identical
// across engines and safe on the simulation path (src/engine/trig.ts explains why that matters).
import type { Rect } from '../engine/math.ts';

/** A point in scene pixels: the projected plane, BEFORE the camera offset. */
export interface ScreenPoint {
  sx: number;
  sy: number;
}

/** A tile coordinate; integers, unlike the continuous world coordinates a projection takes. */
export interface TileCoord {
  x: number;
  y: number;
}

/** An inclusive rectangle of tiles, as returned by `visibleTileRange`. */
export interface TileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A world -> screen map. Build one with `flatProjection`, `isoProjection` or `makeProjection`; the
 * fields are frozen because `det` is derived from the basis and must not drift out of step with it.
 */
export interface Projection {
  /** Screen x/y added per +1 of world x. */
  readonly xx: number;
  readonly xy: number;
  /** Screen x/y added per +1 of world y (depth). */
  readonly yx: number;
  readonly yy: number;
  /** Screen pixels UP per +1 of world z (height off the plane). */
  readonly zScale: number;
  /** Where world (0, 0, 0) lands, in scene pixels. */
  readonly originX: number;
  readonly originY: number;
  /** The footprint of one tile, for art that has to fit it (a floor sprite, a wall face). */
  readonly tileW: number;
  readonly tileH: number;
  /** xx*yy - xy*yx, the basis determinant. Non-zero by construction; `screenToWorld` divides by it. */
  readonly det: number;
}

/** The basis of a projection, plus where the origin sits. `makeProjection` fills in the rest. */
export interface ProjectionSpec {
  xx: number;
  xy: number;
  yx: number;
  yy: number;
  /** Screen pixels up per +1 z. Defaults to `tileH`, i.e. one tile of height per tile of depth. */
  zScale?: number;
  originX?: number;
  originY?: number;
  /** One tile's footprint. Defaults to the bounding box of one x step plus one y step. */
  tileW?: number;
  tileH?: number;
}

/** Options shared by `flatProjection` and `isoProjection`. */
export interface TileProjectionOptions {
  /** Tile width in screen px. */
  tileW?: number;
  /** Tile height in screen px. For `isoProjection` this is the diamond's height, so 2:1 is tileW/2. */
  tileH?: number;
  /** Screen px up per +1 z. Defaults to `tileH`. */
  zScale?: number;
  /** Where world (0,0,0) lands in scene px. */
  originX?: number;
  originY?: number;
}

/**
 * Build a projection from a raw basis. Use this for a view none of the named constructors covers --
 * a dimetric 2:1 that is not axis-symmetric, a mirrored axis, a sheared band.
 * @throws if the basis is degenerate (`det` of 0), which would make `screenToWorld` divide by zero.
 */
export function makeProjection(spec: ProjectionSpec): Projection {
  const { xx, xy, yx, yy } = spec;
  const det = xx * yy - xy * yx;
  if (!det) throw new Error('projection: degenerate basis (xx*yy - xy*yx is 0), no inverse exists');
  const tileW = spec.tileW === undefined ? Math.abs(xx) + Math.abs(yx) : spec.tileW;
  const tileH = spec.tileH === undefined ? Math.abs(xy) + Math.abs(yy) : spec.tileH;
  return Object.freeze({
    xx, xy, yx, yy,
    zScale: spec.zScale === undefined ? tileH : spec.zScale,
    originX: spec.originX === undefined ? 0 : spec.originX,
    originY: spec.originY === undefined ? 0 : spec.originY,
    tileW, tileH, det,
  });
}

/**
 * A flat grid: +x is right, +y is straight down the screen. This is the top-down and 3/4 view
 * (Gauntlet), and with `tileW`/`tileH` of 1 it is also a pixel-space world with a camera offset
 * (Foodie Truck) or a beat-em-up's depth band (Aether & Brass).
 */
export function flatProjection(opts: TileProjectionOptions = {}): Projection {
  const tileW = opts.tileW === undefined ? 1 : opts.tileW;
  const tileH = opts.tileH === undefined ? tileW : opts.tileH;
  return makeProjection({ xx: tileW, xy: 0, yx: 0, yy: tileH, tileW, tileH, zScale: opts.zScale, originX: opts.originX, originY: opts.originY });
}

/**
 * The isometric diamond: +x goes right and down, +y goes left and down, so a tile is a rhombus
 * `tileW` across and `tileH` tall and the world (0,0) corner is the diamond's TOP corner.
 *
 * The default 64x32 is the 2:1 ratio pixel art almost always uses, because a 2:1 diamond's edges
 * step exactly two pixels across per pixel down and so stay crisp without antialiasing.
 */
export function isoProjection(opts: TileProjectionOptions = {}): Projection {
  const tileW = opts.tileW === undefined ? 64 : opts.tileW;
  const tileH = opts.tileH === undefined ? tileW / 2 : opts.tileH;
  return makeProjection({
    xx: tileW / 2, xy: tileH / 2, yx: -tileW / 2, yy: tileH / 2,
    tileW, tileH, zScale: opts.zScale, originX: opts.originX, originY: opts.originY,
  });
}

/** World (x, y, z) -> scene pixels. `z` is height off the ground plane and moves the result UP. */
export function worldToScreen(p: Projection, x: number, y: number, z: number = 0): ScreenPoint {
  return { sx: p.originX + x * p.xx + y * p.yx, sy: p.originY + x * p.xy + y * p.yy - z * p.zScale };
}

/**
 * Scene pixels -> world, on the plane at height `z`. The exact inverse of `worldToScreen`, which is
 * what makes pointer picking a division rather than a search over tiles.
 */
export function screenToWorld(p: Projection, sx: number, sy: number, z: number = 0): TileCoord {
  const dx = sx - p.originX;
  const dy = sy - p.originY + z * p.zScale;
  return { x: (dx * p.yy - dy * p.yx) / p.det, y: (dy * p.xx - dx * p.xy) / p.det };
}

/** The tile a scene pixel falls in, on the plane at height `z`. Floors `screenToWorld`. */
export function screenToTile(p: Projection, sx: number, sy: number, z: number = 0): TileCoord {
  const w = screenToWorld(p, sx, sy, z);
  return { x: Math.floor(w.x), y: Math.floor(w.y) };
}

/** The centre of tile (tx, ty) in scene pixels -- where a thing standing on that tile is drawn. */
export function tileCenter(p: Projection, tx: number, ty: number, z: number = 0): ScreenPoint {
  return worldToScreen(p, tx + 0.5, ty + 0.5, z);
}

/**
 * The four corners of tile (tx, ty), in winding order from the world (tx, ty) corner. In an
 * isometric view that is the diamond's top, right, bottom and left points; in a flat one it is the
 * usual top-left/top-right/bottom-right/bottom-left rectangle.
 */
export function tileCorners(p: Projection, tx: number, ty: number, z: number = 0): ScreenPoint[] {
  return [
    worldToScreen(p, tx, ty, z),
    worldToScreen(p, tx + 1, ty, z),
    worldToScreen(p, tx + 1, ty + 1, z),
    worldToScreen(p, tx, ty + 1, z),
  ];
}

/** Trace a polygon (`tileCorners`, a wall face) as a closed path. Does not fill or stroke it. */
export function tracePolygon(ctx: CanvasRenderingContext2D, points: readonly ScreenPoint[], offsetX: number = 0, offsetY: number = 0): void {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].sx + offsetX, points[0].sy + offsetY);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].sx + offsetX, points[i].sy + offsetY);
  ctx.closePath();
}

/**
 * The painter's-algorithm key for a ground position: how far DOWN the screen its footprint sits,
 * which is exactly `worldToScreen(...).sy` with the origin and the height term dropped.
 *
 * One expression, and it reduces to the rule each view is normally given by hand:
 *   flat / top-down    x*0 + y*tileH        -> sorts by row, which is Gauntlet's row-order pass
 *   isometric 2:1      (x + y) * tileH/2    -> sorts by the diagonal, the standard iso order
 *   a depth band       x*0 + y*1            -> sorts by depth, which is A&B's `depthCompare`
 *
 * Height is deliberately NOT in it: two things on the same ground tile, one of them airborne, must
 * keep a stable order rather than swapping as one jumps. src/scene/depth.ts settles that tie.
 */
export function depthOf(p: Projection, x: number, y: number): number {
  return x * p.xy + y * p.yy;
}

/** Options for `visibleTileRange`. */
export interface VisibleTileOptions {
  /** Extra tiles on every side. Tall art (a wall, a tree) needs enough rows to catch what leans in. */
  margin?: number;
  /** Clamp the result to a grid of this size. Without it the range can be negative or past the edge. */
  bounds?: { readonly w: number; readonly h: number };
}

/**
 * The inclusive tile range covering `view` (a rect in SCENE pixels -- `Camera.sceneRect()`).
 *
 * In a flat view this is exact. In an isometric one the visible region is a rotated rectangle, so
 * the axis-aligned tile range around it over-covers by about a factor of two; that is the standard
 * trade and it is still vastly cheaper than iterating a whole level. Anything drawn taller than one
 * tile needs `margin` raised to cover it: ceil(maxHeightPx / tileH) is the conservative figure.
 */
export function visibleTileRange(p: Projection, view: Rect, opts: VisibleTileOptions = {}): TileRange {
  const margin = opts.margin === undefined ? 0 : opts.margin;
  const corners = [
    screenToWorld(p, view.x, view.y),
    screenToWorld(p, view.x + view.w, view.y),
    screenToWorld(p, view.x + view.w, view.y + view.h),
    screenToWorld(p, view.x, view.y + view.h),
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  let x0 = Math.floor(minX) - margin, y0 = Math.floor(minY) - margin;
  let x1 = Math.floor(maxX) + margin, y1 = Math.floor(maxY) + margin;
  const bounds = opts.bounds;
  if (bounds) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(bounds.w - 1, x1); y1 = Math.min(bounds.h - 1, y1);
  }
  return { x0, y0, x1, y1 };
}
