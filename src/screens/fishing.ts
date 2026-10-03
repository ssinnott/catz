// Apple fishing: a minigame at the playhouse's apple tub.
//
// The cat sits on a stool with a little fishing rod. LEFT and RIGHT steer the hook over the water,
// the paw (or jump) button dips it. Hook an apple and the cat reels it in and tosses it into the
// basket. Golden apples are worth the most and drift to the far side of the tub -- but reaching that
// far makes the cat lean, and lean too long and in it goes: SPLASH, and points lost. Wormy apples
// are a yucky surprise. Forty-five seconds on the clock.
import { VIEW_W, VIEW_H, UI, POINTS } from '../config.ts';
import { input, buttonName } from '../core/input.ts';
import { sfx } from '../core/audio.ts';
import { screens, type Screen } from '../core/screens.ts';
import { save, type CatId } from '../core/save.ts';
import { drawText, drawTextOutlined } from '../lib/engine/text.ts';
import { drawRig, jointScreen } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { makeRng } from '../lib/engine/rng.ts';
import { buildCat, type CatRig } from '../cats/catRig.ts';
import { animsFor } from '../cats/catAnims.ts';
import { CATS } from '../cats/roster.ts';
import { Particles } from '../core/particles.ts';
import { Director, type Scene } from '../world/director.ts';
import { Backdrop } from '../world/backdrops.ts';
import { panel } from '../ui/hud.ts';
import { Menu } from '../ui/menu.ts';
import { nav } from './nav.ts';

const INK = '#1d1526';
const SURFACE = 214;
const TUB_L = 168, TUB_R = 612;
const SAFE = 430;          // past here the cat has to lean
const CAT_X = 92, CAT_Y = 232;
const BASKET_X = 40, BASKET_Y = 300;
const ROUND = 45 * 60;

type AppleKind = 'red' | 'green' | 'gold' | 'worm';
interface Apple { x: number; vx: number; kind: AppleKind; bob: number; caught: boolean; y: number; vy: number; flying: boolean }

export class FishingScreen implements Screen {
  readonly name = 'fishing';
  readonly music = 'fishing';
  readonly touchControls = true;
  private rig: CatRig;
  private anim: AnimPlayer;
  private parts = new Particles();
  private dir = new Director();
  private back = new Backdrop('house', 2000, 3);
  private rng = makeRng(0xa991e);
  private apples: Apple[] = [];
  private aim = 300;
  private hookY = SURFACE - 40;
  private dipping = 0;
  private busy = false;
  private lean = 0;
  private wobble = 0;
  private timer = ROUND;
  private score = 0;
  private caught = { apples: 0, gold: 0, worms: 0 };
  private splashes = 0;
  private over = false;
  private menu: Menu | null = null;
  private t = 0;
  private started = false;
  private isBest = false;

  constructor(readonly cat: CatId) {
    this.rig = buildCat(cat, 2.2);
    // both paws are on the rod: no sword or book while fishing
    this.rig.weapon = null;
    this.anim = new AnimPlayer(animsFor(cat));
    this.anim.play('fishSit');
    for (let i = 0; i < 5; i++) this.spawn(i === 2 ? 'gold' : undefined);
    this.dir.run(this.intro());
  }

  private spawn(force?: AppleKind): void {
    const r = this.rng.next();
    const kind: AppleKind = force ?? (r < 0.1 ? 'gold' : r < 0.22 ? 'worm' : r < 0.6 ? 'red' : 'green');
    const x = kind === 'gold' ? this.rng.range(SAFE + 20, TUB_R - 30) : this.rng.range(TUB_L + 30, TUB_R - 30);
    this.apples.push({ x, vx: this.rng.range(-0.35, 0.35) * (kind === 'gold' ? 1.6 : 1), kind, bob: this.rng.range(0, 6), caught: false, y: SURFACE, vy: 0, flying: false });
  }

  private *intro(): Scene {
    this.dir.bars(true);
    this.dir.shout('APPLE FISHING', `${buttonName('action')} TO DIP THE HOOK. DO NOT LEAN TOO FAR!`, 120);
    yield 100;
    this.dir.bars(false);
    this.started = true;
  }

  private *reel(a: Apple): Scene {
    this.busy = true;
    this.anim.play('fishReel');
    sfx('reel');
    a.caught = true;
    for (let i = 0; i < 26; i++) { this.hookY -= 3.2; a.x += (this.tipX() - a.x) * 0.06; a.y = this.hookY + 8; yield 1; }
    this.anim.play('fishCatch', { restart: true });
    if (a.kind === 'worm') {
      sfx('worm');
      this.addPoints(-20, a.x, a.y - 20);
      this.caught.worms++;
      this.dir.say('EWW! A WORM!', CAT_X + 30, CAT_Y - 110, 70);
      this.parts.text(a.x, a.y - 40, 'YUCK!', UI.mint, 2, 60);
    } else {
      sfx(a.kind === 'gold' ? 'goldfish' : 'apple');
      const pts = a.kind === 'gold' ? POINTS.goldApple : POINTS.apple;
      this.addPoints(pts, a.x, a.y - 20);
      if (a.kind === 'gold') { this.caught.gold++; this.dir.shout('GOLDEN APPLE!', '', 60); this.parts.burst('spark', a.x, a.y, 20, 3); }
      else this.caught.apples++;
    }
    // toss it into the basket
    a.flying = true;
    a.vx = (BASKET_X - a.x) / 30; a.vy = -6;
    yield 34;
    this.apples = this.apples.filter((x) => x !== a);
    this.parts.burst('confetti', BASKET_X, BASKET_Y - 10, 8, 2, -Math.PI / 2, Math.PI * 0.8);
    this.spawn();
    this.anim.play('fishSit');
    this.hookY = SURFACE - 40;
    this.busy = false;
  }

  private *fallIn(): Scene {
    this.busy = true;
    this.splashes++;
    this.dir.bars(true);
    this.anim.play('fishSplash', { restart: true });
    sfx('mew', 1, CATS[this.cat].pitch);
    yield 14;
    sfx('splash');
    this.parts.splash(TUB_L + 60, SURFACE, 2.4);
    this.addPoints(POINTS.splash, TUB_L + 60, SURFACE - 60, true);
    this.dir.shout('SPLASH!', 'YOU LEANED TOO FAR!', 90, UI.sky);
    this.rig.wet = 1;
    yield 50;
    this.anim.play('shake', { restart: true });
    yield 56;
    this.anim.play('fishSit');
    this.dir.bars(false);
    this.lean = 0;
    this.aim = 300;
    this.busy = false;
  }

  private addPoints(n: number, x: number, y: number, big = false): void {
    this.score = Math.max(0, this.score + n);
    this.parts.text(x, y, (n > 0 ? '+' : '') + n, n > 0 ? UI.gold : UI.red, big ? 2 : 1, 60);
  }

  private tipX(): number { return CAT_X + 64 + (this.aim - TUB_L) * 0.32 + this.lean * 30; }
  private tipY(): number { return CAT_Y - 96 - this.lean * 8; }

  private finish(): void {
    this.over = true;
    this.isBest = save.finishFishing(this.score);
    save.addNeed(this.cat, 'food', 1);
    save.addNeed(this.cat, 'play', 1);
    sfx('win');
    this.anim.play('victory', { restart: true });
    this.menu = new Menu([
      { label: 'FISH AGAIN', pick: () => screens.go(nav.fishing(this.cat)) },
      { label: 'BACK TO THE PLAYHOUSE', pick: () => screens.go(nav.house(this.cat, 'fishing')) },
    ], VIEW_W / 2, 250, 260);
  }

  update(): void {
    this.t++;
    this.dir.update();
    this.parts.update();
    this.anim.tick();
    for (const e of this.anim.events) if (e.type === 'sfx') sfx(e.name);
    this.anim.events.length = 0;
    this.rig.wet = Math.max(0, this.rig.wet - 1 / 300);
    if (this.over) { this.menu?.update(); return; }
    if (input.pressed('pause') || input.pressed('back')) { sfx('back'); screens.go(nav.house(this.cat, 'fishing')); return; }
    // apples drift and bob
    for (const a of this.apples) {
      if (a.flying) { a.x += a.vx; a.vy += 0.35; a.y += a.vy; continue; }
      if (a.caught) continue;
      a.x += a.vx; a.bob += 0.05;
      if (a.x < TUB_L + 20) { a.x = TUB_L + 20; a.vx = Math.abs(a.vx); }
      if (a.x > TUB_R - 20) { a.x = TUB_R - 20; a.vx = -Math.abs(a.vx); }
      if (a.kind === 'gold' && a.x < SAFE) a.vx = Math.abs(a.vx) + 0.05;
    }
    if (!this.started || this.busy) return;
    this.timer--;
    if (this.timer <= 0) { this.finish(); return; }
    // steer
    const ax = input.axisX();
    this.aim = Math.max(TUB_L + 16, Math.min(TUB_R - 16, this.aim + ax * 3.2));
    for (const tap of input.takeTaps()) this.aim = Math.max(TUB_L + 16, Math.min(TUB_R - 16, tap.x));
    // lean: reaching past the safe line tips the cat a little more every moment
    const reach = Math.max(0, (this.aim - SAFE) / (TUB_R - SAFE));
    if (reach > 0) this.lean = Math.min(1, this.lean + 0.006 + reach * 0.01);
    else this.lean = Math.max(0, this.lean - 0.03);
    this.wobble = this.lean > 0.6 ? Math.sin(this.t * 0.6) * this.lean * 4 : 0;
    if (this.lean >= 1) { this.dir.run(this.fallIn()); return; }
    // dip
    if (this.dipping > 0) {
      this.dipping--;
      this.hookY = SURFACE - 40 + Math.sin((1 - this.dipping / 20) * Math.PI) * 56;
      if (this.dipping === 10) {
        let best: Apple | null = null, bd = 18;
        for (const a of this.apples) { if (a.caught || a.flying) continue; const d = Math.abs(a.x - this.aim); if (d < bd) { bd = d; best = a; } }
        if (best) { this.dipping = 0; this.dir.run(this.reel(best)); }
        else { sfx('plip'); this.parts.splash(this.aim, SURFACE, 0.4); }
      }
      if (this.dipping === 0 && !this.busy) this.hookY = SURFACE - 40;
    } else if (input.pressed('action') || input.pressed('jump') || input.pressed('confirm')) {
      this.dipping = 20;
      sfx('cast', 0.7);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.back.draw(ctx, 520, 40, this.t);
    // floor
    ctx.fillStyle = '#b57a45'; ctx.fillRect(0, 300, VIEW_W, VIEW_H - 300);
    ctx.fillStyle = '#d9a066'; ctx.fillRect(0, 300, VIEW_W, 3);
    for (let y = 310; y < VIEW_H; y += 12) { ctx.fillStyle = '#8f5c30'; ctx.fillRect(0, y, VIEW_W, 1); }
    // the tub: back rim, water, apples, front
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(TUB_L - 8, SURFACE - 16, TUB_R - TUB_L + 16, 140, 14); ctx.fill();
    ctx.fillStyle = '#8a5a2a'; ctx.beginPath(); ctx.roundRect(TUB_L - 5, SURFACE - 13, TUB_R - TUB_L + 10, 20, 8); ctx.fill();
    ctx.fillStyle = '#5fb0f0'; ctx.fillRect(TUB_L, SURFACE - 4, TUB_R - TUB_L, 30);
    ctx.fillStyle = '#c8f0ff'; ctx.fillRect(TUB_L, SURFACE - 4, TUB_R - TUB_L, 2);
    // the safe line: a rope floating on the water
    ctx.fillStyle = '#ffffff';
    for (let x = SAFE; x < SAFE + 4; x++) ctx.fillRect(x, SURFACE - 6, 1, 4);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#ff6b6b' : '#ffffff'; ctx.beginPath(); ctx.arc(SAFE + 2, SURFACE - 4 + Math.sin(this.t * 0.05 + i) * 0.5, 3, 0, Math.PI * 2); ctx.fill(); }
    for (const a of this.apples) if (!a.flying && !a.caught) drawApple(ctx, a.x, SURFACE - 2 + Math.sin(a.bob) * 1.5, a.kind, this.t);
    ctx.fillStyle = '#a8763c'; ctx.beginPath(); ctx.roundRect(TUB_L - 5, SURFACE + 10, TUB_R - TUB_L + 10, 106, 10); ctx.fill();
    for (let x = TUB_L + 20; x < TUB_R; x += 44) { ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x, SURFACE + 10, 3, 106); }
    ctx.fillStyle = '#5a6476'; ctx.fillRect(TUB_L - 6, SURFACE + 26, TUB_R - TUB_L + 12, 6); ctx.fillRect(TUB_L - 6, SURFACE + 88, TUB_R - TUB_L + 12, 6);
    ctx.fillStyle = '#7d889b'; ctx.fillRect(TUB_L - 6, SURFACE + 26, TUB_R - TUB_L + 12, 2); ctx.fillRect(TUB_L - 6, SURFACE + 88, TUB_R - TUB_L + 12, 2);
    // the basket of catches
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(BASKET_X - 26, BASKET_Y - 22, 52, 30, 6); ctx.fill();
    ctx.fillStyle = '#d9a066'; ctx.beginPath(); ctx.roundRect(BASKET_X - 24, BASKET_Y - 20, 48, 26, 5); ctx.fill();
    for (let i = 0; i < Math.min(8, this.caught.apples + this.caught.gold); i++) drawApple(ctx, BASKET_X - 16 + (i % 4) * 10, BASKET_Y - 22 - Math.floor(i / 4) * 6, i < this.caught.gold ? 'gold' : i % 2 ? 'green' : 'red', 0);
    ctx.fillStyle = '#b77a43'; for (let x = BASKET_X - 22; x < BASKET_X + 24; x += 6) ctx.fillRect(x, BASKET_Y - 14, 3, 20);
    // stool and cat
    ctx.fillStyle = INK; ctx.fillRect(CAT_X - 26, CAT_Y - 2, 52, 8); ctx.fillRect(CAT_X - 22, CAT_Y + 4, 6, 64); ctx.fillRect(CAT_X + 16, CAT_Y + 4, 6, 64);
    ctx.fillStyle = '#e85d5d'; ctx.fillRect(CAT_X - 24, CAT_Y, 48, 4);
    const leanRot = this.lean * 16 + this.wobble;
    const pose = this.anim.pose;
    pose.root.rot += leanRot;
    drawRig(ctx, this.rig, pose, { x: CAT_X, y: CAT_Y, facing: 1 });
    pose.root.rot -= leanRot;
    // the rod and line
    const hand = jointScreen(this.rig, 'handN');
    if (!this.over && this.anim.name !== 'fishSplash' && this.anim.name !== 'shake') {
      const tx = this.tipX(), ty = this.tipY();
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo((hand.x + tx) / 2, ty - 10, tx, ty); ctx.stroke();
      ctx.strokeStyle = '#a8763c'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(this.aim, this.hookY); ctx.stroke();
      // the hook, and a bobber
      ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(this.aim, this.hookY - 12, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(this.aim - 3), Math.round(this.hookY - 12), 6, 2);
      ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.aim + 2, this.hookY + 3, 3, Math.PI * 0.2, Math.PI * 1.4); ctx.stroke();
      // the aim marker on the water
      if (!this.busy) {
        ctx.fillStyle = this.aim > SAFE ? 'rgba(255,107,107,0.6)' : 'rgba(255,255,255,0.5)';
        ctx.fillRect(Math.round(this.aim - 8), SURFACE + 3, 16, 2);
      }
    }
    for (const a of this.apples) if (a.flying || a.caught) drawApple(ctx, a.x, a.y, a.kind, this.t);
    this.parts.draw(ctx);
    // HUD: time, score, the lean meter
    panel(ctx, 8, 8, 150, 34);
    drawText(ctx, 'APPLES', 16, 14, { size: 1, color: UI.cream });
    drawText(ctx, String(this.score), 16, 25, { size: 2, color: UI.gold });
    const secs = Math.ceil(this.timer / 60);
    panel(ctx, VIEW_W - 92, 8, 84, 34);
    drawText(ctx, 'TIME', VIEW_W - 84, 14, { size: 1, color: UI.cream });
    drawText(ctx, String(secs), VIEW_W - 84, 25, { size: 2, color: secs <= 10 ? UI.red : UI.mint });
    if (this.lean > 0.05 && !this.over) {
      panel(ctx, VIEW_W / 2 - 70, 12, 140, 18);
      ctx.fillStyle = UI.panelLo; ctx.fillRect(VIEW_W / 2 - 62, 18, 124, 6);
      ctx.fillStyle = this.lean > 0.7 ? UI.red : UI.gold; ctx.fillRect(VIEW_W / 2 - 62, 18, Math.round(124 * this.lean), 6);
      if (this.lean > 0.6) drawText(ctx, 'WOBBLE!', VIEW_W / 2, 34, { size: 1, color: UI.red, align: 'center' });
    }
    this.dir.drawWorld(ctx);
    this.dir.drawScreen(ctx);
    if (this.over) {
      ctx.fillStyle = 'rgba(29,21,38,0.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawTextOutlined(ctx, 'TIME UP!', VIEW_W / 2, 60, { size: 4, color: UI.gold, align: 'center', thickness: 2 });
      const lines = [`APPLES: ${this.caught.apples}`, `GOLDEN APPLES: ${this.caught.gold}`, `WORMS: ${this.caught.worms}`, `SPLASHES: ${this.splashes}`];
      lines.forEach((l, i) => drawText(ctx, l, VIEW_W / 2, 120 + i * 14, { size: 1, color: UI.cream, align: 'center' }));
      drawTextOutlined(ctx, `${this.score} POINTS`, VIEW_W / 2, 186, { size: 2, color: UI.gold, align: 'center' });
      drawText(ctx, this.isBest ? 'NEW BEST!' : `BEST: ${save.data.fishingBest}`, VIEW_W / 2, 210, { size: 1, color: this.isBest ? UI.pink : UI.grey, align: 'center' });
      drawText(ctx, '+FOOD  +PLAY', VIEW_W / 2, 224, { size: 1, color: UI.mint, align: 'center' });
      this.menu?.draw(ctx);
    }
  }

  peek(): Record<string, unknown> {
    return { score: this.score, timer: this.timer, lean: Math.round(this.lean * 100), apples: this.apples.length, over: this.over, busy: this.busy, caught: this.caught.apples + this.caught.gold };
  }
}

export function drawApple(ctx: CanvasRenderingContext2D, x: number, y: number, kind: AppleKind, t: number): void {
  const col = kind === 'red' ? '#e8413b' : kind === 'green' ? '#7ed66b' : kind === 'gold' ? '#ffcb3d' : '#9fae55';
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 2, 2);
  ctx.fillStyle = '#5a3a20'; ctx.fillRect(Math.round(x), Math.round(y - 9), 1, 4);
  ctx.fillStyle = '#5cbf55'; ctx.fillRect(Math.round(x + 1), Math.round(y - 9), 3, 2);
  if (kind === 'worm') {
    const w = Math.sin(t * 0.2) * 1.5;
    ctx.fillStyle = '#ff9eb5'; ctx.fillRect(Math.round(x + 3), Math.round(y - 3 + w), 4, 2); ctx.fillRect(Math.round(x + 6), Math.round(y - 5 + w), 2, 3);
    ctx.fillStyle = INK; ctx.fillRect(Math.round(x + 7), Math.round(y - 5 + w), 1, 1);
  }
  if (kind === 'gold' && t) {
    ctx.fillStyle = '#fffbe0';
    const a = t * 0.1;
    ctx.fillRect(Math.round(x + Math.cos(a) * 11), Math.round(y + Math.sin(a) * 8), 2, 2);
  }
}
