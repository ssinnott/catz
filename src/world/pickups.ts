// Things to collect and things to touch: fish treats, golden fish, the fish a cat drops when a bad
// guy bonks it, checkpoint bells, and each level's goal.
import { TILE } from '../config.ts';
import { PHYS } from '../config.ts';
import { makeBody, moveX, moveY, type Body, type Platform } from './physics.ts';
import type { Level, Theme } from './level.ts';
import { drawText } from '../lib/engine/text.ts';

const INK = '#1d1526';

export class Fish {
  readonly body: Body;
  taken = false;
  /** Dropped fish fall, bounce, blink and vanish; placed ones just bob. */
  life: number;
  private t: number;
  constructor(x: number, y: number, readonly gold: boolean, readonly dropped = false, vx = 0, vy = 0) {
    const w = gold ? 18 : 14;
    this.body = makeBody(x - w / 2, y - 14, w, 12);
    this.body.vx = vx; this.body.vy = vy;
    this.life = dropped ? 220 : Infinity;
    this.t = (x * 0.13) % 60;
  }
  get cx(): number { return this.body.x + this.body.w / 2; }
  get cy(): number { return this.body.y + this.body.h / 2; }

  update(lv: Level, platforms: readonly Platform[], k: number): void {
    this.t += k;
    if (!this.dropped) return;
    this.life -= k;
    const b = this.body;
    b.vy = Math.min(b.vy + PHYS.gravity * k, PHYS.maxFall);
    moveX(lv, b, b.vx * k);
    moveY(lv, b, b.vy * k, platforms);
    if (b.onGround) { b.vx *= 0.8; if (Math.abs(b.vx) < 0.05) b.vx = 0; }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.taken) return;
    if (this.dropped && this.life < 70 && Math.floor(this.life / 4) % 2 === 0) return;
    const bob = this.dropped ? 0 : Math.sin(this.t * 0.07) * 2;
    drawFishIcon(ctx, this.cx, this.cy + bob, this.gold ? 1.3 : 1, this.gold, this.t);
  }
}

/** A fish-shaped cat treat. Also used by the HUD and the menus. */
export function drawFishIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, gold: boolean, t = 0): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);
  ctx.rotate(Math.sin(t * 0.05) * 0.12);
  const body = gold ? '#ffcb3d' : '#ff9466', belly = gold ? '#fff0a8' : '#ffd0b0', fin = gold ? '#e89a1a' : '#ef6a4c';
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, 0); ctx.lineTo(-11, -4.5); ctx.lineTo(-11, 4.5); ctx.closePath();
  ctx.stroke(); ctx.fillStyle = fin; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 4.8, 0, 0, Math.PI * 2);
  ctx.stroke(); ctx.fillStyle = body; ctx.fill();
  ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(0.5, 1.6, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(3, -2, 2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(3, -2, 1, 1);
  ctx.fillStyle = fin; ctx.fillRect(-2, -6, 4, 2);
  ctx.restore();
  if (gold) {
    const a = (t * 0.08) % (Math.PI * 2);
    ctx.fillStyle = '#fffbe0';
    ctx.fillRect(Math.round(x + Math.cos(a) * 13 * s), Math.round(y + Math.sin(a) * 9 * s), 2, 2);
    ctx.fillRect(Math.round(x - Math.cos(a) * 12 * s), Math.round(y - Math.sin(a) * 8 * s), 1, 1);
  }
}

export class Checkpoint {
  active = false;
  private raise = 0;
  private ring = 0;
  constructor(readonly x: number, readonly y: number, readonly index: number) {}
  box(): { x: number; y: number; w: number; h: number } { return { x: this.x - 10, y: this.y - 48, w: 20, h: 48 }; }
  activate(): void { this.active = true; this.ring = 60; }
  update(k: number): void {
    if (this.active && this.raise < 1) this.raise = Math.min(1, this.raise + 0.04 * k);
    if (this.ring > 0) this.ring -= k;
  }
  draw(ctx: CanvasRenderingContext2D, flag: string): void {
    const x = Math.round(this.x), y = Math.round(this.y);
    // post
    ctx.fillStyle = INK; ctx.fillRect(x - 3, y - 50, 6, 50);
    ctx.fillStyle = '#c99a62'; ctx.fillRect(x - 2, y - 49, 4, 49);
    ctx.fillStyle = '#e3bd8b'; ctx.fillRect(x - 2, y - 49, 1, 49);
    // bell, swinging when rung
    const swing = this.ring > 0 ? Math.sin(this.ring * 0.5) * (this.ring / 60) * 0.6 : 0;
    ctx.save(); ctx.translate(x, y - 50); ctx.rotate(swing);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 4, 6.5, Math.PI, 0); ctx.lineTo(7, 9); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.active ? '#ffcb3d' : '#b9b3c9'; ctx.beginPath(); ctx.arc(0, 4, 5, Math.PI, 0); ctx.lineTo(5.5, 8); ctx.lineTo(-5.5, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff7d0'; ctx.fillRect(-3, 1, 1, 4);
    ctx.fillStyle = INK; ctx.fillRect(-1, 8, 2, 2);
    ctx.restore();
    // flag: rises up the post once rung, with a paw print on it
    const fy = y - 12 - this.raise * 26;
    ctx.fillStyle = INK; ctx.fillRect(x + 2, Math.round(fy) - 1, 20, 14);
    ctx.fillStyle = this.active ? flag : '#8f88a3'; ctx.fillRect(x + 3, Math.round(fy), 18, 12);
    ctx.fillStyle = this.active ? '#ffffff' : '#c7c1d8';
    ctx.fillRect(x + 10, Math.round(fy) + 6, 4, 3);
    ctx.fillRect(x + 8, Math.round(fy) + 3, 2, 2); ctx.fillRect(x + 11, Math.round(fy) + 2, 2, 2); ctx.fillRect(x + 14, Math.round(fy) + 3, 2, 2);
  }
}

/** The goal, drawn as each level's landmark: the water park gate, the tube maze exit, the flume's finish. */
export class Goal {
  constructor(readonly x: number, readonly y: number, readonly theme: Theme) {}
  box(): { x: number; y: number; w: number; h: number } { return { x: this.x - 14, y: this.y - 72, w: 28, h: 72 }; }

  drawBack(ctx: CanvasRenderingContext2D, time: number): void {
    const x = Math.round(this.x), y = Math.round(this.y);
    if (this.theme === 'town') {
      // the water park gate: two striped pillars, an arch, a sign, a slide peeking over the top
      ctx.fillStyle = '#3aa0e8';
      ctx.fillRect(x - 10, y - 150, 120, 30);
      ctx.fillStyle = '#ff6fa3';
      ctx.beginPath(); ctx.moveTo(x + 40, y - 150); ctx.quadraticCurveTo(x + 140, y - 160, x + 120, y - 60); ctx.lineTo(x + 108, y - 60); ctx.quadraticCurveTo(x + 124, y - 145, x + 40, y - 138); ctx.closePath(); ctx.fill();
      for (const px of [x - 60, x + 44]) {
        ctx.fillStyle = INK; ctx.fillRect(px - 1, y - 112, 18, 112);
        for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#3aa0e8'; ctx.fillRect(px, y - 111 + i * 16, 16, 16); }
      }
      ctx.fillStyle = INK; ctx.fillRect(x - 66, y - 132, 134, 26);
      ctx.fillStyle = '#ffcb3d'; ctx.fillRect(x - 64, y - 130, 130, 22);
      drawText(ctx, 'SPLASH PARK', x + 1, y - 125, { size: 1, color: INK, align: 'center', shadow: false });
      drawText(ctx, '★', x - 58, y - 125, { size: 1, color: '#ff6fa3', shadow: false });
      drawText(ctx, '★', x + 55, y - 125, { size: 1, color: '#ff6fa3', shadow: false });
      // spray from a fountain behind the gate
      for (let i = 0; i < 5; i++) {
        const a = time * 0.05 + i;
        ctx.fillStyle = 'rgba(190,235,255,0.8)';
        ctx.beginPath(); ctx.arc(x + 5 + Math.sin(a) * 30, y - 145 - Math.abs(Math.sin(a * 0.7)) * 20, 3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (this.theme === 'tubes') {
      // the way out: a big round tube mouth with daylight in it, and an EXIT sign
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y - 30, 32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffcb3d'; ctx.beginPath(); ctx.arc(x, y - 30, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.arc(x, y - 30, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7d6'; ctx.beginPath(); ctx.arc(x + 6, y - 38, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(x - 24, y - 84, 48, 18);
      ctx.fillStyle = '#4ad66d'; ctx.fillRect(x - 22, y - 82, 44, 14);
      drawText(ctx, 'EXIT', x, y - 79, { size: 1, color: '#ffffff', align: 'center', shadowColor: '#1d6b31' });
    } else if (this.theme === 'flume') {
      // the finish: a checkered banner on two posts
      for (const px of [x - 40, x + 36]) { ctx.fillStyle = INK; ctx.fillRect(px - 1, y - 100, 6, 100); ctx.fillStyle = '#c99a62'; ctx.fillRect(px, y - 99, 4, 99); }
      ctx.fillStyle = INK; ctx.fillRect(x - 40, y - 100, 82, 24);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#2b2140'; ctx.fillRect(x - 39 + i * 8, y - 99 + j * 7, 8, 7); }
      drawText(ctx, 'FINISH', x + 1, y - 70, { size: 1, color: '#ffffff', align: 'center' });
      const flap = Math.sin(time * 0.1) * 2;
      ctx.fillStyle = '#ff6fa3'; ctx.beginPath(); ctx.moveTo(x - 40, y - 104); ctx.lineTo(x - 22, y - 110 + flap); ctx.lineTo(x - 40, y - 116); ctx.closePath(); ctx.fill();
    }
  }
}

/** Ground decoration: lamp posts, trees, bushes, flowers, fences, signs. Pure scenery. */
export class Decor {
  constructor(readonly kind: 'lamp' | 'tree' | 'bush' | 'flowers' | 'fence' | 'sign', readonly x: number, readonly y: number, readonly theme: Theme, readonly seed: number) {}
  get front(): boolean { return this.kind === 'bush'; }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const x = Math.round(this.x), y = Math.round(this.y), s = this.seed;
    switch (this.kind) {
      case 'lamp': {
        ctx.fillStyle = INK; ctx.fillRect(x - 3, y - 66, 6, 66); ctx.fillRect(x - 6, y - 4, 12, 4);
        ctx.fillStyle = '#4b4a63'; ctx.fillRect(x - 2, y - 65, 4, 64);
        ctx.fillStyle = INK; ctx.fillRect(x - 8, y - 78, 16, 14);
        ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x - 6, y - 76, 12, 10);
        ctx.fillStyle = 'rgba(255,240,170,0.18)'; ctx.beginPath(); ctx.arc(x, y - 71, 18 + Math.sin(time * 0.05 + s) * 1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'tree': {
        const tall = 70 + (s % 3) * 12, green = ['#4eae4a', '#5cbf55', '#3f9e47'][s % 3];
        ctx.fillStyle = INK; ctx.fillRect(x - 5, y - tall * 0.55, 10, tall * 0.55);
        ctx.fillStyle = '#8a5a32'; ctx.fillRect(x - 4, y - tall * 0.55, 8, tall * 0.55);
        const sway = Math.sin(time * 0.02 + s) * 1.5;
        for (const [dx, dy, r] of [[0, -tall * 0.7, 24], [-16, -tall * 0.5, 18], [16, -tall * 0.52, 18], [0, -tall * 0.95, 18]] as const) {
          ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + dx + sway, y + dy, r + 2, 0, Math.PI * 2); ctx.fill();
        }
        for (const [dx, dy, r] of [[0, -tall * 0.7, 24], [-16, -tall * 0.5, 18], [16, -tall * 0.52, 18], [0, -tall * 0.95, 18]] as const) {
          ctx.fillStyle = green; ctx.beginPath(); ctx.arc(x + dx + sway, y + dy, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x - 6 + sway, y - tall * 0.95 - 4, 8, 0, Math.PI * 2); ctx.fill();
        if (s % 2) { ctx.fillStyle = '#ff6b6b'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 12 + i * 8 + sway, y - tall * 0.7 + ((i * 7) % 13) - 6, 3, 3); }
        break;
      }
      case 'bush': {
        const green = this.theme === 'flume' ? '#3f9e57' : '#4fb556';
        for (const [dx, r] of [[-12, 10], [0, 13], [12, 10]] as const) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + dx, y - r + 2, r + 2, Math.PI, 0); ctx.fill(); }
        for (const [dx, r] of [[-12, 10], [0, 13], [12, 10]] as const) { ctx.fillStyle = green; ctx.beginPath(); ctx.arc(x + dx, y - r + 2, r, Math.PI, 0); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 6, y - 20, 6, 2);
        break;
      }
      case 'flowers': {
        const cols = ['#ff6b8b', '#ffd23f', '#c58bff', '#ffffff'];
        for (let i = 0; i < 5; i++) {
          const fx = x - 10 + i * 5, fy = y - 6 - ((i * 3 + s) % 5);
          ctx.fillStyle = '#3f9e47'; ctx.fillRect(fx, fy, 1, y - fy);
          ctx.fillStyle = cols[(i + s) % cols.length]; ctx.fillRect(fx - 1, fy - 2, 3, 3);
        }
        break;
      }
      case 'fence': {
        ctx.fillStyle = INK; ctx.fillRect(x - TILE / 2, y - 22, TILE, 3); ctx.fillRect(x - TILE / 2, y - 12, TILE, 3);
        for (const dx of [-8, 0, 8]) { ctx.fillStyle = INK; ctx.fillRect(x + dx - 3, y - 27, 6, 27); ctx.fillStyle = '#fff6e6'; ctx.fillRect(x + dx - 2, y - 26, 4, 26); ctx.fillRect(x + dx - 1, y - 28, 2, 2); }
        ctx.fillStyle = '#efe2cc'; ctx.fillRect(x - TILE / 2, y - 21, TILE, 1); ctx.fillRect(x - TILE / 2, y - 11, TILE, 1);
        break;
      }
      case 'sign': {
        ctx.fillStyle = INK; ctx.fillRect(x - 2, y - 40, 5, 40);
        ctx.fillStyle = '#a8763f'; ctx.fillRect(x - 1, y - 40, 3, 40);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x - 24, y - 50); ctx.lineTo(x + 18, y - 50); ctx.lineTo(x + 28, y - 41); ctx.lineTo(x + 18, y - 32); ctx.lineTo(x - 24, y - 32); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffcb3d'; ctx.beginPath(); ctx.moveTo(x - 22, y - 48); ctx.lineTo(x + 17, y - 48); ctx.lineTo(x + 25, y - 41); ctx.lineTo(x + 17, y - 34); ctx.lineTo(x - 22, y - 34); ctx.closePath(); ctx.fill();
        const word = this.theme === 'town' ? 'PARK' : this.theme === 'tubes' ? 'EXIT' : 'GO!';
        drawText(ctx, word, x - 2, y - 45, { size: 1, color: INK, align: 'center', shadow: false });
        break;
      }
    }
  }
}
