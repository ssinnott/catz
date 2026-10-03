// After a challenge: the cat's victory dance, the tally line by line, the stars popping in, a new
// best score if there is one, and the news when the water park opens.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { input } from '../core/input.ts';
import { sfx } from '../core/audio.ts';
import { screens, type Screen } from '../core/screens.ts';
import { save, type CatId, type LevelId } from '../core/save.ts';
import { drawText, drawTextOutlined } from '../lib/engine/text.ts';
import { drawRig } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { buildCat, type CatRig } from '../cats/catRig.ts';
import { animsFor } from '../cats/catAnims.ts';
import { Particles, starPath } from '../core/particles.ts';
import type { LevelDef } from '../world/level.ts';
import type { StageResult } from '../world/stage.ts';
import { panel } from '../ui/hud.ts';
import { Menu } from '../ui/menu.ts';
import { nav } from './nav.ts';

const INK = '#1d1526';

export class ResultsScreen implements Screen {
  readonly name = 'results';
  readonly music = 'results';
  private rig: CatRig;
  private anim: AnimPlayer;
  private parts = new Particles();
  private t = 0;
  private lines: [string, string][];
  private shown = 0;
  private stars = 0;
  private counted = 0;
  private menu: Menu;
  private best: boolean;
  private opened: boolean;

  constructor(readonly level: LevelDef, readonly cat: CatId, readonly r: StageResult) {
    this.rig = buildCat(cat, 2.4);
    this.anim = new AnimPlayer(animsFor(cat));
    this.anim.play('victory');
    const wasOpen = save.unlocked('tubes');
    this.best = save.finishLevel(level.id as LevelId, r.score, r.stars);
    this.opened = !wasOpen && save.unlocked('tubes');
    const mm = Math.floor(r.seconds / 60), ss = String(r.seconds % 60).padStart(2, '0');
    this.lines = [
      ['FISH TREATS', `${r.fish} / ${r.fishTotal}`],
      ['GOLDEN FISH', `${r.gold} / ${r.goldTotal}`],
      ['BAD GUYS BONKED', String(r.bonks)],
      ['SPLASHES', String(r.splashes)],
      ['TIME', `${mm}:${ss}`],
      ['TIME BONUS', `+${r.timeBonus}`],
    ];
    if (r.happy) this.lines.push(['HAPPY CAT', 'x2']);
    const next: LevelId | null = level.id === 'town' ? 'tubes' : level.id === 'tubes' ? 'flume' : null;
    this.menu = new Menu([
      { label: next ? 'ONWARD!' : 'TO THE MAP', pick: () => screens.go(nav.map(cat, next ?? (level.id as LevelId))) },
      { label: 'PLAY AGAIN', pick: () => screens.go(nav.play(level.id as LevelId, cat)) },
      { label: 'GO HOME', pick: () => screens.go(nav.house(cat, 'map')) },
    ], 470, 268, 190, 24);
  }

  private get revealing(): boolean { return this.shown < this.lines.length || this.counted < this.r.score || this.stars < this.r.stars; }

  update(): void {
    this.t++;
    this.parts.update();
    this.anim.tick();
    for (const e of this.anim.events) if (e.type === 'sfx') sfx(e.name);
    this.anim.events.length = 0;
    if (this.anim.done && this.anim.name === 'victory') this.anim.play('cheer');
    if (this.t % 40 === 0) this.parts.burst('confetti', 40 + Math.random() * (VIEW_W - 80), -10, 6, 2, Math.PI / 2, 1);
    // skip the count-up with any button
    if (this.revealing && (input.pressed('confirm') || input.takeTaps().length)) { this.shown = this.lines.length; this.counted = this.r.score; this.stars = this.r.stars; input.consume(); }
    if (this.shown < this.lines.length) { if (this.t % 16 === 0) { this.shown++; sfx('tick'); } return; }
    if (this.counted < this.r.score) { this.counted = Math.min(this.r.score, this.counted + Math.max(7, Math.round(this.r.score / 50))); if (this.t % 3 === 0) sfx('tick', 0.5, 1.5); return; }
    if (this.stars < this.r.stars) {
      if (this.t % 24 === 0) { this.stars++; sfx('sparkle', 1, 0.8 + this.stars * 0.2); this.parts.burst('spark', 380 + this.stars * 40, 214, 14, 3); }
      return;
    }
    if (this.t > 30) this.menu.update();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#ffd6a5'); g.addColorStop(1, '#ff9eb5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // sunburst
    ctx.save(); ctx.translate(150, 230); ctx.rotate(this.t * 0.003);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(400, -50); ctx.lineTo(400, 50); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(150, 314, 70, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7bbf6e'; ctx.beginPath(); ctx.ellipse(150, 312, 68, 10, 0, 0, Math.PI * 2); ctx.fill();
    drawRig(ctx, this.rig, this.anim.pose, { x: 150, y: 312, facing: 1 });
    this.parts.draw(ctx);
    drawTextOutlined(ctx, this.level.name, VIEW_W / 2, 14, { size: 3, color: UI.gold, align: 'center', thickness: 2 });
    drawTextOutlined(ctx, 'COMPLETE!', VIEW_W / 2, 44, { size: 2, color: '#ffffff', align: 'center' });
    // the tally
    panel(ctx, 300, 74, 320, 118);
    for (let i = 0; i < this.shown; i++) {
      const [k, v] = this.lines[i];
      drawText(ctx, k, 316, 84 + i * 14, { size: 1, color: UI.cream });
      drawText(ctx, v, 604, 84 + i * 14, { size: 1, color: k === 'SPLASHES' && v !== '0' ? UI.sky : UI.gold, align: 'right' });
    }
    if (this.shown >= this.lines.length) {
      drawText(ctx, 'SCORE', 316, 184 - 2, { size: 1, color: UI.cream });
      drawText(ctx, String(this.counted), 604, 179, { size: 2, color: UI.gold, align: 'right' });
    }
    for (let s = 0; s < 3; s++) {
      const x = 420 + s * 40, y = 214, on = s < this.stars;
      const pop = on && s === this.stars - 1 ? 1 + Math.max(0, 1 - (this.t % 24) / 10) * 0.4 : 1;
      starPath(ctx, x, y, 14 * pop, 6 * pop, 5);
      ctx.fillStyle = on ? UI.gold : 'rgba(29,21,38,0.3)'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    }
    if (!this.revealing) {
      const notes: string[] = [];
      if (this.best) notes.push('NEW BEST SCORE!');
      if (this.opened) notes.push('THE WATER PARK IS OPEN!');
      notes.forEach((n, i) => drawTextOutlined(ctx, n, 470, 236 + i * 14, { size: 1, color: i === 0 && this.best ? UI.pink : UI.mint, align: 'center' }));
      if (!notes.length) drawText(ctx, this.starHint(), 470, 238, { size: 1, color: INK, align: 'center', shadow: false });
      this.menu.draw(ctx);
    }
  }

  private starHint(): string {
    if (this.r.stars >= 3) return 'PURR-FECT!';
    if (this.r.gold < this.r.goldTotal) return 'FIND ALL 3 GOLDEN FISH FOR A STAR';
    return `SCORE ${this.level.silver} FOR A STAR`;
  }

  peek(): Record<string, unknown> { return { stars: this.stars, revealing: this.revealing, score: this.r.score }; }
}
