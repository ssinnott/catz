// Pendragon's dragons: a little flock that follows him everywhere.
//
// Each dragon steers toward its own spot near the knight (a slot that drifts around behind him),
// keeps clear of its flockmates, and flaps. When a bad guy comes close, the nearest dragon puffs fire
// at it. When Pendragon raises his sword, the flock closes into a spinning ring around him: the
// Dragon Shield, which water fizzles against and bad guys bounce off.
import type { Particles } from '../core/particles.ts';
import { sfx } from '../core/audio.ts';

const COLORS = ['#e8483b', '#4cc46a', '#4c8ff0', '#a35ce0', '#f2b632', '#f06aa8', '#3fc8c8'];
const INK = '#1d1526';

export interface Dragon {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  phase: number;
  cool: number;
  /** Frames left of a fire puff, and where it points. */
  breath: number;
  bx: number;
  by: number;
}

export class Flock {
  readonly dragons: Dragon[] = [];
  private t = 0;

  constructor(x: number, y: number, n = 6) {
    for (let i = 0; i < n; i++) {
      this.dragons.push({ x: x - 20 - i * 6, y: y - 40 - (i % 3) * 8, vx: 0, vy: 0, color: COLORS[i % COLORS.length], phase: i * 1.3, cool: 30 + i * 25, breath: 0, bx: 0, by: 0 });
    }
  }

  /** Snap the flock to the knight (respawn, scene change). */
  gather(x: number, y: number): void {
    this.dragons.forEach((d, i) => { d.x = x - 16 - i * 5; d.y = y - 36 - (i % 3) * 6; d.vx = 0; d.vy = 0; });
  }

  update(px: number, py: number, facing: number, shield: boolean, k: number): void {
    this.t += k;
    const n = this.dragons.length;
    this.dragons.forEach((d, i) => {
      let tx: number, ty: number;
      if (shield) {
        const a = this.t * 0.14 + (i / n) * Math.PI * 2;
        tx = px + Math.cos(a) * 30; ty = py + Math.sin(a) * 26;
      } else {
        const a = this.t * 0.03 + d.phase;
        tx = px - facing * (22 + (i % 3) * 12) + Math.cos(a) * 14;
        ty = py - 34 - (i % 2) * 14 + Math.sin(a * 1.7) * 8;
      }
      const ax = (tx - d.x) * 0.02, ay = (ty - d.y) * 0.02;
      let sx = 0, sy = 0;
      for (const o of this.dragons) {
        if (o === d) continue;
        const dx = d.x - o.x, dy = d.y - o.y, dd = dx * dx + dy * dy;
        if (dd < 120 && dd > 0.01) { sx += dx / dd * 3; sy += dy / dd * 3; }
      }
      const max = shield ? 7 : 4.5;
      d.vx = (d.vx + (ax + sx) * k) * Math.pow(0.9, k);
      d.vy = (d.vy + (ay + sy) * k) * Math.pow(0.9, k);
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > max) { d.vx *= max / sp; d.vy *= max / sp; }
      d.x += d.vx * k; d.y += d.vy * k;
      if (d.cool > 0) d.cool -= k;
      if (d.breath > 0) d.breath -= k;
    });
  }

  /** Let the nearest ready dragon puff fire at a point. Returns true if one did. */
  breathe(x: number, y: number, parts: Particles): boolean {
    let best: Dragon | null = null, bd = 110 * 110;
    for (const d of this.dragons) {
      if (d.cool > 0) continue;
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return false;
    best.cool = 90 + Math.random() * 40;
    best.breath = 14;
    const dx = x - best.x, dy = y - best.y, len = Math.hypot(dx, dy) || 1;
    best.bx = dx / len; best.by = dy / len;
    for (let i = 0; i < 9; i++) {
      const s = 2 + Math.random() * 2.5;
      parts.emit('fire', best.x + best.bx * 6, best.y + best.by * 6, { vx: best.bx * s + (Math.random() - 0.5), vy: best.by * s + (Math.random() - 0.5), size: 3 + Math.random() * 2 });
    }
    sfx('fire', 0.7);
    return true;
  }

  /** Any dragon within reach of a point (for the shield bonking bad guys). */
  near(x: number, y: number, r: number): boolean {
    return this.dragons.some((d) => (d.x - x) ** 2 + (d.y - y) ** 2 < r * r);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const d of this.dragons) drawDragon(ctx, d, this.t);
  }
}

export function drawDragon(ctx: CanvasRenderingContext2D, d: Dragon, t: number): void {
  const f = d.vx < -0.2 ? -1 : d.vx > 0.2 ? 1 : (d.bx < 0 ? -1 : 1);
  const flap = Math.sin(t * 0.5 + d.phase * 3);
  ctx.save();
  ctx.translate(Math.round(d.x), Math.round(d.y));
  ctx.scale(f, 1);
  const belly = '#ffe9a8';
  // far wing
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(-7, -9 - flap * 4); ctx.lineTo(3, -4); ctx.closePath(); ctx.fill();
  // tail
  ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, 1); ctx.quadraticCurveTo(-10, 2 + flap, -12, -2); ctx.stroke();
  ctx.strokeStyle = d.color; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-15, -5); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill();
  // body and head
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, 6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -4, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(0, 0, 4.8, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -4, 2.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = belly; ctx.fillRect(-2, 1, 5, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(6, -6, 2, 2);
  ctx.fillStyle = INK; ctx.fillRect(7, -6, 1, 2);
  ctx.fillStyle = belly; ctx.fillRect(3, -9, 1, 3); ctx.fillRect(5, -9, 1, 2); // little horns
  // near wing
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(-6, -10 - flap * 5); ctx.lineTo(4, -3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = d.color;
  ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(-5, -8 - flap * 4.5); ctx.lineTo(3, -3); ctx.closePath(); ctx.fill();
  if (d.breath > 0) { ctx.fillStyle = '#ffb02e'; ctx.fillRect(9, -4, 3, 2); }
  ctx.restore();
}
