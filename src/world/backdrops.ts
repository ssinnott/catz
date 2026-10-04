// Parallax backdrops: the sky, hills and houses of the town, the dim pipes behind the tube maze, the
// water park's slides on the horizon of the flume, and the playhouse's wallpaper and windows.
//
// Each band scrolls at a fraction of the camera (1 is the world, 0.1 the far sky) -- the engine
// camera's `toScreenAt(sx, sy, factor)` arithmetic, done here per band so a band's contents can be
// laid out once from a seed and repeated across the level.
import { VIEW_W, VIEW_H } from '../config.ts';
import { makeRng } from '../lib/engine/rng.ts';
import { shade } from '../lib/art/palettes.ts';
import type { Theme } from './level.ts';

const INK = '#1d1526';

interface House { x: number; w: number; h: number; wall: string; roof: string; door: string; chimney: boolean; windows: number }
interface Cloud { x: number; y: number; s: number }

export class Backdrop {
  private houses: House[] = [];
  private clouds: Cloud[] = [];
  private span: number;

  constructor(readonly theme: Theme, levelW: number, seed = 7) {
    const rng = makeRng(seed);
    this.span = levelW;
    for (let x = -60; x < levelW * 0.5 + VIEW_W; ) {
      const w = rng.int(70, 120), h = rng.int(70, 120);
      this.houses.push({
        x, w, h,
        wall: rng.pick(['#ffd6a5', '#bde0fe', '#cdeac0', '#ffc8dd', '#fff1a8', '#e2d1f9'])!,
        roof: rng.pick(['#e85d5d', '#5a7bd8', '#8a5a32', '#4ba36b', '#c86fd0'])!,
        door: rng.pick(['#8a5a32', '#3f73d9', '#e8413b', '#4ba36b'])!,
        chimney: rng.chance(0.5), windows: rng.int(1, 3),
      });
      x += w + rng.int(14, 44);
    }
    for (let i = 0; i < 14; i++) this.clouds.push({ x: rng.range(0, levelW * 0.2 + VIEW_W * 2), y: rng.range(14, 120), s: rng.range(0.7, 1.4) });
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    switch (this.theme) {
      case 'town': return this.town(ctx, camX, camY, time);
      case 'tubes': return this.tubes(ctx, camX, camY, time);
      case 'flume': return this.flume(ctx, camX, camY, time);
      case 'house': return this.house(ctx, camX, camY, time);
    }
  }

  private sky(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  private cloudBand(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number, factor: number): void {
    for (const c of this.clouds) {
      const period = this.span * factor + VIEW_W + 200;
      let x = ((c.x - camX * factor + time * 0.08 * c.s) % period + period) % period - 100;
      const y = c.y - camY * 0.05;
      drawCloud(ctx, x, y, c.s);
    }
  }

  private hills(ctx: CanvasRenderingContext2D, camX: number, camY: number, factor: number, base: number, amp: number, step: number, color: string): void {
    const ox = camX * factor, oy = base - camY * factor * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let sx = -step; sx <= VIEW_W + step; sx += 8) {
      const wx = sx + ox;
      const y = oy - Math.sin(wx / step) * amp - Math.sin(wx / (step * 0.43) + 1.3) * amp * 0.35;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath(); ctx.fill();
  }

  private town(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    this.sky(ctx, '#7cc8ff', '#e6f6ff');
    // sun
    ctx.fillStyle = 'rgba(255,240,170,0.45)'; ctx.beginPath(); ctx.arc(540, 60 - camY * 0.02, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(540, 60 - camY * 0.02, 26, 0, Math.PI * 2); ctx.fill();
    this.cloudBand(ctx, camX, camY, time, 0.1);
    this.hills(ctx, camX, camY, 0.15, 250, 26, 140, '#a9dba0');
    this.hills(ctx, camX, camY, 0.28, 280, 20, 90, '#8fcf85');
    // a row of houses
    const f = 0.5, ox = camX * f, groundY = 300 - camY * 0.35;
    for (const h of this.houses) {
      const x = Math.round(h.x - ox);
      if (x > VIEW_W || x + h.w < -10) continue;
      drawHouse(ctx, x, Math.round(groundY), h);
    }
    ctx.fillStyle = '#7bbf6e'; ctx.fillRect(0, Math.round(groundY), VIEW_W, VIEW_H);
    ctx.fillStyle = '#6aab5e'; ctx.fillRect(0, Math.round(groundY), VIEW_W, 3);
  }

  private tubes(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    this.sky(ctx, '#2a2147', '#3d2f5e');
    // big soft rings far away
    const f1 = 0.2;
    for (let i = -1; i < 7; i++) {
      const x = ((i * 160 - camX * f1) % 1120 + 1120) % 1120 - 160, y = 90 + (i % 3) * 70 - camY * f1;
      ctx.strokeStyle = ['#4a3a78', '#3f4f80', '#5a3a70'][((i % 3) + 3) % 3]; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.arc(x, y, 60, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 66, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    }
    // pipes
    const f2 = 0.5;
    for (let i = 0; i < 4; i++) {
      const y = Math.round(60 + i * 85 - camY * f2 * 0.6);
      ctx.fillStyle = '#2b2440'; ctx.fillRect(0, y - 1, VIEW_W, 16);
      ctx.fillStyle = '#463b66'; ctx.fillRect(0, y, VIEW_W, 14);
      ctx.fillStyle = '#5a4e80'; ctx.fillRect(0, y + 2, VIEW_W, 3);
      const ox = (camX * f2 + i * 37) % 120;
      for (let x = -ox; x < VIEW_W; x += 120) { ctx.fillStyle = '#2b2440'; ctx.fillRect(Math.round(x), y - 3, 8, 20); ctx.fillStyle = '#6b5e96'; ctx.fillRect(Math.round(x) + 1, y - 2, 6, 2); }
    }
    // little lights
    for (let i = 0; i < 9; i++) {
      const x = ((i * 97 - camX * 0.35) % 760 + 760) % 760 - 60, y = 40 + (i * 53) % 260 - camY * 0.2;
      const a = 0.35 + Math.sin(time * 0.05 + i) * 0.15;
      ctx.fillStyle = `rgba(255,220,140,${a})`; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9a8'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
  }

  private flume(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    this.sky(ctx, '#62c4ff', '#d9f3ff');
    this.cloudBand(ctx, camX, camY, time, 0.08);
    // mountains
    this.hills(ctx, camX, camY, 0.1, 210, 46, 170, '#9ec7e8');
    // the water park on the horizon: towers and twisting slides
    const f = 0.22, ox = camX * f;
    for (let i = 0; i < 8; i++) {
      const x = Math.round(i * 260 + 60 - ox), base = Math.round(250 - camY * 0.08);
      if (x < -160 || x > VIEW_W + 160) continue;
      ctx.fillStyle = '#e8eef8'; ctx.fillRect(x, base - 120, 14, 120); ctx.fillRect(x + 50, base - 90, 12, 90);
      ctx.fillStyle = '#c9d4e6'; ctx.fillRect(x - 6, base - 126, 26, 8);
      const cols = ['#ff6fa3', '#ffd23f', '#5ab8ff', '#7ed66b'];
      ctx.strokeStyle = cols[i % 4]; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 7, base - 118);
      ctx.bezierCurveTo(x + 120, base - 110, x - 50, base - 60, x + 70, base - 50);
      ctx.bezierCurveTo(x + 140, base - 40, x + 90, base - 10, x + 130, base - 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // the far shore: hills and pines standing on it, a lake in front of them. The stream is drawn
    // translucent, and what shows through it must be water, not tree trunks.
    const shore = Math.round(246 - camY * 0.5);
    this.hills(ctx, camX, camY, 0.35, shore + 8, 18, 80, '#5fb86a');
    const f2 = 0.55, ox2 = camX * f2;
    for (let i = 0; i < 30; i++) {
      const x = ((i * 71 - ox2) % 2130 + 2130) % 2130 - 60, base = shore + 4 + (i % 3) * 3;
      if (x < -40 || x > VIEW_W + 40) continue;
      const h = 54 + (i % 4) * 10;
      ctx.fillStyle = '#2f7d4a';
      ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + 20, base); ctx.lineTo(x - 20, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3c9459';
      ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + 6, base - h * 0.4); ctx.lineTo(x - 14, base - 6); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#4f9a54'; ctx.fillRect(0, shore + 6, VIEW_W, 6);
    const lake = ctx.createLinearGradient(0, shore + 12, 0, VIEW_H);
    lake.addColorStop(0, '#8fd0f0'); lake.addColorStop(1, '#4a9ad8');
    ctx.fillStyle = lake; ctx.fillRect(0, shore + 12, VIEW_W, VIEW_H - shore);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.round(((i * 97 - camX * 0.6 + time * 0.2) % 700 + 700) % 700 - 30), shore + 16 + (i % 4) * 9, 14, 1);
  }

  private house(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    // wallpaper: warm stripes with little paw prints
    const ox = camX * 0.9, oy = camY * 0.9;
    ctx.fillStyle = '#fff1dc'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let x = -((ox % 32) + 32); x < VIEW_W; x += 32) { ctx.fillStyle = '#ffe4c4'; ctx.fillRect(Math.round(x), 0, 14, VIEW_H); }
    for (let y = -(oy % 64); y < VIEW_H; y += 64) for (let x = -(ox % 64); x < VIEW_W; x += 64) {
      ctx.fillStyle = '#f7cfa4';
      const px = Math.round(x + 23), py = Math.round(y + 30);
      ctx.fillRect(px, py, 4, 3); ctx.fillRect(px - 2, py - 3, 2, 2); ctx.fillRect(px + 1, py - 4, 2, 2); ctx.fillRect(px + 4, py - 3, 2, 2);
    }
    // windows with the garden outside
    for (const wx of [150, 610, 1090]) {
      const x = Math.round(wx - ox), y = Math.round(70 - oy);
      if (x < -150 || x > VIEW_W + 50) continue;
      ctx.fillStyle = INK; ctx.fillRect(x - 3, y - 3, 106, 86);
      const g = ctx.createLinearGradient(0, y, 0, y + 80); g.addColorStop(0, '#7cc8ff'); g.addColorStop(1, '#d6f0ff');
      ctx.fillStyle = g; ctx.fillRect(x, y, 100, 80);
      ctx.fillStyle = '#8fcf85'; ctx.fillRect(x, y + 58, 100, 22);
      drawCloud(ctx, x + 20 + Math.sin(time * 0.01) * 6, y + 18, 0.6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 48, y, 4, 80); ctx.fillRect(x, y + 38, 100, 4);
      // curtains
      ctx.fillStyle = '#ff8fb1'; ctx.fillRect(x - 14, y - 8, 18, 96); ctx.fillRect(x + 96, y - 8, 18, 96);
      ctx.fillStyle = '#ffb3cc'; ctx.fillRect(x - 12, y - 8, 4, 96); ctx.fillRect(x + 98, y - 8, 4, 96);
      ctx.fillStyle = '#c86fd0'; ctx.fillRect(x - 18, y - 12, 136, 6);
    }
    // portraits of famous cats
    for (const [px, col] of [[380, '#ffd23f'], [860, '#7ed66b'], [1300, '#5ab8ff']] as const) {
      const x = Math.round(px - ox), y = Math.round(84 - oy);
      if (x < -60 || x > VIEW_W + 10) continue;
      ctx.fillStyle = INK; ctx.fillRect(x - 2, y - 2, 48, 56);
      ctx.fillStyle = '#c9934f'; ctx.fillRect(x, y, 44, 52);
      ctx.fillStyle = col; ctx.fillRect(x + 5, y + 5, 34, 42);
      ctx.fillStyle = shade(col, 0.6);
      ctx.beginPath(); ctx.arc(x + 22, y + 30, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 13, y + 26); ctx.lineTo(x + 15, y + 13); ctx.lineTo(x + 20, y + 22); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 31, y + 26); ctx.lineTo(x + 29, y + 13); ctx.lineTo(x + 24, y + 22); ctx.fill();
    }
    // skirting board
    ctx.fillStyle = '#e8c9a0'; ctx.fillRect(0, Math.round(300 - oy), VIEW_W, 12);
    ctx.fillStyle = '#c9a676'; ctx.fillRect(0, Math.round(310 - oy), VIEW_W, 2);
  }
}

export function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (const [dx, dy, r] of [[0, 0, 16], [18, -6, 20], [38, 0, 15], [20, 6, 16]] as const) {
    ctx.beginPath(); ctx.arc(Math.round(x + dx * s), Math.round(y + dy * s), r * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(200,225,245,0.6)';
  ctx.fillRect(Math.round(x - 8 * s), Math.round(y + 10 * s), Math.round(52 * s), Math.round(3 * s));
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, groundY: number, h: House): void {
  const top = groundY - h.h;
  ctx.fillStyle = INK; ctx.fillRect(x - 2, top - 2, h.w + 4, h.h + 4);
  ctx.fillStyle = h.wall; ctx.fillRect(x, top, h.w, h.h);
  ctx.fillStyle = shade(h.wall, 0.9); ctx.fillRect(x + h.w - 8, top, 8, h.h);
  // roof
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.moveTo(x - 10, top + 2); ctx.lineTo(x + h.w / 2, top - h.w * 0.42 - 2); ctx.lineTo(x + h.w + 10, top + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = h.roof;
  ctx.beginPath(); ctx.moveTo(x - 6, top); ctx.lineTo(x + h.w / 2, top - h.w * 0.42 + 2); ctx.lineTo(x + h.w + 6, top); ctx.closePath(); ctx.fill();
  if (h.chimney) { ctx.fillStyle = INK; ctx.fillRect(x + h.w * 0.7, top - h.w * 0.36, 14, 26); ctx.fillStyle = '#c96a4f'; ctx.fillRect(x + h.w * 0.7 + 2, top - h.w * 0.36 + 2, 10, 22); }
  // door and windows
  const dw = 16, dh = 28;
  ctx.fillStyle = INK; ctx.fillRect(x + h.w / 2 - dw / 2 - 1, groundY - dh - 1, dw + 2, dh + 1);
  ctx.fillStyle = h.door; ctx.fillRect(x + h.w / 2 - dw / 2, groundY - dh, dw, dh);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + h.w / 2 + 3, groundY - dh / 2, 2, 2);
  for (let i = 0; i < h.windows; i++) {
    const wx = x + 10 + i * ((h.w - 34) / Math.max(1, h.windows - 1 || 1)), wy = top + 14;
    ctx.fillStyle = INK; ctx.fillRect(wx - 1, wy - 1, 18, 18);
    ctx.fillStyle = '#bfe8ff'; ctx.fillRect(wx, wy, 16, 16);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(wx + 7, wy, 2, 16); ctx.fillRect(wx, wy + 7, 16, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(wx + 2, wy + 2, 3, 3);
  }
}
