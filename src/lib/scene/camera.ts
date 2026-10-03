// A 2D camera over the projected plane: follow, bounds, shake, and the last step of world -> screen.
//
// The pipeline this completes has three stages, and keeping them separate is the whole point:
//
//   world (tiles, or whatever the simulation counts in)
//     -> src/scene/projection.ts ->  scene pixels   (a fixed map; the same for every frame)
//     -> this camera             ->  screen pixels  (a per-frame translation)
//
// So the camera is view-agnostic. It never learns whether the world is a flat dungeon or an
// isometric one, because by the time a coordinate reaches it, it is already a pixel on the plane.
// A camera written for a top-down game therefore works unchanged on an isometric one, which is not
// true of the two hand-written cameras this generalises.
//
// It is `Aether & Brass`'s `engine/camera.ts` (ease, lock bounds, shake, the lead limit) with the
// y axis it never had, plus the level clamp and the "centre a world smaller than the view" rule
// Gauntlet's `MapRenderer` carries. Both games' behaviour is reachable from the options.
//
// NOT DETERMINISTIC, deliberately: `shake` draws from `Math.random` by default, and the camera is
// visual state that must never reach the simulation. Aether & Brass excludes camera shake from its
// lockstep checksum for exactly this reason. Pass `random` if you want a seeded one anyway.
import { clamp } from '../engine/math.ts';
import type { Rect } from '../engine/math.ts';
import { screenToWorld, worldToScreen, type Projection, type ScreenPoint, type TileCoord } from './projection.ts';

/** What `follow` reads off each thing it is following. Declared structurally so nothing has to import a game's player type. */
export interface CameraTarget {
  /** Position in SCENE pixels -- project a world position first. */
  sx: number;
  sy: number;
  /** A target that is `alive: false` or `dead: true` is skipped. */
  alive?: boolean;
  dead?: boolean;
}

/** Options for `createCamera`. Only the view size is required. */
export interface CameraOptions {
  /** The visible area in screen px: the game's own internal render size, or the map viewport inside it. */
  viewW: number;
  viewH: number;
  /** Fraction of the view `x` and `y` ease toward the target each fixed step. 1 snaps. */
  ease?: number;
  /** World bounds in SCENE px the view is kept inside. Without them the camera is free. */
  bounds?: Rect | null;
  /**
   * How far across the view the leading target may get before the camera follows IT rather than the
   * party's mean. Aether & Brass's fix for one idle player vetoing the camera for everybody. Null is off.
   */
  leadLimit?: number | null;
  /** Multiplier on every `shake` -- a game's SCREEN SHAKE accessibility option lives here. 0 disables it. */
  shakeScale?: number;
  /** Source of shake jitter. Defaults to `Math.random`; pass a seeded one to make shake reproducible. */
  random?: () => number;
}

/** The camera returned by `createCamera`. */
export interface Camera {
  /** Top-left of the view in scene px. Assignable, but prefer `snapTo` / `centerOn`, which clamp. */
  x: number;
  y: number;
  /** Where `follow` wants to be; `x`/`y` ease toward it. */
  readonly targetX: number;
  readonly targetY: number;
  /** Current shake offset in px, already included by `toScreen`. */
  readonly shakeX: number;
  readonly shakeY: number;
  /** The visible area in screen px. */
  readonly viewW: number;
  readonly viewH: number;
  /** Fraction of the remaining distance covered per step. */
  ease: number;
  /** Multiplier on every `shake`. */
  shakeScale: number;
  /** Replace the world bounds (scene px); null frees the camera. */
  setBounds(bounds: Rect | null): void;
  /** Centre on a scene-px point, eased on the next `update`. */
  centerOn(sx: number, sy: number): void;
  /** Centre on the mean of the living targets, honouring `leadLimit`. Call once per fixed step. */
  follow(targets: readonly CameraTarget[]): void;
  /** Jump to a scene-px centre immediately, cancelling the ease. Use on a teleport or a scene change. */
  snapTo(sx: number, sy: number): void;
  /** Shake for `frames` frames at `intensity` px, scaled by `shakeScale`. The strongest call wins. */
  shake(intensity?: number, frames?: number): void;
  /** Advance the ease and decay the shake. Once per fixed step, after `follow`. */
  update(): void;
  /** Scene px -> screen px, shake included. Round at the draw site, not here. */
  toScreen(sx: number, sy: number): ScreenPoint;
  /**
   * Scene px -> screen px for a layer that scrolls at `factor` of the world's rate: the parallax
   * backdrop a strict 2D game is built out of. 1 is the world, 0.3 a distant skyline, 0 pinned to
   * the screen (a HUD). Shake is NOT scaled -- it is a camera knock, so every layer takes it whole.
   */
  toScreenAt(sx: number, sy: number, factor: number): ScreenPoint;
  /** World -> screen in one step, through `p`. */
  project(p: Projection, x: number, y: number, z?: number): ScreenPoint;
  /** Screen px (a pointer, say) -> the world tile under it on the plane at height `z`. */
  pick(p: Projection, screenX: number, screenY: number, z?: number): TileCoord;
  /** The visible area in SCENE px -- what `visibleTileRange` takes. Shake included, so nothing pops at the edge. */
  sceneRect(): Rect;
  /** The same, for a layer scrolling at `factor`: what to cull a parallax layer against. */
  sceneRectAt(factor: number): Rect;
  /** Is a scene-px point within the view, plus `margin`? */
  isVisible(sx: number, sy: number, margin?: number): boolean;
}

/** Create a camera. `viewW`/`viewH` are the visible area in screen px; everything else has a default. */
export function createCamera(opts: CameraOptions): Camera {
  const viewW = opts.viewW, viewH = opts.viewH;
  const random = opts.random === undefined ? Math.random : opts.random;
  const leadLimit = opts.leadLimit === undefined ? null : opts.leadLimit;
  let bounds: Rect | null = opts.bounds === undefined ? null : opts.bounds;
  let targetX = 0, targetY = 0;
  let shakeX = 0, shakeY = 0, shakeFrames = 0, shakeIntensity = 0;

  /**
   * Clamp a view top-left to the bounds. A world narrower or shorter than the view is CENTRED rather
   * than pinned to its left/top edge -- a 20x20 town in a 31x21 viewport looks wrong shoved into a corner.
   */
  function clampX(v: number): number {
    if (!bounds) return v;
    return bounds.w <= viewW ? bounds.x + (bounds.w - viewW) / 2 : clamp(v, bounds.x, bounds.x + bounds.w - viewW);
  }
  function clampY(v: number): number {
    if (!bounds) return v;
    return bounds.h <= viewH ? bounds.y + (bounds.h - viewH) / 2 : clamp(v, bounds.y, bounds.y + bounds.h - viewH);
  }

  const cam: Camera = {
    x: 0,
    y: 0,
    viewW, viewH,
    ease: opts.ease === undefined ? 0.12 : opts.ease,
    shakeScale: opts.shakeScale === undefined ? 1 : opts.shakeScale,
    get targetX() { return targetX; },
    get targetY() { return targetY; },
    get shakeX() { return shakeX; },
    get shakeY() { return shakeY; },

    setBounds(next) {
      bounds = next;
      targetX = clampX(targetX);
      targetY = clampY(targetY);
      cam.x = clampX(cam.x);
      cam.y = clampY(cam.y);
    },

    centerOn(sx, sy) {
      targetX = clampX(sx - viewW / 2);
      targetY = clampY(sy - viewH / 2);
    },

    follow(targets) {
      let sumX = 0, sumY = 0, n = 0, leadX = -Infinity;
      for (const t of targets) {
        if (!t || t.alive === false || t.dead === true) continue;
        sumX += t.sx; sumY += t.sy; n++;
        if (t.sx > leadX) leadX = t.sx;
      }
      if (n === 0) return;
      // The mean keeps the party framed; the lead limit stops one straggler (or one person who put
      // the pad down) from holding the camera still while the leader is pinned against the edge.
      let wantX = sumX / n - viewW / 2;
      if (leadLimit !== null) wantX = Math.max(wantX, leadX - viewW * leadLimit);
      targetX = clampX(wantX);
      targetY = clampY(sumY / n - viewH / 2);
    },

    snapTo(sx, sy) {
      cam.centerOn(sx, sy);
      cam.x = targetX;
      cam.y = targetY;
    },

    shake(intensity = 4, frames = 10) {
      const k = intensity * cam.shakeScale;
      if (k <= 0) return;
      shakeIntensity = Math.max(shakeIntensity, k);
      shakeFrames = Math.max(shakeFrames, frames);
    },

    update() {
      cam.x = clampX(cam.x + (targetX - cam.x) * cam.ease);
      cam.y = clampY(cam.y + (targetY - cam.y) * cam.ease);
      // Settle exactly rather than approaching forever: a camera a hundredth of a pixel off target
      // still rounds to a different screen pixel some frames and shimmers the whole scene.
      if (Math.abs(targetX - cam.x) < 0.05) cam.x = targetX;
      if (Math.abs(targetY - cam.y) < 0.05) cam.y = targetY;
      if (shakeFrames > 0) {
        shakeFrames--;
        // Ramp the last eight frames down so the shake ends rather than stopping.
        const k = shakeIntensity * (0.5 + 0.5 * Math.min(1, shakeFrames / 8));
        shakeX = Math.round((random() * 2 - 1) * k);
        shakeY = Math.round((random() * 2 - 1) * k * 0.6);
        if (shakeFrames === 0) { shakeIntensity = 0; shakeX = 0; shakeY = 0; }
      }
    },

    toScreen(sx, sy) { return { sx: sx - cam.x + shakeX, sy: sy - cam.y + shakeY }; },

    toScreenAt(sx, sy, factor) { return { sx: sx - cam.x * factor + shakeX, sy: sy - cam.y * factor + shakeY }; },

    project(p, x, y, z = 0) {
      const s = worldToScreen(p, x, y, z);
      return { sx: s.sx - cam.x + shakeX, sy: s.sy - cam.y + shakeY };
    },

    pick(p, screenX, screenY, z = 0) {
      const w = screenToWorld(p, screenX + cam.x - shakeX, screenY + cam.y - shakeY, z);
      return { x: Math.floor(w.x), y: Math.floor(w.y) };
    },

    sceneRect() { return { x: cam.x - shakeX, y: cam.y - shakeY, w: viewW, h: viewH }; },

    sceneRectAt(factor) { return { x: cam.x * factor - shakeX, y: cam.y * factor - shakeY, w: viewW, h: viewH }; },

    isVisible(sx, sy, margin = 0) {
      const s = cam.toScreen(sx, sy);
      return s.sx >= -margin && s.sy >= -margin && s.sx <= viewW + margin && s.sy <= viewH + margin;
    },
  };
  return cam;
}
