// Boot: the canvas, the fixed-step loop, input, audio, the save, and the first screen.
//
// URL switches, for development and the headless checks:
//   ?test             the loop never runs on its own; tools drive it through window.__game.step(n),
//                     audio is silent, and the save never touches localStorage
//   ?screen=NAME      start on a screen by name (see src/screens/nav.ts); &arg=... passes it one argument
//   ?cat=ID           pick the cat up front
//   ?fresh            forget saved progress
import { VIEW_W, VIEW_H, UI } from './config.ts';
import { createCanvas } from './lib/engine/canvas.ts';
import { createLoop } from './lib/engine/loop.ts';
import { setTextDefaults } from './lib/engine/text.ts';
import { input, ACTIONS, type Action } from './core/input.ts';
import { audio } from './core/audio.ts';
import { screens } from './core/screens.ts';
import { loadSave, save, CAT_IDS, type CatId } from './core/save.ts';
import { drawTouchControls } from './ui/touch.ts';
import { makeScreen } from './screens/nav.ts';

const params = new URLSearchParams(location.search);
const testMode = params.has('test');

loadSave(!testMode, params.has('fresh'));
const wantCat = params.get('cat');
if (wantCat && (CAT_IDS as readonly string[]).includes(wantCat)) save.setCat(wantCat as CatId);

audio.testMode = testMode;
audio.init();
setTextDefaults({ shadowColor: UI.ink, outline: UI.ink });

const canvas = createCanvas('stage', { width: VIEW_W, height: VIEW_H });
input.attach(canvas);
const ctx = canvas.ctx;

function update(): void {
  input.poll();
  screens.update();
}

function render(): void {
  screens.draw(ctx);
  if (input.touchMode && input.touchButtonsActive) drawTouchControls(ctx);
  canvas.present();
}

const loop = createLoop({ update, render, testMode });
screens.go(makeScreen(params.get('screen') || 'title', params.get('arg')), { kind: 'cut' });
loop.start();
render();

// The test hooks. index.html installed the object before this module loaded (so errors during
// import are already on it); fill it in rather than replacing it.
const hooks = window.__game || (window.__game = { ready: false, errors: [] });
hooks.step = (n = 1) => loop.step(n);
hooks.hold = (action: string, down: boolean) => { if ((ACTIONS as readonly string[]).includes(action)) input.force(action as Action, down); };
hooks.tap = (action: string) => { if ((ACTIONS as readonly string[]).includes(action)) input.forceTap(action as Action); };
hooks.tapAt = (x: number, y: number) => input.forcePointer(x, y);
hooks.goto = (name: string, arg?: string) => screens.go(makeScreen(name, arg ?? null), { kind: 'cut' });
Object.defineProperty(hooks, 'screen', { get: () => screens.top?.name ?? '', configurable: true });
hooks.cheat = (cmd: string) => {
  const top = screens.top as unknown as { cheat?: (c: string) => void } | null;
  top?.cheat?.(cmd);
};
hooks.fill = () => { const c = save.data.cat; save.addNeed(c, 'food', 3); save.addNeed(c, 'drink', 3); save.addNeed(c, 'play', 3); };
hooks.peek = () => {
  const top = screens.top as unknown as { peek?: () => Record<string, unknown> } | null;
  return { screen: screens.top?.name ?? '', busy: screens.busy, ...(top?.peek ? top.peek() : {}) };
};
/** Render every sound and track offline and measure it (the engine's audio self-test). */
hooks.audioSelfTest = () => audio.selfTest({ sfxSeconds: 1.2, musicSeconds: 2 });
hooks.ready = true;
