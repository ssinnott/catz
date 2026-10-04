// The title: the name in big bouncing letters, and all six cats parading past along the bottom --
// Pendragon's dragons in tow, Biscuit flipping, Truffle tripping over her laces now and then.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { input, buttonName } from '../core/input.ts';
import { sfx, audio } from '../core/audio.ts';
import { screens, type Screen } from '../core/screens.ts';
import { CAT_IDS, type CatId } from '../core/save.ts';
import { drawText, drawTextOutlined } from '../lib/engine/text.ts';
import { drawRig } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { buildCat, type CatRig } from '../cats/catRig.ts';
import { animsFor } from '../cats/catAnims.ts';
import { Flock } from '../cats/dragons.ts';
import { Particles } from '../core/particles.ts';
import { drawCloud } from '../world/backdrops.ts';
import { drawFishIcon } from '../world/pickups.ts';
import { nav } from './nav.ts';

const INK = '#1d1526';
const LETTERS = ['C', 'A', 'T', 'Z'];
const LETTER_COLORS = ['#ff8a3c', '#ffd23f', '#5ab8ff', '#ff6fa3'];

interface Walker { id: CatId; rig: CatRig; anim: AnimPlayer; x: number; speed: number; busy: number }

export class TitleScreen implements Screen {
  readonly name = 'title';
  readonly music = 'title';
  private walkers: Walker[] = [];
  private flock: Flock;
  private parts = new Particles();
  private t = 0;
  private started = false;

  constructor() {
    CAT_IDS.forEach((id, i) => {
      const anim = new AnimPlayer(animsFor(id));
      anim.play('run');
      this.walkers.push({ id, rig: buildCat(id), anim, x: VIEW_W - 70 - i * 110, speed: 1.6, busy: 0 });
    });
    const pen = this.walkers.find((w) => w.id === 'pendragon')!;
    this.flock = new Flock(pen.x, 300, 6);
  }

  update(): void {
    this.t++;
    this.parts.update();
    for (const w of this.walkers) {
      w.anim.tick(); w.anim.events.length = 0;
      if (w.busy > 0) { w.busy--; if (w.busy === 0) w.anim.play('run'); }
      else w.x += w.speed;
      if (w.x > VIEW_W + 60) w.x -= 6 * 110;
      // a little show: Biscuit flips, Truffle trips, Crush flexes
      if (w.busy === 0 && w.x > 100 && w.x < VIEW_W - 100 && this.t % 240 === (CAT_IDS.indexOf(w.id) * 40) % 240) {
        if (w.id === 'truffle') { w.anim.play('trip', { restart: true }); w.busy = 70; }
        else if (w.id === 'biscuit') { w.anim.play('airJump', { restart: true }); w.busy = 26; }
        else if (w.id === 'crush') { w.anim.play('quirk', { restart: true }); w.busy = 44; }
        else if (w.id === 'sprout') { w.anim.play('hop', { restart: true }); w.busy = 27; }
      }
    }
    const pen = this.walkers.find((w) => w.id === 'pendragon')!;
    this.flock.update(pen.x, 290, 1, false, 1);
    if (this.t % 50 === 0) this.parts.emit('note', 40 + Math.random() * 560, 330, { vy: -0.5 });
    if (this.started) return;
    if (input.pressed('confirm') || input.pressed('jump') || input.pressed('pause') || input.takeTaps().length) {
      this.started = true;
      audio.unlock();
      sfx('select');
      screens.go(nav.select());
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#7cc8ff'); g.addColorStop(0.7, '#d9f1ff'); g.addColorStop(1, '#fff3d6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawCloud(ctx, ((this.t * 0.2) % 760) - 80, 40, 1.1);
    drawCloud(ctx, ((this.t * 0.12 + 380) % 760) - 80, 92, 0.8);
    drawCloud(ctx, ((this.t * 0.16 + 600) % 760) - 80, 150, 0.7);
    // grass
    ctx.fillStyle = '#7fc96b'; ctx.fillRect(0, 300, VIEW_W, VIEW_H - 300);
    ctx.fillStyle = '#6cb85a'; for (let x = 0; x < VIEW_W; x += 6) ctx.fillRect(x, 298 + ((x * 7) % 3), 3, 3);
    ctx.fillStyle = '#c98d5a'; ctx.fillRect(0, 330, VIEW_W, 30);
    // the name: four letters bouncing in turn, a fish swimming round them
    LETTERS.forEach((l, i) => {
      const bob = Math.round(Math.sin(this.t * 0.06 - i * 0.7) * 6);
      drawTextOutlined(ctx, l, 196 + i * 70, 56 + bob, { size: 11, color: LETTER_COLORS[i], thickness: 3, outline: INK, shadowOffset: 5 });
    });
    // cat ears on the C
    for (const [x, c] of [[204, LETTER_COLORS[0]], [240, LETTER_COLORS[0]]] as const) {
      const by = 52 + Math.round(Math.sin(this.t * 0.06) * 6);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x - 9, by); ctx.lineTo(x, by - 16); ctx.lineTo(x + 9, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 6, by - 1); ctx.lineTo(x, by - 12); ctx.lineTo(x + 6, by - 1); ctx.closePath(); ctx.fill();
    }
    const a = this.t * 0.03;
    drawFishIcon(ctx, 320 + Math.cos(a) * 190, 92 + Math.sin(a) * 50, 1.4, true, this.t);
    drawTextOutlined(ctx, 'THE BIG SPLASH ADVENTURE', VIEW_W / 2, 150, { size: 2, color: '#ffffff', align: 'center', outline: '#3a7fc0', thickness: 2 });
    // the parade
    const order = [...this.walkers].sort((p, q) => p.x - q.x);
    for (const w of order) drawRig(ctx, w.rig, w.anim.pose, { x: w.x, y: 312, facing: 1 });
    this.flock.draw(ctx);
    this.parts.draw(ctx);
    if (Math.floor(this.t / 32) % 2 === 0 || this.started) {
      const word = input.lastDevice === 'touch' ? 'TAP TO PLAY' : `PRESS ${buttonName('confirm')}`;
      drawTextOutlined(ctx, word, VIEW_W / 2, 196, { size: 2, color: UI.gold, align: 'center' });
    }
    drawText(ctx, 'ARROWS MOVE  SPACE JUMPS  X PAWS  C SPECIAL', VIEW_W / 2, 230, { size: 1, color: '#3a5f80', align: 'center', shadow: false });
  }
}
