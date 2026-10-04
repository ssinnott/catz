// The art lab: every cat side by side, in a pose and an expression of your choosing. Not reachable
// from the menus -- open it with ?screen=lab (add &arg=anim:run or &arg=face:happy). It exists so the
// art can be checked at a glance, and tools/shot.ts screenshots it.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { drawText } from '../lib/engine/text.ts';
import { drawRig } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { P } from '../lib/art/poses.ts';
import { buildCat, CF, type CatRig } from '../cats/catRig.ts';
import { CAT_IDS, type CatId } from '../core/save.ts';
import { animsFor } from '../cats/catAnims.ts';
import type { Screen } from '../core/screens.ts';

export class LabScreen implements Screen {
  readonly name = 'lab';
  private rigs: CatRig[] = [];
  private big: CatRig[] = [];
  private players: AnimPlayer[] = [];
  private bigPlayers: AnimPlayer[] = [];
  private face: number = CF.neutral;
  private anim = 'idle';
  private zoom: CatId | null = null;
  private sheet: string[] = [];
  private sheetPlayers: AnimPlayer[][] = [];
  private sheetRigs: CatRig[][] = [];
  private t = 0;

  constructor(arg: string | null) {
    for (const id of CAT_IDS) {
      this.rigs.push(buildCat(id));
      this.big.push(buildCat(id));
      this.players.push(new AnimPlayer(animsFor(id as CatId)));
      this.bigPlayers.push(new AnimPlayer(animsFor(id as CatId)));
    }
    if (arg) {
      const [k, v] = arg.split(':');
      if (k === 'face') this.face = (CF as Record<string, number>)[v] ?? CF.neutral;
      if (k === 'anim') this.anim = v;
      if (k === 'zoom') this.zoom = v as CatId;
      if (k === 'sheet') {
        // rows of animations, a column per cat; each row frozen `step` ticks into its animation
        this.sheet = v.split(',');
        for (const name of this.sheet) {
          this.sheetPlayers.push(CAT_IDS.map((id) => { const pl = new AnimPlayer(animsFor(id)); pl.play(name.split('@')[0], { restart: true }); return pl; }));
          this.sheetRigs.push(CAT_IDS.map((id) => buildCat(id)));
        }
      }
    }
    for (const p of [...this.players, ...this.bigPlayers]) p.play(this.anim, { restart: true });
  }

  update(): void {
    this.t++;
    for (const p of [...this.players, ...this.bigPlayers]) p.tick();
    this.sheet.forEach((name, r) => {
      const at = Number(name.split('@')[1] || 0);
      if (this.t <= at || !at) for (const pl of this.sheetPlayers[r]) pl.tick();
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#9fd8ff'); g.addColorStop(1, '#fff1d6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#7fc96b'; ctx.fillRect(0, 150, VIEW_W, 6);
    ctx.fillStyle = '#c99a62'; ctx.fillRect(0, 156, VIEW_W, 6);
    ctx.fillStyle = '#7fc96b'; ctx.fillRect(0, 334, VIEW_W, 26);
    if (this.sheet.length) {
      const rowH = Math.min(70, Math.floor((VIEW_H - 10) / this.sheet.length));
      this.sheet.forEach((name, r) => {
        const y = 10 + rowH * (r + 1) - 6;
        ctx.fillStyle = 'rgba(80,140,60,0.35)'; ctx.fillRect(0, y, VIEW_W, 2);
        drawText(ctx, name, 4, y - rowH + 8, { size: 1, color: UI.ink, shadow: false });
        for (let i = 0; i < CAT_IDS.length; i++) drawRig(ctx, this.sheetRigs[r][i], this.sheetPlayers[r][i].pose, { x: 90 + i * 98, y, facing: 1 });
      });
      return;
    }
    if (this.zoom) {
      const i = CAT_IDS.indexOf(this.zoom);
      drawRig(ctx, this.rigs[i], this.players[i].pose, { x: 170, y: 330, facing: 1, scale: 5 });
      drawRig(ctx, this.big[i], this.bigPlayers[i].pose, { x: 470, y: 330, facing: -1, scale: 5 });
      return;
    }
    for (let i = 0; i < this.rigs.length; i++) {
      const x = 60 + i * 104;
      const pose = this.face !== CF.neutral ? P({ face: this.face }) : this.players[i].pose;
      drawRig(ctx, this.rigs[i], pose, { x, y: 150, facing: 1 });
      drawText(ctx, CAT_IDS[i], x, 162, { size: 1, color: UI.ink, align: 'center', shadow: false });
      const bp = this.face !== CF.neutral ? P({ face: this.face }) : this.bigPlayers[i].pose;
      drawRig(ctx, this.big[i], bp, { x: x, y: 334, facing: i % 2 ? -1 : 1, scale: 2 });
    }
    drawText(ctx, `LAB  ANIM:${this.anim}  FACE:${this.face}`, 8, 8, { size: 1, color: UI.ink, shadow: false });
  }
}
