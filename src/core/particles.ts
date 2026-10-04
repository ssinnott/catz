// Particles and floating text: splashes, droplets, bubbles, dust, sparkles, dizzy stars, hearts,
// crumbs, sleepy Zs, dragon fire and confetti. Everything a cat does leaves something behind.
//
// One pool per scene, drawn in whatever space the caller's transform is in (world px for a level,
// screen px for a menu). Purely visual: nothing here feeds back into the simulation, so it is free
// to use Math.random.
import { drawText, measureText } from '../lib/engine/text.ts';
import { UI } from '../config.ts';

export type ParticleKind =
  | 'drop' | 'ring' | 'bubble' | 'dust' | 'spark' | 'star' | 'heart' | 'crumb' | 'z' | 'fire'
  | 'confetti' | 'leaf' | 'feather' | 'smoke' | 'note' | 'steam' | 'petal';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
}

export interface EmitOpts {
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  color?: string;
  gravity?: number;
  drag?: number;
  rot?: number;
  vr?: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
  vy: number;
}

const DEFAULTS: Record<ParticleKind, { life: number; size: number; color: string; gravity: number; drag: number }> = {
  drop: { life: 50, size: 2, color: '#8fd6ff', gravity: 0.25, drag: 0.99 },
  ring: { life: 34, size: 6, color: '#d9f3ff', gravity: 0, drag: 1 },
  bubble: { life: 60, size: 2.5, color: '#c9ecff', gravity: -0.03, drag: 0.97 },
  dust: { life: 26, size: 4, color: '#e8dcc6', gravity: -0.02, drag: 0.9 },
  spark: { life: 26, size: 4, color: '#fff3a8', gravity: 0, drag: 0.92 },
  star: { life: 40, size: 4, color: '#ffd84a', gravity: 0.05, drag: 0.95 },
  heart: { life: 60, size: 4, color: '#ff7aa8', gravity: -0.02, drag: 0.96 },
  crumb: { life: 40, size: 1.5, color: '#b3753a', gravity: 0.22, drag: 0.98 },
  z: { life: 80, size: 1, color: '#d8ccff', gravity: -0.004, drag: 0.99 },
  fire: { life: 28, size: 4, color: '#ffb02e', gravity: -0.05, drag: 0.93 },
  confetti: { life: 120, size: 3, color: '#ffffff', gravity: 0.06, drag: 0.98 },
  leaf: { life: 110, size: 3, color: '#6dbb4f', gravity: 0.03, drag: 0.97 },
  feather: { life: 70, size: 3, color: '#e9e6ee', gravity: 0.03, drag: 0.94 },
  smoke: { life: 36, size: 6, color: '#efe7f7', gravity: -0.03, drag: 0.92 },
  note: { life: 70, size: 1, color: '#ffe08a', gravity: -0.015, drag: 0.98 },
  steam: { life: 40, size: 5, color: '#f4fbff', gravity: -0.06, drag: 0.94 },
  petal: { life: 90, size: 2.5, color: '#ffb3cf', gravity: 0.02, drag: 0.97 },
};

const CONFETTI = ['#ff6b8b', '#ffd23f', '#5ed1ff', '#7be37b', '#c58bff', '#ff9e45'];
const MAX = 900;

export class Particles {
  private list: Particle[] = [];
  private texts: FloatText[] = [];
  /** World-time multiplier (slow motion drags particles too). */
  timeScale = 1;

  get count(): number { return this.list.length; }

  emit(kind: ParticleKind, x: number, y: number, o: EmitOpts = {}): void {
    if (this.list.length >= MAX) this.list.shift();
    const d = DEFAULTS[kind];
    const life = o.life ?? d.life * (0.8 + Math.random() * 0.4);
    this.list.push({
      kind, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, life, max: life,
      size: o.size ?? d.size, color: o.color ?? (kind === 'confetti' ? CONFETTI[(Math.random() * CONFETTI.length) | 0] : d.color),
      rot: o.rot ?? Math.random() * Math.PI * 2, vr: o.vr ?? (Math.random() - 0.5) * 0.3,
      gravity: o.gravity ?? d.gravity, drag: o.drag ?? d.drag,
    });
  }

  /** `n` particles thrown out from a point: `speed` px/frame, within `spread` radians of `angle`. */
  burst(kind: ParticleKind, x: number, y: number, n: number, speed: number, angle = -Math.PI / 2, spread = Math.PI * 2, o: EmitOpts = {}): void {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.45 + Math.random() * 0.75);
      this.emit(kind, x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, { ...o, vx: Math.cos(a) * s + (o.vx ?? 0), vy: Math.sin(a) * s + (o.vy ?? 0) });
    }
  }

  /** A splash at a water surface: a crown of droplets, rings, and bubbles under it. */
  splash(x: number, y: number, size = 1): void {
    const n = Math.round(18 * size);
    this.burst('drop', x, y, n, 4.2 * Math.sqrt(size), -Math.PI / 2, Math.PI * 0.75, { size: 2.2 });
    this.burst('drop', x, y, Math.round(n / 2), 2.2, -Math.PI / 2, Math.PI * 1.2, { size: 1.5 });
    this.emit('ring', x, y, { size: 5 * size, life: 30 });
    this.emit('ring', x, y, { size: 2 * size, life: 44 });
    for (let i = 0; i < 6 * size; i++) this.emit('bubble', x + (Math.random() - 0.5) * 20 * size, y + 6 + Math.random() * 14, { vy: -0.4 - Math.random() * 0.5 });
  }

  /** A puff of dust at a cat's feet. */
  dust(x: number, y: number, n = 4, dir = 0): void {
    for (let i = 0; i < n; i++) this.emit('dust', x + (Math.random() - 0.5) * 8, y - 2, { vx: (Math.random() - 0.5) * 1.2 - dir * 0.8, vy: -Math.random() * 0.6, size: 2.5 + Math.random() * 2.5 });
  }

  /** Floating text that rises and fades: "+10", "SPLASH!", "BONK!". */
  text(x: number, y: number, text: string, color: string = UI.paper, size = 1, life = 60): void {
    this.texts.push({ x, y, text, color, life, max: life, size, vy: -0.7 });
  }

  clear(): void { this.list.length = 0; this.texts.length = 0; }

  update(): void {
    const k = this.timeScale;
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life -= k;
      if (p.life <= 0) continue;
      p.vy += p.gravity * k;
      const dk = Math.pow(p.drag, k);
      p.vx *= dk; p.vy *= dk;
      p.x += p.vx * k; p.y += p.vy * k;
      p.rot += p.vr * k;
      if (p.kind === 'bubble' || p.kind === 'leaf' || p.kind === 'feather' || p.kind === 'petal') p.x += Math.sin((p.max - p.life) * 0.15 + p.rot) * 0.3 * k;
      this.list[w++] = p;
    }
    this.list.length = w;
    w = 0;
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      t.life -= k;
      if (t.life <= 0) continue;
      t.y += t.vy * k;
      t.vy *= 0.95;
      this.texts[w++] = t;
    }
    this.texts.length = w;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) drawParticle(ctx, p);
    for (const t of this.texts) {
      const a = Math.min(1, t.life / (t.max * 0.4));
      const pop = t.life > t.max - 6 ? 1 + (t.life - (t.max - 6)) * 0.08 : 1;
      const size = Math.max(1, Math.round(t.size * pop));
      const w = measureText(t.text, size);
      ctx.save();
      ctx.globalAlpha *= a;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, t.text, Math.round(t.x - w / 2) + dx, Math.round(t.y) + dy, { size, color: UI.ink, shadow: false });
      drawText(ctx, t.text, Math.round(t.x - w / 2), Math.round(t.y), { size, color: t.color, shadow: false });
      ctx.restore();
    }
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const u = p.life / p.max;
  ctx.save();
  switch (p.kind) {
    case 'drop': {
      ctx.globalAlpha = Math.min(1, u * 2);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s * 0.8, s * (1 + Math.min(1.2, Math.abs(p.vy) * 0.15)), Math.atan2(p.vy, p.vx) - Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(p.x - s * 0.4), Math.round(p.y - s * 0.4), 1, 1);
      break;
    }
    case 'ring': {
      const r = p.size + (1 - u) * p.size * 3.2;
      ctx.globalAlpha = u * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'bubble': {
      ctx.globalAlpha = Math.min(1, u * 1.5) * 0.85;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(p.x - p.size * 0.5), Math.round(p.y - p.size * 0.5), 1, 1);
      break;
    }
    case 'dust':
    case 'smoke':
    case 'steam': {
      ctx.globalAlpha = u * (p.kind === 'dust' ? 0.7 : 0.85);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - u * 0.6), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spark': {
      ctx.globalAlpha = Math.min(1, u * 1.6);
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size * (0.4 + u * 0.6)));
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillRect(x - s, y, s * 2 + 1, 1);
      ctx.fillRect(x, y - s, 1, s * 2 + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 1, 1);
      break;
    }
    case 'star': {
      ctx.globalAlpha = Math.min(1, u * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#7a4a00';
      ctx.lineWidth = 1;
      starPath(ctx, 0, 0, p.size, p.size * 0.45, 5);
      ctx.stroke();
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.globalAlpha = Math.min(1, u * 2);
      ctx.translate(p.x, p.y);
      const s = p.size * (0.8 + 0.2 * Math.sin((p.max - p.life) * 0.3));
      heartPath(ctx, s);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#7a1f45';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fill();
      break;
    }
    case 'crumb':
    case 'confetti': {
      ctx.globalAlpha = Math.min(1, u * 3);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(-s / 2, -s / 3, s, p.kind === 'confetti' ? s * 0.6 : s);
      break;
    }
    case 'leaf':
    case 'feather':
    case 'petal': {
      ctx.globalAlpha = Math.min(1, u * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot + Math.sin((p.max - p.life) * 0.1) * 0.8);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * (p.kind === 'feather' ? 1.8 : 1.3), p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'z': {
      ctx.globalAlpha = Math.min(1, u * 2);
      const size = p.size + (1 - u) > 1.5 ? 2 : 1;
      drawText(ctx, 'Z', Math.round(p.x), Math.round(p.y), { size, color: p.color, shadowColor: '#3a2f5c' });
      break;
    }
    case 'note': {
      ctx.globalAlpha = Math.min(1, u * 2);
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = '#3a2f5c';
      ctx.fillRect(x + 3, y - 7, 2, 9);
      ctx.fillRect(x - 1, y + 1, 5, 4);
      ctx.fillStyle = p.color;
      ctx.fillRect(x + 3, y - 8, 1, 9);
      ctx.fillRect(x + 4, y - 8, 3, 2);
      ctx.fillRect(x - 1, y, 4, 3);
      break;
    }
    case 'fire': {
      ctx.globalAlpha = Math.min(1, u * 1.8);
      const r = p.size * (0.6 + (1 - u) * 0.9);
      ctx.fillStyle = u > 0.6 ? '#fff1a8' : u > 0.35 ? p.color : '#e2552b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, n: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r1 : r0, a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.7, -s * 1.1, 0, -s * 0.35);
  ctx.bezierCurveTo(s * 0.7, -s * 1.1, s * 1.4, -s * 0.1, 0, s * 0.9);
  ctx.closePath();
}
