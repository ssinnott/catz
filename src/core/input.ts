// Input: keyboard, gamepad and touch, folded into one small set of actions.
//
// Every screen reads actions, never keys: `input.held('left')`, `input.pressed('jump')`. Three
// devices feed them --
//
//   keyboard   arrows / WASD to move, Space / Z / Up to jump, X / J / E for the paw, C / L / Shift
//              for the cat's special, Enter / Esc / P for menus and pause
//   gamepad    through the engine's pad device layer (src/lib/input/pad.ts): any pad drives the cat
//   touch      on-screen buttons, drawn by src/ui/touch.ts once a finger has touched the screen
//
// -- and a test hook (`force`) the headless playtest drives the game with.
//
// Edges are per FIXED STEP, not per key event: `poll()` runs once at the top of every update, and a
// key that went down and up again between two steps still counts as pressed on the next one (a fast
// tap must not be lost just because it fit inside one frame).
import { createPadSource, DIR } from '../lib/input/pad.ts';
import type { Canvas } from '../lib/engine/canvas.ts';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'action' | 'special' | 'confirm' | 'back' | 'pause';
export const ACTIONS: readonly Action[] = ['left', 'right', 'up', 'down', 'jump', 'action', 'special', 'confirm', 'back', 'pause'];

const KEYS: Readonly<Record<Action, readonly string[]>> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ', 'KeyK', 'ArrowUp', 'KeyW'],
  action: ['KeyX', 'KeyJ', 'KeyE'],
  special: ['KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight'],
  confirm: ['Enter', 'NumpadEnter', 'Space', 'KeyZ', 'KeyX', 'KeyJ', 'KeyE'],
  back: ['Escape', 'Backspace'],
  pause: ['Escape', 'KeyP', 'Enter'],
};

/** Standard-mapping pad buttons per action. */
const PAD: Readonly<Record<Action, readonly number[]>> = {
  left: [14], right: [15], up: [12], down: [13],
  jump: [0], action: [2], special: [1, 3], confirm: [0, 2, 9], back: [1, 8], pause: [9],
};

/** Keys whose browser default (scrolling, focus moves) must never fire while the game has the page. */
const SWALLOW = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Backspace']);

/** One on-screen button, in internal canvas px. */
export interface TouchButton {
  action: Action;
  x: number;
  y: number;
  r: number;
  label: string;
}

/** The touch layout used while playing. Menus are tapped directly instead. */
export const TOUCH_BUTTONS: readonly TouchButton[] = [
  { action: 'left', x: 46, y: 308, r: 30, label: '←' },
  { action: 'right', x: 118, y: 308, r: 30, label: '→' },
  { action: 'down', x: 184, y: 326, r: 22, label: '↓' },
  { action: 'jump', x: 590, y: 300, r: 36, label: 'JUMP' },
  { action: 'action', x: 514, y: 324, r: 25, label: 'PAW' },
  { action: 'special', x: 530, y: 254, r: 23, label: '★' },
  { action: 'pause', x: 616, y: 24, r: 16, label: 'II' },
];

function emptyFlags(): Record<Action, boolean> {
  return { left: false, right: false, up: false, down: false, jump: false, action: false, special: false, confirm: false, back: false, pause: false };
}

export interface Tap {
  x: number;
  y: number;
}

class Input {
  private keys = new Set<string>();
  /** Actions whose key went down since the last poll; a tap shorter than a frame still lands. */
  private downSince = new Set<Action>();
  private now = emptyFlags();
  private prev = emptyFlags();
  private edge = emptyFlags();
  private forced = emptyFlags();
  private forcedTaps = new Set<Action>();
  private touchHeld = emptyFlags();
  private pointers = new Map<number, Action | null>();
  private taps: Tap[] = [];
  private pads = createPadSource({ buttons: 17 });
  private canvas: Canvas | null = null;
  /** True once a finger has touched the screen: the HUD then draws the on-screen buttons. */
  touchMode = false;
  /** Set while a screen wants the on-screen buttons hidden (menus). */
  touchButtonsActive = false;
  /** Which device spoke last, so prompts can name the right button. */
  lastDevice: 'keys' | 'pad' | 'touch' = 'keys';

  attach(canvas: Canvas): void {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      this.lastDevice = 'keys';
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const a of ACTIONS) if (KEYS[a].includes(e.code)) this.downSince.add(a);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); this.syncTouch(); });
    const el = canvas.canvas;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'touch') { this.touchMode = true; this.lastDevice = 'touch'; }
      const p = canvas.toInternal(e.clientX, e.clientY);
      const button = e.pointerType === 'touch' && this.touchButtonsActive ? this.buttonAt(p.x, p.y) : null;
      this.pointers.set(e.pointerId, button);
      if (button) { this.downSince.add(button); try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }
      else this.taps.push({ x: p.x, y: p.y });
      this.syncTouch();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId) || e.pointerType !== 'touch' || !this.touchButtonsActive) return;
      const p = canvas.toInternal(e.clientX, e.clientY);
      const was = this.pointers.get(e.pointerId) ?? null;
      const button = this.buttonAt(p.x, p.y);
      // Sliding a thumb from one arrow to the other is a press of the new one, not a release.
      if (button !== was && was !== null && (button === null || isDirection(button) === isDirection(was))) {
        this.pointers.set(e.pointerId, button);
        if (button) this.downSince.add(button);
        this.syncTouch();
      }
    });
    const up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.syncTouch(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private buttonAt(x: number, y: number): Action | null {
    let best: Action | null = null, bestD = Infinity;
    for (const b of TOUCH_BUTTONS) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.3 && d < bestD) { best = b.action; bestD = d; }
    }
    return best;
  }

  private syncTouch(): void {
    this.touchHeld = emptyFlags();
    for (const a of this.pointers.values()) if (a) this.touchHeld[a] = true;
  }

  /** Read every device once. Call exactly once per fixed step, before anything reads an action. */
  poll(): void {
    this.pads.poll();
    let padMask = 0, padDir = 0;
    for (let i = 0; i < this.pads.count(); i++) {
      padMask |= this.pads.activeMask(i);
      padDir |= this.pads.dirMask(i);
    }
    if (padMask || padDir) this.lastDevice = 'pad';
    for (const a of ACTIONS) {
      this.prev[a] = this.now[a];
      let held = this.forced[a] || this.touchHeld[a];
      if (!held) for (const k of KEYS[a]) if (this.keys.has(k)) { held = true; break; }
      if (!held) for (const b of PAD[a]) if (padMask & (1 << b)) { held = true; break; }
      if (!held && padDir) {
        if (a === 'left') held = !!(padDir & DIR.left);
        else if (a === 'right') held = !!(padDir & DIR.right);
        else if (a === 'up') held = !!(padDir & DIR.up);
        else if (a === 'down') held = !!(padDir & DIR.down);
      }
      const tapped = this.downSince.has(a) || this.forcedTaps.has(a);
      this.now[a] = held || tapped;
      this.edge[a] = (held && !this.prev[a]) || tapped;
    }
    this.downSince.clear();
    this.forcedTaps.clear();
  }

  /** Is the action held this step? */
  held(a: Action): boolean { return this.now[a]; }
  /** Did the action go down this step? */
  pressed(a: Action): boolean { return this.edge[a]; }
  /** Horizontal intent: -1, 0 or 1. */
  axisX(): number { return (this.now.right ? 1 : 0) - (this.now.left ? 1 : 0); }
  /** Swallow this step's edges, so a press that closed one screen does not also act on the next. */
  consume(): void { for (const a of ACTIONS) this.edge[a] = false; this.taps.length = 0; }
  /** Pointer taps since the last call, in internal canvas px (menus are tappable with a mouse or a finger). */
  takeTaps(): Tap[] { const t = this.taps; this.taps = []; return t; }

  /** Test hook: hold an action as though its key were down. */
  force(a: Action, down: boolean): void { this.forced[a] = down; }
  /** Test hook: press and release an action on the next step. */
  forceTap(a: Action): void { this.forcedTaps.add(a); }
  /** Test hook: a tap at internal canvas coordinates. */
  forcePointer(x: number, y: number): void { this.taps.push({ x, y }); }
  /** Which touch buttons are down, for drawing them lit. */
  touchDown(a: Action): boolean { return this.touchHeld[a]; }
  get attached(): boolean { return this.canvas !== null; }
}

function isDirection(a: Action): boolean { return a === 'left' || a === 'right' || a === 'down'; }

export const input = new Input();

/** The word for a button on the device the player is using. */
export function buttonName(a: 'jump' | 'action' | 'special' | 'confirm' | 'pause' | 'back'): string {
  if (input.lastDevice === 'touch') return a === 'jump' ? 'JUMP' : a === 'action' ? 'PAW' : a === 'special' ? '★' : a === 'pause' ? 'II' : 'TAP';
  if (input.lastDevice === 'pad') return a === 'jump' || a === 'confirm' ? 'A' : a === 'action' ? 'X' : a === 'special' ? 'B' : a === 'pause' ? 'START' : 'B';
  return a === 'jump' ? 'SPACE' : a === 'action' ? 'X' : a === 'special' ? 'C' : a === 'confirm' ? 'ENTER' : a === 'pause' ? 'ESC' : 'ESC';
}
