// The bad guys and what they do. Nobody gets hurt in this town: a bonked bad guy sees stars, then
// runs away squeaking and is gone.
//
//   raccoon   a bandit with a loot sack. Patrols, turns at walls and ledges. Bonk him and he drops it.
//   rat       quick and small, hops now and then
//   bulldog   patrols; when he spots a cat he barks and charges. Takes two bonks (one from Crush).
//             Sly is too quiet for him to notice.
//   pigeon    flies a lazy loop and swoops at cats below it
//   crab      sidles along the rocks of the log flume
//   frog      sits in the tube maze and hops straight up out of nowhere
//
// `k` is the world's time scale: Sprout's slow motion runs everything here at a fraction of a step.
import { sfx } from '../core/audio.ts';
import { drawRig, type Rig } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { PHYS } from '../config.ts';
import { makeBody, moveX, moveY, floorAt, type Body, type Platform } from './physics.ts';
import type { Level } from './level.ts';
import type { Particles } from '../core/particles.ts';
import { buildCritter, anims, type CritterKind } from './critters.ts';

export type EnemyKind = 'rat' | 'raccoon' | 'dog' | 'pigeon' | 'crab' | 'frog';
type EState = 'patrol' | 'bark' | 'chase' | 'swoop' | 'return' | 'hop' | 'bonked' | 'flee' | 'gone';

/** What an enemy needs to know about the cat. */
export interface Target {
  x: number;
  y: number;
  quiet: boolean;
  hidden: boolean;
}

const SIZE: Readonly<Record<EnemyKind, { w: number; h: number; hp: number; speed: number }>> = {
  raccoon: { w: 17, h: 40, hp: 1, speed: 0.75 },
  rat: { w: 15, h: 26, hp: 1, speed: 1.45 },
  dog: { w: 22, h: 44, hp: 2, speed: 0.6 },
  pigeon: { w: 18, h: 14, hp: 1, speed: 1.0 },
  crab: { w: 22, h: 14, hp: 1, speed: 0.5 },
  frog: { w: 18, h: 14, hp: 1, speed: 0 },
};

export class Enemy {
  readonly kind: EnemyKind;
  readonly body: Body;
  facing: 1 | -1 = -1;
  state: EState = 'patrol';
  hp: number;
  private t = 0;
  private cool = 0;
  private flash = 0;
  private readonly homeX: number;
  private readonly homeY: number;
  private readonly rig: Rig | null;
  private readonly anim: AnimPlayer | null;
  private swoopX = 0;
  private swoopY = 0;
  private phase: number;

  constructor(kind: EnemyKind, x: number, feetY: number, index: number) {
    this.kind = kind;
    const s = SIZE[kind];
    this.hp = s.hp;
    this.body = makeBody(x - s.w / 2, feetY - s.h, s.w, s.h);
    this.homeX = x;
    this.homeY = kind === 'pigeon' ? feetY - 40 : feetY;
    if (kind === 'pigeon') this.body.y = this.homeY - s.h;
    this.phase = index * 1.7;
    this.facing = index % 2 ? 1 : -1;
    if (kind === 'raccoon' || kind === 'rat' || kind === 'dog') {
      this.rig = buildCritter(kind as CritterKind);
      this.anim = new AnimPlayer(anims(kind as CritterKind));
      this.anim.play('walk');
    } else { this.rig = null; this.anim = null; }
  }

  /** Can it hurt a cat right now? */
  get dangerous(): boolean { return this.state === 'patrol' || this.state === 'bark' || this.state === 'chase' || this.state === 'swoop' || this.state === 'return' || this.state === 'hop'; }
  get gone(): boolean { return this.state === 'gone'; }
  get stompable(): boolean { return this.kind !== 'frog' || this.state !== 'hop'; }

  update(lv: Level, cat: Target, platforms: readonly Platform[], k: number, parts: Particles): void {
    this.t += k;
    if (this.cool > 0) this.cool -= k;
    if (this.flash > 0) this.flash -= k;
    const b = this.body, s = SIZE[this.kind];
    const dx = cat.x - (b.x + b.w / 2), dy = cat.y - (b.y + b.h);
    const notices = !cat.hidden && (!cat.quiet || Math.abs(dx) < 34);

    if (this.state === 'gone') return;
    if (this.state === 'bonked') {
      this.anim?.play('bonked');
      if (this.t > 50) { this.state = 'flee'; this.t = 0; this.facing = dx > 0 ? -1 : 1; sfx(this.kind === 'dog' ? 'squeak' : 'squeak', 0.6, this.kind === 'dog' ? 0.6 : 1); }
      this.gravity(lv, platforms, k);
      this.tickAnim(k);
      return;
    }
    if (this.state === 'flee') {
      this.anim?.play('flee');
      if (this.kind === 'pigeon') { b.x += this.facing * 2.5 * k; b.y -= 2 * k; }
      else { b.x += this.facing * 3.2 * k; b.y += Math.min(4, this.t * 0.05) * k * 0; }
      if (this.t > 80) this.state = 'gone';
      this.tickAnim(k);
      return;
    }

    switch (this.kind) {
      case 'pigeon': this.pigeon(cat, dx, dy, notices, k); break;
      case 'frog': this.frog(lv, platforms, k, parts); break;
      default: this.walker(lv, platforms, dx, dy, notices, k, s.speed, parts);
    }
    this.tickAnim(k);
  }

  private gravity(lv: Level, platforms: readonly Platform[], k: number): void {
    const b = this.body;
    b.vy = Math.min(b.vy + PHYS.gravity * k, PHYS.maxFall);
    moveY(lv, b, b.vy * k, platforms);
  }

  private walker(lv: Level, platforms: readonly Platform[], dx: number, dy: number, notices: boolean, k: number, speed: number, parts: Particles): void {
    const b = this.body;
    let v = speed;
    if (this.kind === 'dog') {
      if (this.state === 'patrol' && notices && this.cool <= 0 && Math.abs(dx) < 150 && Math.abs(dy) < 50) {
        this.state = 'bark'; this.t = 0; this.facing = dx > 0 ? 1 : -1;
        sfx('bark'); this.anim?.play('bark', { restart: true });
        parts.text(b.x + b.w / 2, b.y - 8, 'WOOF!', '#ffd23f', 1, 40);
      }
      if (this.state === 'bark') { v = 0; if (this.t > 26) { this.state = 'chase'; this.t = 0; } }
      else if (this.state === 'chase') { v = 2.5; if (this.t > 110) { this.state = 'patrol'; this.cool = 120; } }
    }
    if (this.kind === 'rat' && b.onGround && this.t % 130 < k && this.t > 10) { b.vy = -5; }
    b.vx = this.facing * v;
    const before = b.x;
    moveX(lv, b, b.vx * k);
    this.gravity(lv, platforms, k);
    if (b.onGround) {
      const frontX = this.facing > 0 ? b.x + b.w + 2 : b.x - 2;
      const ledge = !floorAt(lv, frontX, b.y + b.h + 3) && !platforms.some((p) => p.alive && frontX > p.x && frontX < p.x + p.w && Math.abs(p.y - (b.y + b.h)) < 4);
      if (b.wall || ledge || (b.x === before && v > 0)) {
        this.facing = this.facing > 0 ? -1 : 1;
        if (this.state === 'chase') { this.state = 'patrol'; this.cool = 90; }
      }
    }
    if (this.state === 'bark') this.anim?.play('bark');
    else this.anim?.play(this.state === 'chase' || this.kind === 'rat' ? 'run' : 'walk');
  }

  private pigeon(cat: Target, dx: number, dy: number, notices: boolean, k: number): void {
    const b = this.body;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (this.state === 'patrol') {
      const tx = this.homeX + Math.sin(this.t * 0.012 + this.phase) * 80;
      this.facing = tx > cx ? 1 : -1;
      b.x += Math.max(-1.2, Math.min(1.2, (tx - cx) * 0.05)) * k;
      b.y = this.homeY - b.h + Math.sin(this.t * 0.07 + this.phase) * 6;
      if (notices && this.cool <= 0 && Math.abs(dx) < 110 && dy > 20 && dy < 170) {
        this.state = 'swoop'; this.t = 0; this.swoopX = cat.x; this.swoopY = cat.y - 18;
        sfx('coo');
      }
    } else if (this.state === 'swoop') {
      const vx = this.swoopX - cx, vy = this.swoopY - cy, d = Math.hypot(vx, vy) || 1;
      this.facing = vx > 0 ? 1 : -1;
      b.x += (vx / d) * 3.2 * k; b.y += (vy / d) * 3.2 * k;
      if (d < 6 || this.t > 60) { this.state = 'return'; this.t = 0; }
    } else if (this.state === 'return') {
      b.y -= 1.6 * k;
      b.x += this.facing * 0.8 * k;
      if (b.y + b.h <= this.homeY) { this.state = 'patrol'; this.cool = 140; }
    }
  }

  private frog(lv: Level, platforms: readonly Platform[], k: number, parts: Particles): void {
    const b = this.body;
    if (b.onGround && this.t > 90 + this.phase * 10) {
      this.t = 0; b.vy = -7.2; this.state = 'hop';
      parts.burst('drop', b.x + b.w / 2, b.y + b.h, 5, 2, -Math.PI / 2, Math.PI * 0.8);
    }
    this.gravity(lv, platforms, k);
    if (b.onGround && this.state === 'hop') this.state = 'patrol';
  }

  private tickAnim(k: number): void {
    if (!this.anim) return;
    this.anim.speed = k;
    this.anim.tick();
    this.anim.events.length = 0;
  }

  /** A cat bonked it. Returns true when that bonk knocked it out. */
  bonk(fromX: number, power: number, parts: Particles): boolean {
    if (!this.dangerous && this.state !== 'hop') return false;
    const b = this.body;
    this.hp -= power;
    this.flash = 10;
    const cx = b.x + b.w / 2;
    sfx('bonk');
    parts.burst('star', cx, b.y + 4, 5, 2.4, -Math.PI / 2, Math.PI * 1.2);
    if (this.hp > 0) {
      // the bulldog shakes off the first one, and is sent skidding back
      this.facing = fromX < cx ? -1 : 1;
      moveBack(this.body, fromX < cx ? 8 : -8);
      this.state = 'patrol'; this.cool = 60;
      return false;
    }
    this.state = 'bonked'; this.t = 0;
    if (this.kind === 'pigeon') { parts.burst('feather', cx, b.y + 6, 8, 2.2); this.state = 'flee'; this.facing = fromX < cx ? 1 : -1; }
    if (this.kind === 'crab' || this.kind === 'frog') { this.state = 'flee'; this.facing = fromX < cx ? 1 : -1; }
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'gone') return;
    const b = this.body, x = b.x + b.w / 2, y = b.y + b.h;
    const alpha = this.state === 'flee' ? Math.max(0, 1 - this.t / 80) : 1;
    if (this.rig && this.anim) {
      drawRig(ctx, this.rig, this.anim.pose, { x, y, facing: this.facing, flash: this.flash > 0 && Math.floor(this.flash) % 4 < 2, alpha });
      if (this.state === 'bonked') drawDizzy(ctx, x, b.y - 4, this.t);
      return;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (this.kind === 'pigeon') drawPigeon(ctx, x, b.y + b.h / 2, this.facing, this.t, this.state === 'swoop');
    else if (this.kind === 'crab') drawCrab(ctx, x, y, this.t, this.state === 'flee');
    else drawFrog(ctx, x, y, this.facing, !this.body.onGround, this.state === 'flee');
    ctx.restore();
  }
}

function moveBack(b: Body, dx: number): void { b.x += dx; }

function drawDizzy(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  for (let i = 0; i < 3; i++) {
    const a = t * 0.15 + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * 10, sy = y + Math.sin(a) * 3;
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    for (let j = 0; j < 10; j++) {
      const r = j % 2 ? 1.4 : 3.4, aa = -Math.PI / 2 + (j / 10) * Math.PI * 2;
      if (j === 0) ctx.moveTo(sx + Math.cos(aa) * r, sy + Math.sin(aa) * r); else ctx.lineTo(sx + Math.cos(aa) * r, sy + Math.sin(aa) * r);
    }
    ctx.closePath(); ctx.fill();
  }
}

const INK = '#1d1526';

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
}

function drawPigeon(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, t: number, diving: boolean): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  if (diving) ctx.rotate(0.5);
  const flap = Math.sin(t * 0.45);
  // far wing
  ctx.save(); ctx.translate(-1, -3); ctx.rotate(-0.4 - flap * 0.6);
  blob(ctx, -5, 0, 7, 3, '#8d8aa6'); ctx.restore();
  // tail, body, head
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-15, -2); ctx.lineTo(-15, 3); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#6e6b88'; ctx.fill();
  blob(ctx, -1, 1, 9, 6, '#a9a6c2');
  blob(ctx, 6, -5, 4.6, 4.4, '#9c99b8');
  ctx.fillStyle = '#6fd1a4'; ctx.fillRect(3, -2, 5, 2); // the green neck sheen
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(14, -4.5); ctx.lineTo(10, -3.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff7a2b'; ctx.fillRect(7, -7, 2, 2);
  ctx.fillStyle = INK; ctx.fillRect(8, -7, 1, 1);
  // a grumpy brow
  ctx.fillRect(6, -9, 4, 1);
  // near wing
  ctx.save(); ctx.translate(0, -2); ctx.rotate(-0.2 - flap * 0.8);
  blob(ctx, -4, 0, 8, 3.4, '#d3d1e6'); ctx.fillStyle = '#5f5c78'; ctx.fillRect(-10, 0, 6, 1); ctx.restore();
  ctx.fillStyle = '#ff9a6b'; ctx.fillRect(-2, 6, 1, 3); ctx.fillRect(2, 6, 1, 3);
  ctx.restore();
}

function drawCrab(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, upside: boolean): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - 7));
  if (upside) ctx.scale(1, -1);
  const step = Math.sin(t * 0.3) * 1.5;
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(s * 6, 2); ctx.lineTo(s * (11 + i * 2), 6 + (i % 2 ? step : -step)); ctx.stroke();
  }
  ctx.strokeStyle = '#e8573f'; ctx.lineWidth = 1;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(s * 6, 2); ctx.lineTo(s * (11 + i * 2), 6 + (i % 2 ? step : -step)); ctx.stroke();
  }
  blob(ctx, 0, 0, 11, 6.5, '#ef6a4c');
  ctx.fillStyle = '#ff9a7a'; ctx.fillRect(-6, -4, 6, 2);
  for (const s of [-1, 1]) {
    const open = Math.sin(t * 0.2 + s) > 0 ? 2 : 0;
    blob(ctx, s * 14, -5, 4.5, 3.6, '#ef6a4c');
    ctx.fillStyle = INK; ctx.fillRect(s * 14 + (s > 0 ? 1 : -3), -6 - open / 2, 2, 1 + open);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s * 3, -5); ctx.lineTo(s * 4, -10); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s * 4, -11, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(s * 4 - 1, -12, 1.5, 2);
  }
  ctx.restore();
}

function drawFrog(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, air: boolean, upside: boolean): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - 6));
  ctx.scale(f, upside ? -1 : 1);
  if (air) {
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-5, 3); ctx.lineTo(-9, 10); ctx.moveTo(5, 3); ctx.lineTo(9, 10); ctx.stroke();
    ctx.strokeStyle = '#4fbf5a'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  blob(ctx, 0, 0, 10, 6.5, '#5cc95f');
  ctx.fillStyle = '#bff0a8'; ctx.beginPath(); ctx.ellipse(1, 2.5, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  for (const ex of [-4, 4]) { blob(ctx, ex, -6, 3.4, 3.4, '#5cc95f'); ctx.fillStyle = '#ffffff'; ctx.fillRect(ex - 1, -7, 3, 3); ctx.fillStyle = INK; ctx.fillRect(ex, -6, 2, 2); }
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(2, 2, 7, -1); ctx.stroke();
  ctx.restore();
}
