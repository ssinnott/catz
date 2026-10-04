// The screen stack, and the cat-head iris every scene change goes through.
//
// A screen is anything with an `update` (one fixed step) and a `draw`. `go()` swaps the whole
// stack through a transition; `push()` lays an overlay (the pause menu) on top of what is there,
// and `pop()` takes it off again. Only the top screen updates; overlays draw over the screens
// below them.
//
// The iris is a cat's head: a round face with two ears, cut out of the dark and shrunk onto the
// spot the scene is leaving from (usually the cat). It is drawn as one simple polygon so that
// `fill('evenodd')` against the screen rectangle punches it out cleanly.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { input } from './input.ts';
import { audio } from './audio.ts';

export interface Screen {
  /** For tests and debugging: `window.__game.screen`. */
  readonly name: string;
  /** Called when the screen becomes the top of the stack (after the iris has closed). */
  enter?(): void;
  /** Called when the screen is removed. */
  exit?(): void;
  update(): void;
  draw(ctx: CanvasRenderingContext2D): void;
  /** Draw the screen beneath first (pause menus, dialogs). */
  readonly overlay?: boolean;
  /** The track to play while this screen is on top; '' stops the music, undefined leaves it alone. */
  readonly music?: string;
  /** Show the on-screen touch buttons while this screen is on top. */
  readonly touchControls?: boolean;
}

export type TransitionKind = 'iris' | 'fade' | 'cut';

export interface GoOptions {
  kind?: TransitionKind;
  /** Where the iris closes onto, in internal canvas px. Defaults to the centre of the screen. */
  at?: { x: number; y: number } | null;
  /** Frames for each half of the transition. */
  frames?: number;
}

interface Pending {
  screen: Screen;
  kind: TransitionKind;
  frames: number;
}

/** Trace a cat-head outline (face circle plus two ears) as ONE simple polygon. */
export function catHeadPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, newPath = true): void {
  const D = Math.PI / 180;
  const at = (deg: number, k: number): [number, number] => [cx + Math.cos(deg * D) * r * k, cy + Math.sin(deg * D) * r * k];
  if (newPath) ctx.beginPath();
  const s = at(-32, 1);
  ctx.moveTo(s[0], s[1]);
  ctx.arc(cx, cy, r, -32 * D, 212 * D);           // the face: right cheek, chin, left cheek
  let p = at(-122, 1.62); ctx.lineTo(p[0], p[1]);   // far ear tip
  p = at(-98, 1); ctx.lineTo(p[0], p[1]);
  ctx.arc(cx, cy, r, -98 * D, -82 * D);            // the crown between the ears
  p = at(-58, 1.62); ctx.lineTo(p[0], p[1]);       // near ear tip
  ctx.closePath();
}

class ScreenStack {
  stack: Screen[] = [];
  private pending: Pending | null = null;
  private phase: 'idle' | 'closing' | 'hold' | 'opening' = 'idle';
  private t = 0;
  private frames = 22;
  private kind: TransitionKind = 'iris';
  private irisX = VIEW_W / 2;
  private irisY = VIEW_H / 2;
  private hold = 0;

  get top(): Screen | null { return this.stack.length ? this.stack[this.stack.length - 1] : null; }
  get busy(): boolean { return this.phase !== 'idle'; }

  /** Replace the whole stack with `screen`, through a transition. */
  go(screen: Screen, opts: GoOptions = {}): void {
    const kind = opts.kind || 'iris';
    if (!this.stack.length || kind === 'cut') { this.swap(screen); this.phase = 'idle'; return; }
    this.pending = { screen, kind, frames: opts.frames || (kind === 'fade' ? 16 : 24) };
    this.kind = kind;
    this.frames = this.pending.frames;
    this.irisX = opts.at ? opts.at.x : VIEW_W / 2;
    this.irisY = opts.at ? opts.at.y : VIEW_H / 2;
    this.phase = 'closing';
    this.t = 0;
  }

  /** Lay an overlay on top of the current screen. */
  push(screen: Screen): void {
    this.stack.push(screen);
    screen.enter?.();
    this.applyScreenSettings();
    input.consume();
  }

  /** Remove the top overlay. */
  pop(): void {
    const s = this.stack.pop();
    s?.exit?.();
    this.applyScreenSettings();
    input.consume();
  }

  private swap(screen: Screen): void {
    for (let i = this.stack.length - 1; i >= 0; i--) this.stack[i].exit?.();
    this.stack = [screen];
    screen.enter?.();
    this.applyScreenSettings();
    input.consume();
  }

  private applyScreenSettings(): void {
    const top = this.top;
    if (!top) return;
    input.touchButtonsActive = !!top.touchControls;
    if (top.music !== undefined) audio.music.play(top.music);
  }

  update(): void {
    if (this.phase === 'closing') {
      this.t++;
      input.consume();
      if (this.t >= this.frames) { this.phase = 'hold'; this.hold = 6; }
      return;
    }
    if (this.phase === 'hold') {
      input.consume();
      if (this.pending) { this.swap(this.pending.screen); this.pending = null; }
      if (--this.hold <= 0) { this.phase = 'opening'; this.t = 0; }
      return;
    }
    if (this.phase === 'opening') {
      this.t++;
      if (this.t < this.frames * 0.5) input.consume();
      if (this.t >= this.frames) this.phase = 'idle';
    }
    this.top?.update();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    let from = this.stack.length - 1;
    while (from > 0 && this.stack[from].overlay) from--;
    for (let i = Math.max(0, from); i < this.stack.length; i++) this.stack[i].draw(ctx);
    if (this.phase !== 'idle') this.drawTransition(ctx);
  }

  /** 0 = fully open, 1 = fully closed. */
  private closedness(): number {
    if (this.phase === 'hold') return 1;
    const u = Math.min(1, this.t / this.frames);
    return this.phase === 'closing' ? u * u : 1 - u * (2 - u);
  }

  private drawTransition(ctx: CanvasRenderingContext2D): void {
    const c = this.closedness();
    if (c <= 0) return;
    ctx.save();
    if (this.kind === 'fade') {
      ctx.globalAlpha = c;
      ctx.fillStyle = UI.ink;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
      return;
    }
    // Far enough out that the ears clear every corner of the screen when fully open.
    const far = Math.max(
      Math.hypot(this.irisX, this.irisY), Math.hypot(VIEW_W - this.irisX, this.irisY),
      Math.hypot(this.irisX, VIEW_H - this.irisY), Math.hypot(VIEW_W - this.irisX, VIEW_H - this.irisY));
    const r = (1 - c) * far * 1.08;
    ctx.fillStyle = UI.ink;
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    if (r > 0.5) catHeadPath(ctx, this.irisX, this.irisY, r, false);
    ctx.fill('evenodd');
    ctx.restore();
  }
}

export const screens = new ScreenStack();
