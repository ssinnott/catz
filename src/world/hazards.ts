// Water, in every form it comes in: the sewer jets of the tube maze (jump the low ones, duck the
// high ones), the pipes that pour from the ceiling, the flume's splash geysers, the logs that float
// down the stream and over its waterfalls, and the water itself, which is the one thing in the game
// that sends a cat back to its last checkpoint.
//
// Every hazard runs the same three-beat cycle -- quiet, a warning you can see and hear, then water
// -- so the timing is always readable: nothing ever fires without a gurgle and a drip first.
import { TILE } from '../config.ts';
import { sfx } from '../core/audio.ts';
import { C_WATER, colAt, isSolidCode, tileOf, type Level } from './level.ts';
import type { Platform } from './physics.ts';
import type { Particles } from '../core/particles.ts';

export interface Box { x: number; y: number; w: number; h: number }

type Phase = 'off' | 'warn' | 'on';

/** A cycle timer: `off` frames quiet, `warn` frames of warning, `on` frames of water. */
class Cycle {
  t: number;
  constructor(readonly off: number, readonly warn: number, readonly on: number, offset: number) { this.t = offset % (off + warn + on); }
  get period(): number { return this.off + this.warn + this.on; }
  step(k: number): void { this.t = (this.t + k) % this.period; }
  get phase(): Phase { return this.t < this.off ? 'off' : this.t < this.off + this.warn ? 'warn' : 'on'; }
  /** 0..1 progress through the current phase. */
  get u(): number {
    const t = this.t;
    return t < this.off ? t / this.off : t < this.off + this.warn ? (t - this.off) / this.warn : (t - this.off - this.warn) / this.on;
  }
}

const SEWER = '#7fc7b5', SEWER_DEEP = '#4f9a8a', FOAM = '#e9fff8';

/**
 * A sewer pipe in a wall that fires water shots along the tube. Its height above the floor is what
 * makes it a jump or a duck: a pipe just above the floor fires low shots (jump over them), a pipe a
 * tile higher fires them at head height (duck under them). It gurgles and drips before every shot.
 */
export class Jet {
  readonly dir: 1 | -1;
  readonly mouthX: number;
  readonly cy: number;
  /** How far a shot can travel before it hits a wall, px. */
  readonly maxLen: number;
  readonly kind: 'low' | 'high';
  private cyc: Cycle;
  private fired = false;
  readonly shots: Shot[] = [];

  constructor(lv: Level, tx: number, ty: number, dir: 1 | -1, index: number) {
    this.dir = dir;
    this.mouthX = dir > 0 ? (tx + 1) * TILE : tx * TILE;
    let below = 0;
    while (below < 6 && !isSolidCode(colAt(lv, tx + dir, ty + below + 1)) && colAt(lv, tx + dir, ty + below + 1) !== 2) below++;
    this.kind = below === 0 ? 'low' : 'high';
    // low shots skim just above the floor; high ones fly at head height, over a ducking cat
    this.cy = this.kind === 'low' ? (ty + 1) * TILE + below * TILE - 9 : (ty + 1) * TILE + below * TILE - 34;
    let n = 0;
    while (n < 40 && !isSolidCode(colAt(lv, tx + dir * (n + 1), tileOf(this.cy)))) n++;
    this.maxLen = Math.min(n, 16) * TILE;
    this.cyc = new Cycle(70, 40, 6, index * 53);
  }

  get phase(): Phase { return this.cyc.phase; }

  update(k: number, parts: Particles, near: boolean): void {
    this.cyc.step(k);
    const ph = this.cyc.phase;
    if (ph === 'on' && !this.fired) {
      this.fired = true;
      this.shots.push(new Shot(this.mouthX, this.cy, this.dir, this.maxLen));
      if (near) sfx('jet', 0.6, this.kind === 'low' ? 0.85 : 1.15);
      parts.burst('drop', this.mouthX + this.dir * 4, this.cy, 4, 2, this.dir > 0 ? 0 : Math.PI, 0.8, { color: FOAM, size: 1.5 });
    }
    if (ph !== 'on') this.fired = false;
    if (ph === 'warn' && near && Math.random() < 0.08 * k) parts.emit('drop', this.mouthX + this.dir * 2, this.cy + 3, { vx: this.dir * 0.4, vy: 0.5 });
    if (ph === 'warn' && near && this.cyc.t - this.cyc.off < k) sfx('gurgle', 0.45);
    for (const sh of this.shots) sh.update(k, parts);
    for (let i = this.shots.length - 1; i >= 0; i--) if (sh(this.shots[i])) this.shots.splice(i, 1);
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const mx = this.mouthX, cy = this.cy;
    // the pipe mouth, always visible: a ring sticking out of the wall
    ctx.fillStyle = '#1d1526';
    ctx.fillRect(Math.round(this.dir > 0 ? mx - 1 : mx - 6), Math.round(cy - 8), 7, 16);
    ctx.fillStyle = '#7d889b';
    ctx.fillRect(Math.round(this.dir > 0 ? mx : mx - 5), Math.round(cy - 7), 5, 14);
    ctx.fillStyle = '#a9b4c6';
    ctx.fillRect(Math.round(this.dir > 0 ? mx : mx - 5), Math.round(cy - 7), 5, 2);
    ctx.fillStyle = '#26303d';
    ctx.fillRect(Math.round(this.dir > 0 ? mx + 2 : mx - 4), Math.round(cy - 4), 2, 8);
    if (this.cyc.phase === 'warn') {
      // the warning: a wobbling bead of sewer water at the mouth, growing until it goes
      const r = 1.5 + this.cyc.u * 4 + Math.sin(time * 0.7) * 0.5;
      ctx.fillStyle = SEWER;
      ctx.beginPath(); ctx.arc(mx + this.dir * (4 + r * 0.7), cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(mx + this.dir * (3 + r * 0.5)), Math.round(cy - r * 0.5), 1, 1);
    }
    for (const s of this.shots) s.draw(ctx, time);
  }
}

function sh(s: Shot): boolean { return s.done; }

/** One gulp of sewer water flying along a tube. */
export class Shot {
  x: number;
  done = false;
  private travelled = 0;
  private splash = 0;
  static readonly SPEED = 3.3;
  constructor(x: number, readonly y: number, readonly dir: 1 | -1, readonly range: number) { this.x = x; }

  update(k: number, parts: Particles): void {
    if (this.splash > 0) { this.splash += k; if (this.splash > 10) this.done = true; return; }
    const v = Shot.SPEED * k;
    this.x += this.dir * v;
    this.travelled += v;
    if (Math.random() < 0.4 * k) parts.emit('drop', this.x - this.dir * 12, this.y + (Math.random() - 0.5) * 6, { vx: -this.dir * 0.6, vy: -0.6 - Math.random(), color: FOAM, size: 1.4 });
    if (this.travelled >= this.range) {
      this.splash = 1;
      parts.burst('drop', this.x, this.y, 9, 2.6, this.dir > 0 ? Math.PI : 0, Math.PI * 0.9, { color: SEWER, size: 2 });
    }
  }

  /** Hit box, or null once it has splashed. */
  box(): Box | null { return this.splash > 0 ? null : { x: this.x - (this.dir > 0 ? 22 : 0), y: this.y - 5, w: 22, h: 10 }; }

  /** Pop it: it hit a cat (or a shield). */
  burst(): void { if (this.splash === 0) this.splash = 1; }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.splash > 0) return;
    const head = this.x, tail = this.x - this.dir * 22, y = this.y;
    const wob = Math.sin(time * 0.6 + head * 0.1);
    ctx.fillStyle = '#1d1526';
    ctx.beginPath(); ctx.ellipse((head + tail) / 2, y, 13, 6.5 + wob * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SEWER_DEEP;
    ctx.beginPath(); ctx.ellipse((head + tail) / 2, y, 12, 5.5 + wob * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SEWER;
    ctx.beginPath(); ctx.ellipse(head - this.dir * 6, y - 1, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = FOAM;
    ctx.beginPath(); ctx.arc(head - this.dir * 3, y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(Math.round(tail + this.dir * 3), Math.round(y + 1), 4, 1);
  }
}

/** A pipe in the ceiling that pours sewer water straight down. */
export class Pour {
  readonly x: number;
  readonly top: number;
  readonly maxLen: number;
  len = 0;
  private cyc: Cycle;
  private wasOn = false;

  constructor(lv: Level, tx: number, ty: number, index: number) {
    this.x = (tx + 0.5) * TILE;
    this.top = (ty + 1) * TILE;
    let n = 0;
    while (n < 20 && !isSolidCode(colAt(lv, tx, ty + n + 1)) && colAt(lv, tx, ty + n + 1) !== C_WATER) n++;
    this.maxLen = n * TILE;
    this.cyc = new Cycle(96, 44, 92, index * 83 + 40);
  }

  get phase(): Phase { return this.cyc.phase; }

  update(k: number, parts: Particles, near: boolean): void {
    this.cyc.step(k);
    const on = this.cyc.phase === 'on';
    this.len += Math.max(-24, Math.min(14, (on ? this.maxLen : 0) - this.len)) * k;
    if (on && !this.wasOn && near) sfx('jet', 0.6, 0.8);
    if (this.cyc.phase === 'warn' && Math.random() < 0.12 * k) parts.emit('drop', this.x + (Math.random() - 0.5) * 6, this.top + 2, { vy: 1 });
    if (this.len > 8 && this.len >= this.maxLen - 4 && Math.random() < 0.6 * k) {
      parts.emit('drop', this.x + (Math.random() - 0.5) * 10, this.top + this.maxLen - 2, { vx: (Math.random() - 0.5) * 3, vy: -1.5 - Math.random() * 1.5, color: FOAM, size: 1.6 });
    }
    this.wasOn = on;
  }

  box(): Box | null {
    if (this.len < 8) return null;
    return { x: this.x - 7, y: this.top, w: 14, h: this.len };
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.fillStyle = '#5b6576'; ctx.fillRect(Math.round(this.x - 8), this.top - 6, 16, 6);
    ctx.fillStyle = '#8b97ab'; ctx.fillRect(Math.round(this.x - 8), this.top - 6, 16, 2);
    ctx.fillStyle = '#1f2630'; ctx.fillRect(Math.round(this.x - 5), this.top - 2, 10, 2);
    if (this.cyc.phase === 'warn') {
      const r = 2 + this.cyc.u * 2.5;
      ctx.fillStyle = SEWER; ctx.beginPath(); ctx.arc(this.x, this.top + r, r, 0, Math.PI * 2); ctx.fill();
    }
    if (this.len < 2) return;
    const h = this.len;
    ctx.fillStyle = SEWER_DEEP; ctx.fillRect(Math.round(this.x - 7), this.top, 14, Math.round(h));
    ctx.fillStyle = SEWER; ctx.fillRect(Math.round(this.x - 5), this.top, 10, Math.round(h));
    ctx.fillStyle = FOAM;
    for (let i = 0; i < h; i += 10) {
      const off = (time * 6) % 20;
      ctx.fillRect(Math.round(this.x - 3 + ((i / 10) % 2) * 4), Math.round(this.top + ((i + off) % h)), 1, 5);
    }
  }
}

/** A geyser in the flume: the water bubbles, then a column of it shoots up and crashes down. */
export class Geyser {
  readonly x: number;
  readonly surface: number;
  height = 0;
  private cyc: Cycle;
  private wasOn = false;
  static readonly MAX = 104;

  constructor(lv: Level, tx: number, index: number) {
    this.x = (tx + 0.5) * TILE;
    this.surface = lv.waterTop[tx];
    this.cyc = new Cycle(110, 56, 64, index * 97);
  }

  get phase(): Phase { return this.cyc.phase; }

  update(k: number, parts: Particles, near: boolean): void {
    this.cyc.step(k);
    const ph = this.cyc.phase;
    if (ph === 'warn' && Math.random() < 0.35 * k) parts.emit('bubble', this.x + (Math.random() - 0.5) * 22, this.surface + 4, { vy: -0.8 });
    if (ph === 'warn' && Math.random() < 0.08 * k) parts.emit('ring', this.x, this.surface, { size: 4 });
    if (ph === 'on') {
      const u = this.cyc.u;
      this.height = Geyser.MAX * (u < 0.2 ? u / 0.2 : u > 0.75 ? (1 - u) / 0.25 : 1);
      if (!this.wasOn) { if (near) sfx('geyser'); parts.splash(this.x, this.surface, 1.4); }
      if (Math.random() < 0.7 * k) parts.emit('drop', this.x + (Math.random() - 0.5) * 16, this.surface - this.height, { vx: (Math.random() - 0.5) * 4, vy: -1 - Math.random() * 2, size: 2.2 });
    } else this.height = Math.max(0, this.height - 8 * k);
    this.wasOn = ph === 'on';
  }

  box(): Box | null {
    if (this.height < 14) return null;
    return { x: this.x - 11, y: this.surface - this.height, w: 22, h: this.height };
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.cyc.phase === 'warn') {
      // a dome of churning water: the tell
      const r = 6 + this.cyc.u * 8;
      ctx.fillStyle = 'rgba(220,245,255,0.8)';
      ctx.beginPath(); ctx.ellipse(this.x, this.surface, r, 3 + this.cyc.u * 3 + Math.sin(time * 0.5), 0, Math.PI, Math.PI * 2); ctx.fill();
    }
    if (this.height < 1) return;
    const h = this.height, top = this.surface - h;
    ctx.fillStyle = '#5fb8f0';
    ctx.beginPath();
    ctx.moveTo(this.x - 12, this.surface);
    ctx.quadraticCurveTo(this.x - 8, top + h * 0.4, this.x - 7, top + 8);
    ctx.arc(this.x, top + 8, 7, Math.PI, 0);
    ctx.quadraticCurveTo(this.x + 8, top + h * 0.4, this.x + 12, this.surface);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dff6ff';
    ctx.fillRect(Math.round(this.x - 3), Math.round(top + 4), 3, Math.round(h - 8));
    for (let i = 0; i < 4; i++) {
      const a = time * 0.2 + i * 1.6;
      ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * 9, top + 6 + Math.sin(a * 1.3) * 3, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** A log floating down the flume. It is a platform: cats stand on it and ride. */
export class Log implements Platform {
  x: number;
  y: number;
  readonly w = TILE * 3;
  dx = 0;
  dy = 0;
  alive = true;
  private vy = 0;
  private falling = false;
  private sink = 0;
  private t = 0;
  /** Set by the stage when a cat is aboard: it reacts to drops. */
  rider = false;

  constructor(x: number, surface: number, private readonly speed: number) {
    this.x = x;
    this.y = surface - 6;
  }

  update(lv: Level, k: number, parts: Particles): 'drop' | 'sank' | null {
    const ox = this.x, oy = this.y;
    this.t += k;
    let event: 'drop' | 'sank' | null = null;
    if (this.sink > 0) {
      this.sink += k;
      this.y += 0.6 * k;
      if (this.sink > 40) { this.alive = false; event = 'sank'; }
      this.dx = this.x - ox; this.dy = this.y - oy;
      return event;
    }
    const front = this.x + this.w;
    const fc = tileOf(front + 2);
    // a wall (or the end of the stream) ahead: the log jams and sinks
    if (fc >= lv.w || isSolidCode(colAt(lv, fc, tileOf(this.y + 2)))) { this.sink = 1; parts.splash(front, this.y + 6, 0.6); }
    else this.x += this.speed * k;
    const cx = tileOf(this.x + this.w * 0.5);
    const surface = cx >= 0 && cx < lv.w ? lv.waterTop[cx] : Infinity;
    const rest = surface - 6;
    if (this.falling || this.y < rest - 2) {
      this.falling = true;
      this.vy = Math.min(this.vy + 0.35 * k, 8);
      this.y += this.vy * k;
      if (this.y >= rest) {
        this.y = rest; this.falling = false; this.vy = 0;
        parts.splash(this.x + this.w / 2, surface, 1.6);
        event = 'drop';
      }
    } else {
      this.y = rest + Math.sin(this.t * 0.08) * 1.2;
    }
    if (surface === Infinity) { this.sink = 1; }
    this.dx = this.x - ox; this.dy = this.y - oy;
    return event;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const x = Math.round(this.x), y = Math.round(this.y), w = this.w, h = 14;
    ctx.save();
    // logs bob up into view where they enter the stream, and sink out of it where they jam
    if (this.t < 30) ctx.globalAlpha = this.t / 30;
    if (this.sink > 0) ctx.globalAlpha = Math.max(0, 1 - this.sink / 40);
    ctx.fillStyle = '#1d1526';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#9a6233'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#b77a43'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#6b3f1d';
    for (let i = 8; i < w - 8; i += 13) ctx.fillRect(x + i, y + 5 + (i % 3), 6, 1);
    // end rings
    ctx.fillStyle = '#e1b47a';
    ctx.beginPath(); ctx.ellipse(x + w, y + h / 2, 4, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9a6233'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x + w, y + h / 2, 2, h / 4, 0, 0, Math.PI * 2); ctx.stroke();
    // a little branch stub, for character
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(x + 20, y - 4, 3, 5);
    ctx.fillStyle = '#6dbb4f'; ctx.fillRect(x + 22, y - 6, 4, 3);
    ctx.restore();
  }
}

/** Sends logs down the stream at a steady beat. */
export class LogSpawner {
  private t: number;
  constructor(readonly x: number, readonly surface: number, readonly every: number, offset: number, readonly speed: number) { this.t = every - 20 - offset; }
  update(k: number): Log | null {
    this.t += k;
    if (this.t < this.every) return null;
    this.t -= this.every;
    return new Log(this.x - TILE / 2, this.surface, this.speed);
  }
}

// ---------------------------------------------------------------- the water itself

export interface WaterStyle {
  body: string;
  deep: string;
  surface: string;
  foam: string;
  /** Flow speed for the drawn streaks (0 = still). */
  flow: number;
}

export const WATER_STYLES: Readonly<Record<string, WaterStyle>> = {
  town: { body: 'rgba(78,170,236,0.78)', deep: 'rgba(42,110,190,0.85)', surface: '#bfe9ff', foam: '#ffffff', flow: 0 },
  tubes: { body: 'rgba(96,170,150,0.82)', deep: 'rgba(56,118,108,0.9)', surface: '#bff0dc', foam: '#e9fff8', flow: 0.4 },
  flume: { body: 'rgba(70,165,230,0.78)', deep: 'rgba(36,104,186,0.86)', surface: '#c8f0ff', foam: '#ffffff', flow: 1.2 },
  house: { body: 'rgba(90,180,240,0.8)', deep: 'rgba(50,120,200,0.85)', surface: '#d0f0ff', foam: '#ffffff', flow: 0 },
};

/** Draw every water tile in the visible range: translucent, so a cat that falls in is seen to sink. */
export function drawWater(ctx: CanvasRenderingContext2D, lv: Level, x0: number, y0: number, x1: number, y1: number, style: WaterStyle, time: number): void {
  for (let tx = x0; tx <= x1; tx++) {
    const top = lv.waterTop[tx];
    if (top === Infinity) continue;
    for (let ty = y0; ty <= y1; ty++) {
      if (colAt(lv, tx, ty) !== C_WATER) continue;
      const px = tx * TILE, py = ty * TILE;
      const surfaceTile = colAt(lv, tx, ty - 1) !== C_WATER;
      if (surfaceTile) {
        const wave = Math.sin(time * 0.06 + tx * 0.9) * 1.5;
        const sy = py + 4 + wave;
        ctx.fillStyle = style.body;
        ctx.fillRect(px, Math.round(sy), TILE, Math.round(py + TILE - sy));
        ctx.fillStyle = style.surface;
        ctx.fillRect(px, Math.round(sy), TILE, 2);
        // foam flecks drifting with the flow
        ctx.fillStyle = style.foam;
        const off = ((time * style.flow + tx * 7) % TILE + TILE) % TILE;
        ctx.fillRect(px + Math.round(off), Math.round(sy + 4), 4, 1);
        if (style.flow > 0) ctx.fillRect(px + Math.round((off + 12) % TILE), Math.round(sy + 9), 3, 1);
      } else {
        ctx.fillStyle = ty * TILE - top > TILE * 1.5 ? style.deep : style.body;
        ctx.fillRect(px, py, TILE, TILE);
      }
      // a waterfall: the column to the left sits higher, so water pours over this tile's left side
      if (surfaceTile && tx > 0) {
        const upTop = lv.waterTop[tx - 1];
        if (upTop < top - 4) {
          ctx.fillStyle = style.surface;
          ctx.fillRect(px - 2, Math.round(upTop), 7, Math.round(top - upTop + 4));
          ctx.fillStyle = style.foam;
          for (let i = 0; i < top - upTop; i += 8) ctx.fillRect(px - 1 + ((i / 8) % 2) * 3, Math.round(upTop + ((i + time * 3) % (top - upTop + 1))), 1, 4);
        }
      }
    }
  }
}
