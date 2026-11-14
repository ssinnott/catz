// Game-wide constants. The engine takes every one of these as an option rather than importing them
// (see src/lib/engine/canvas.ts and loop.ts, "LIBRARY SEAM"), so this file is the game's own.

/** Internal render size: the engine's 640x360, blown up to the window by CSS. */
export const VIEW_W = 640;
export const VIEW_H = 360;

/** One world tile, in px. A standing cat is a little over two tiles tall. */
export const TILE = 24;

/** Fixed steps per second (the engine loop's 1/60). */
export const FPS = 60;

/**
 * Platformer feel, in px and px/frame at 60 Hz. Tuned to forgive: a jump pressed a little late off
 * a ledge or a little early before landing still counts, and a quick tap still clears a small gap.
 */
export const PHYS = Object.freeze({
  gravity: 0.42,
  maxFall: 9,
  /** Frames after leaving a ledge during which a jump still counts as a ground jump. */
  coyote: 9,
  /** Frames a jump press is remembered before landing. */
  buffer: 10,
  /** Upward speed is multiplied by this when jump is let go early: a tap is a hop. */
  jumpCut: 0.6,
  /** How hard a bounce pad throws a cat upward. */
  bounce: 12.5,
  /** Upward speed after stomping a bad guy. */
  stompBounce: 7,
});

/**
 * Points. Water costs the most, because water is the one thing that sends a cat back. A bump costs
 * exactly the three fish it knocks loose, so grabbing them back makes it good again.
 */
export const POINTS = Object.freeze({
  fish: 10,
  goldFish: 100,
  bonk: 25,
  splash: -30,
  hurt: -30,
  soaked: -10,
  apple: 15,
  goldApple: 50,
  /** Per second left on the level's par time. */
  timeBonus: 5,
});

/** How long a cat blinks, untouchable, after each kind of mishap (frames). */
export const MERCY = Object.freeze({
  hurt: 120,
  soaked: 70,
  respawn: 90,
});

/** The palette the whole game's UI is drawn in. Rig and tile colours live with their art. */
export const UI = Object.freeze({
  ink: '#1d1526',
  paper: '#fff6e6',
  cream: '#ffe9c4',
  panel: '#3b2d57',
  panelHi: '#5a4683',
  panelLo: '#2a1f40',
  gold: '#ffc93c',
  goldDeep: '#d9901a',
  pink: '#ff8fb1',
  mint: '#7ee0b5',
  sky: '#8fd3ff',
  water: '#4fb6ff',
  red: '#ff5b5b',
  grey: '#9a8fb3',
  dim: '#6c5f8a',
});
