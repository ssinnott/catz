// Cut animations: the little scenes that play when a cat does something -- arriving at a level,
// falling in the water, reaching the goal, eating, napping. A scene is a generator function: `yield n`
// waits n steps, anything it does between yields happens on that step. The director runs scenes and
// owns everything they put on screen: letterbox bars, the zoom, banners, speech bubbles, and an iris
// shaped like a cat's head for the moments that cut away.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { drawText, drawTextOutlined, measureText } from '../lib/engine/text.ts';
import { catHeadPath } from '../core/screens.ts';

export type Scene = Generator<number | void, void, unknown>;

interface Banner { text: string; sub: string; t: number; life: number; color: string }
interface Bubble { text: string; x: number; y: number; t: number; life: number; anchor: (() => { x: number; y: number }) | null }

export class Director {
  private scenes: { gen: Scene; wait: number; blocking: boolean }[] = [];
  letterbox = 0;
  private letterboxTo = 0;
  zoom = 1;
  private zoomTo = 1;
  private zoomRate = 0.08;
  /** World point the zoom centres on. */
  focus = { x: 0, y: 0 };
  private banner: Banner | null = null;
  private bubbles: Bubble[] = [];
  /** 0 = open, 1 = closed onto `irisAt` (screen px). */
  iris = 0;
  private irisTo = 0;
  irisAt = { x: VIEW_W / 2, y: VIEW_H / 2 };
  /** A white flash, 0..1, for big moments. */
  flash = 0;

  /** Is a scene running that has taken control away from the player? */
  get busy(): boolean { return this.scenes.some((s) => s.blocking); }

  run(gen: Scene, blocking = true): void { this.scenes.push({ gen, wait: 0, blocking }); }
  /** Stop every scene (a restart). Overlays snap back. */
  cancel(): void { this.scenes.length = 0; this.letterbox = this.letterboxTo = 0; this.zoom = this.zoomTo = 1; this.iris = this.irisTo = 0; this.banner = null; this.bubbles.length = 0; }

  bars(on: boolean): void { this.letterboxTo = on ? 1 : 0; }
  zoomIn(to: number, rate = 0.08): void { this.zoomTo = to; this.zoomRate = rate; }
  closeIris(at: { x: number; y: number }): void { this.irisTo = 1; this.irisAt = at; }
  openIris(): void { this.irisTo = 0; }

  say(text: string, x: number, y: number, life = 110, anchor: (() => { x: number; y: number }) | null = null): void {
    this.bubbles = this.bubbles.filter((b) => b.anchor !== anchor || anchor === null);
    this.bubbles.push({ text, x, y, t: 0, life, anchor });
  }
  shout(text: string, sub = '', life = 110, color: string = UI.gold): void { this.banner = { text, sub, t: 0, life, color }; }

  update(): void {
    for (let i = 0; i < this.scenes.length; i++) {
      const s = this.scenes[i];
      if (s.wait > 0) { s.wait--; continue; }
      const r = s.gen.next();
      if (r.done) { this.scenes.splice(i, 1); i--; continue; }
      s.wait = Math.max(0, (typeof r.value === 'number' ? r.value : 1) - 1);
    }
    this.letterbox += (this.letterboxTo - this.letterbox) * 0.15;
    this.zoom += (this.zoomTo - this.zoom) * this.zoomRate;
    if (Math.abs(this.zoom - this.zoomTo) < 0.002) this.zoom = this.zoomTo;
    this.iris += Math.sign(this.irisTo - this.iris) * Math.min(Math.abs(this.irisTo - this.iris), 0.06);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.05);
    if (this.banner && ++this.banner.t > this.banner.life) this.banner = null;
    for (const b of this.bubbles) b.t++;
    this.bubbles = this.bubbles.filter((b) => b.t < b.life);
  }

  /** Speech bubbles live in the world, above whoever is talking. */
  drawWorld(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bubbles) {
      const p = b.anchor ? b.anchor() : { x: b.x, y: b.y };
      drawBubble(ctx, b.text, p.x, p.y, Math.min(1, b.t / 6), b.life - b.t < 10 ? (b.life - b.t) / 10 : 1);
    }
  }

  /** Letterbox, banner, iris and flash sit on the screen. */
  drawScreen(ctx: CanvasRenderingContext2D): void {
    if (this.letterbox > 0.01) {
      const h = Math.round(this.letterbox * 30);
      ctx.fillStyle = UI.ink;
      ctx.fillRect(0, 0, VIEW_W, h);
      ctx.fillRect(0, VIEW_H - h, VIEW_W, h);
    }
    if (this.banner) drawBanner(ctx, this.banner);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.iris > 0.001) {
      const far = Math.hypot(Math.max(this.irisAt.x, VIEW_W - this.irisAt.x), Math.max(this.irisAt.y, VIEW_H - this.irisAt.y)) * 1.1;
      const r = (1 - this.iris * this.iris) * far;
      ctx.fillStyle = UI.ink;
      ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H);
      if (r > 0.5) catHeadPath(ctx, this.irisAt.x, this.irisAt.y, r, false);
      ctx.fill('evenodd');
    }
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, b: Banner): void {
  const inT = Math.min(1, b.t / 10), outT = Math.min(1, (b.life - b.t) / 12);
  const a = Math.min(inT, outT);
  const pop = b.t < 10 ? 1 + (1 - inT) * 0.6 : 1;
  const size = Math.max(2, Math.round(4 * pop));
  ctx.save();
  ctx.globalAlpha = a;
  const y = 112;
  ctx.fillStyle = 'rgba(29,21,38,0.55)';
  ctx.fillRect(0, y - 14, VIEW_W, b.sub ? 66 : 50);
  drawTextOutlined(ctx, b.text, VIEW_W / 2, y, { size, color: b.color, align: 'center', thickness: 2, outline: UI.ink });
  if (b.sub) drawText(ctx, b.sub, VIEW_W / 2, y + 36, { size: 1, color: UI.paper, align: 'center' });
  ctx.restore();
}

/** A rounded speech bubble with a tail, its point at (x, y). Text wraps on '\n'. */
export function drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, grow = 1, alpha = 1): void {
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => measureText(l, 1))) + 12, h = lines.length * 9 + 8;
  const bx = Math.round(Math.max(4, Math.min(VIEW_W * 4, x - w / 2))), by = Math.round(y - h - 8);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(grow, grow);
  ctx.translate(-x, -y);
  ctx.fillStyle = UI.ink;
  ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, w + 4, h + 4, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 6, by + h); ctx.lineTo(x, y); ctx.lineTo(x + 6, by + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = UI.paper;
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4, by + h - 1); ctx.lineTo(x, y - 3); ctx.lineTo(x + 4, by + h - 1); ctx.closePath(); ctx.fill();
  lines.forEach((l, i) => drawText(ctx, l, bx + w / 2, by + 5 + i * 9, { size: 1, color: UI.ink, align: 'center', shadow: false }));
  ctx.restore();
}
