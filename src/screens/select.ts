// Choose your cat. All six stand on their podiums; the chosen one takes the spotlight, shows off its
// signature move (a little cut animation each time you land on a new cat), and the card on the right
// says what it is good at.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { input, buttonName } from '../core/input.ts';
import { sfx } from '../core/audio.ts';
import { screens, type Screen } from '../core/screens.ts';
import { save, CAT_IDS, type CatId } from '../core/save.ts';
import { drawText, drawTextOutlined } from '../lib/engine/text.ts';
import { drawRig } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { buildCat, type CatRig } from '../cats/catRig.ts';
import { animsFor } from '../cats/catAnims.ts';
import { CATS } from '../cats/roster.ts';
import { LOOKS } from '../cats/look.ts';
import { Flock } from '../cats/dragons.ts';
import { Particles } from '../core/particles.ts';
import { panel } from '../ui/hud.ts';
import { nav } from './nav.ts';

const INK = '#1d1526';
const SHOW = ['quirk', 'victory', 'special', 'meow', 'groom'];

export class SelectScreen implements Screen {
  readonly name = 'select';
  readonly music = 'title';
  private i: number;
  private small: CatRig[] = [];
  private smallAnim: AnimPlayer[] = [];
  private big!: CatRig;
  private bigAnim!: AnimPlayer;
  private flock: Flock | null = null;
  private parts = new Particles();
  private t = 0;
  private showTurn = 0;
  private picked = -1;

  constructor() {
    this.i = Math.max(0, CAT_IDS.indexOf(save.data.cat));
    for (const id of CAT_IDS) {
      this.small.push(buildCat(id, 0.9));
      const a = new AnimPlayer(animsFor(id));
      a.play('idle');
      this.smallAnim.push(a);
    }
    this.focus(this.i);
  }

  private get id(): CatId { return CAT_IDS[this.i]; }

  private focus(i: number): void {
    this.i = (i + CAT_IDS.length) % CAT_IDS.length;
    this.big = buildCat(this.id, 2.6);
    this.bigAnim = new AnimPlayer(animsFor(this.id));
    this.bigAnim.play(SHOW[this.showTurn++ % SHOW.length], { restart: true });
    this.flock = CATS[this.id].dragons ? new Flock(150, 280, 6) : null;
    this.parts.burst('spark', 150, 220, 12, 3);
  }

  private pick(): void {
    if (this.picked >= 0) return;
    this.picked = 0;
    save.setCat(this.id);
    sfx('fanfare');
    this.bigAnim.play('victory', { restart: true });
    this.parts.burst('confetti', 150, 120, 30, 4, -Math.PI / 2, Math.PI);
  }

  update(): void {
    this.t++;
    this.parts.update();
    for (const a of this.smallAnim) { a.tick(); a.events.length = 0; }
    this.bigAnim.tick();
    for (const e of this.bigAnim.events) {
      if (e.type === 'sfx') sfx(e.name, 0.8, e.name === 'meow' || e.name === 'mew' ? CATS[this.id].pitch : 1);
      if (e.type === 'fx') this.parts.burst('spark', 150, 160, 6, 2);
    }
    this.bigAnim.events.length = 0;
    if (this.bigAnim.done && this.picked < 0) this.bigAnim.play('idle');
    this.flock?.update(150, 200, 1, false, 1);
    if (this.picked >= 0) {
      if (++this.picked === 70) screens.go(nav.house(this.id, 'select'), { at: { x: 150, y: 220 } });
      return;
    }
    if (input.pressed('right')) { sfx('tick'); this.focus(this.i + 1); }
    else if (input.pressed('left')) { sfx('tick'); this.focus(this.i - 1); }
    else if (input.pressed('confirm')) this.pick();
    else if (input.pressed('back')) { sfx('back'); screens.go(nav.title()); }
    for (const tap of input.takeTaps()) {
      const k = CAT_IDS.findIndex((_, j) => Math.abs(this.podX(j) - tap.x) < 30 && tap.y > 250);
      if (k === this.i) this.pick(); else if (k >= 0) { sfx('tick'); this.focus(k); }
      else if (tap.x < 300 && tap.y < 250) this.pick();
    }
  }

  private podX(j: number): number { return 330 + j * 50; }

  draw(ctx: CanvasRenderingContext2D): void {
    const look = LOOKS[this.id], def = CATS[this.id];
    // a stage: curtains and a spotlight in the chosen cat's colours
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#3b2d57'); g.addColorStop(1, '#5a4683');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#c63a55';
    for (let x = 0; x < VIEW_W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 16, 22 + Math.sin(this.t * 0.03 + x) * 2, x + 32, 0); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,240,180,0.16)';
    ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(190, 0); ctx.lineTo(260, 300); ctx.lineTo(40, 300); ctx.closePath(); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(150, 302, 90, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.fur; ctx.beginPath(); ctx.ellipse(150, 300, 88, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(150, 297, 70, 8, 0, 0, Math.PI * 2); ctx.fill();
    drawRig(ctx, this.big, this.bigAnim.pose, { x: 150, y: 300, facing: 1 });
    this.flock?.draw(ctx);
    this.parts.draw(ctx);
    drawTextOutlined(ctx, 'CHOOSE YOUR CAT', VIEW_W / 2, 30, { size: 2, color: UI.gold, align: 'center' });
    // the card
    panel(ctx, 300, 56, 326, 186);
    drawTextOutlined(ctx, def.name, 316, 66, { size: 3, color: look.fur === '#383450' ? '#b9a8ff' : look.fur, thickness: 1 });
    drawText(ctx, def.tagline, 316, 94, { size: 1, color: UI.mint });
    drawText(ctx, def.blurb, 316, 108, { size: 1, color: UI.cream });
    const stats: [string, number][] = [['SPEED', def.stats.speed], ['JUMP', def.stats.jump], ['POWER', def.stats.power], ['SMARTS', def.stats.smarts]];
    stats.forEach(([k, v], j) => {
      const y = 134 + j * 12;
      drawText(ctx, k, 316, y, { size: 1, color: UI.grey });
      for (let s = 0; s < 5; s++) { ctx.fillStyle = s < v ? UI.gold : UI.panelLo; ctx.beginPath(); ctx.roundRect(376 + s * 15, y - 1, 12, 7, 2); ctx.fill(); }
    });
    drawText(ctx, `★ ${def.special.name}`, 316, 186, { size: 1, color: UI.pink });
    drawText(ctx, wrap(def.special.desc, 48), 316, 198, { size: 1, color: UI.cream });
    // the podiums
    CAT_IDS.forEach((id, j) => {
      const x = this.podX(j), on = j === this.i;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - 22, 318, 44, 30, 5); ctx.fill();
      ctx.fillStyle = on ? UI.gold : UI.panelHi; ctx.beginPath(); ctx.roundRect(x - 20, 320, 40, 26, 4); ctx.fill();
      drawText(ctx, String(j + 1), x, 328, { size: 1, color: on ? INK : UI.cream, align: 'center', shadow: false });
      drawRig(ctx, this.small[j], this.smallAnim[j].pose, { x, y: 318, facing: 1, alpha: on ? 1 : 0.85 });
      void id;
    });
    const blink = Math.floor(this.t / 30) % 2 === 0;
    if (blink && this.picked < 0) drawText(ctx, `← → TO CHOOSE   ${buttonName('confirm')} TO PLAY`, 463, 250, { size: 1, color: UI.cream, align: 'center' });
  }

  peek(): Record<string, unknown> { return { cat: this.id, picked: this.picked >= 0 }; }
}

/** Break a line of text at spaces so it fits `n` characters a line. */
export function wrap(s: string, n: number): string {
  const words = s.split(' '), out: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out.join('\n');
}
