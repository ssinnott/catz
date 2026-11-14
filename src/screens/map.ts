// The map: home, then nine stages along one winding path -- three through town, then into the water
// park for three in the tube maze and three on the log flume. The cat walks (or, a long way, runs)
// the path between the places, a little cut animation of its own. Each stage opens when the one
// before it is finished; the cat can walk up to the first locked one to see what it needs.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { input } from '../core/input.ts';
import { sfx } from '../core/audio.ts';
import { screens, type Screen } from '../core/screens.ts';
import { save, LEVEL_IDS, type CatId, type LevelId } from '../core/save.ts';
import { drawText, drawTextOutlined, measureText } from '../lib/engine/text.ts';
import { drawRig } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { buildCat, type CatRig } from '../cats/catRig.ts';
import { animsFor } from '../cats/catAnims.ts';
import { CATS } from '../cats/roster.ts';
import { Flock } from '../cats/dragons.ts';
import { LEVELS } from '../levels/index.ts';
import { panel } from '../ui/hud.ts';
import { drawCloud } from '../world/backdrops.ts';
import { starPath } from '../core/particles.ts';
import { nav } from './nav.ts';

const INK = '#1d1526';
type Place = LevelId | 'house';
interface Node { id: Place; x: number; y: number; name: string; area: 'home' | 'town' | 'tubes' | 'flume'; num: number }

/** Where each place sits, in the order the path visits them (home, then LEVEL_IDS in order). */
const SPOTS: Readonly<Record<Place, readonly [number, number]>> = {
  house: [62, 282],
  street: [132, 240], market: [214, 270], town: [296, 214],
  squishy: [404, 132], tubes: [492, 104], tower: [578, 136],
  lazy: [584, 222], flume: [496, 264], falls: [404, 236],
};
const NODES: readonly Node[] = (['house', ...LEVEL_IDS] as Place[]).map((id, i) => ({
  id, x: SPOTS[id][0], y: SPOTS[id][1], num: i,
  name: id === 'house' ? 'CAT PLAYHOUSE' : LEVELS[id].name,
  area: id === 'house' ? 'home' : LEVELS[id].theme === 'town' ? 'town' : LEVELS[id].theme === 'tubes' ? 'tubes' : 'flume',
}));
/** The path, as waypoints from each node to the next. */
const ROUTE: readonly (readonly [number, number])[][] = [
  [[62, 282], [96, 270], [132, 240]],
  [[132, 240], [168, 262], [214, 270]],
  [[214, 270], [258, 254], [296, 214]],
  [[296, 214], [336, 194], [356, 160], [404, 132]],
  [[404, 132], [446, 106], [492, 104]],
  [[492, 104], [536, 104], [578, 136]],
  [[578, 136], [602, 178], [584, 222]],
  [[584, 222], [548, 256], [496, 264]],
  [[496, 264], [448, 262], [404, 236]],
];

export class MapScreen implements Screen {
  readonly name = 'map';
  readonly music = 'title';
  private rig: CatRig;
  private anim: AnimPlayer;
  private flock: Flock | null;
  private at: number;
  private x: number;
  private y: number;
  private facing: 1 | -1 = 1;
  private walk: [number, number][] = [];
  private target = -1;
  private t = 0;
  private lockedT = 0;
  /** Going more than one stop: run. */
  private fast = false;

  constructor(readonly cat: CatId, focus?: Place) {
    this.rig = buildCat(cat);
    this.anim = new AnimPlayer(animsFor(cat));
    this.anim.play('idle');
    this.at = Math.max(0, NODES.findIndex((n) => n.id === (focus ?? 'house')));
    this.x = NODES[this.at].x; this.y = NODES[this.at].y;
    this.flock = CATS[cat].dragons ? new Flock(this.x, this.y, 5) : null;
  }

  private unlocked(i: number): boolean { const id = NODES[i].id; return id === 'house' || save.unlocked(id); }

  /** The furthest node the cat may walk to: the first locked stage, so it can see what it needs. */
  private get reachable(): number {
    const i = NODES.findIndex((_, k) => !this.unlocked(k));
    return i < 0 ? NODES.length - 1 : i;
  }

  /** Walk from the current node to node `to`, along the route, one segment at a time. */
  private go(to: number): void {
    to = Math.min(to, this.reachable);
    if (to === this.at || to < 0 || to >= NODES.length || this.target >= 0) return;
    const pts: [number, number][] = [];
    if (to > this.at) for (let i = this.at; i < to; i++) pts.push(...ROUTE[i].slice(1).map((p) => [p[0], p[1]] as [number, number]));
    else for (let i = this.at - 1; i >= to; i--) pts.push(...[...ROUTE[i]].reverse().slice(1).map((p) => [p[0], p[1]] as [number, number]));
    this.walk = pts;
    this.target = to;
    this.fast = Math.abs(to - this.at) > 1;
    this.anim.play(this.fast ? 'run' : 'walk');
    sfx('tick');
  }

  private enterPlace(): void {
    const n = NODES[this.at];
    if (!this.unlocked(this.at)) { this.lockedT = 90; sfx('back'); return; }
    sfx('select');
    if (n.id === 'house') screens.go(nav.house(this.cat, 'map'), { at: { x: this.x, y: this.y - 20 } });
    else screens.go(nav.play(n.id, this.cat), { at: { x: this.x, y: this.y - 20 } });
  }

  update(): void {
    this.t++;
    if (this.lockedT > 0) this.lockedT--;
    if (this.target >= 0) {
      const [tx, ty] = this.walk[0];
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
      if (d < 2) {
        this.walk.shift();
        if (!this.walk.length) { this.at = this.target; this.target = -1; this.anim.play('idle'); if (!this.unlocked(this.at)) this.lockedT = 90; }
      } else { const v = Math.min(d, this.fast ? 4 : 2); this.x += dx / d * v; this.y += dy / d * v; }
    } else {
      if (input.pressed('right') || input.pressed('down')) this.go(this.at + 1);
      else if (input.pressed('left') || input.pressed('up')) this.go(this.at - 1);
      else if (input.pressed('confirm')) this.enterPlace();
      else if (input.pressed('back')) { sfx('back'); screens.go(nav.title()); }
      for (const tap of input.takeTaps()) {
        const i = NODES.findIndex((n) => Math.hypot(n.x - tap.x, n.y - 14 - tap.y) < 34);
        if (i === this.at) this.enterPlace(); else if (i >= 0) this.go(i);
      }
    }
    this.anim.tick();
    this.anim.events.length = 0;
    this.flock?.update(this.x, this.y - 20, this.facing, false, 1);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // grassland and a river
    ctx.fillStyle = '#9fdc86'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#8ccf74';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % VIEW_W, (i * 53) % VIEW_H, 6, 2);
    ctx.fillStyle = '#6cc0ff';
    ctx.beginPath(); ctx.moveTo(0, 336); ctx.bezierCurveTo(160, 306, 300, 366, 640, 318); ctx.lineTo(640, 360); ctx.lineTo(0, 360); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bfe8ff'; for (let i = 0; i < 8; i++) ctx.fillRect(40 + i * 80 + Math.round(Math.sin(this.t * 0.03 + i) * 4), 342 - (i % 3) * 6, 14, 1);
    // the town: two rows of houses behind its three stops
    for (let i = 0; i < 9; i++) {
      const hx = 104 + (i % 5) * 44 + (i > 4 ? 22 : 0), hy = 156 + (i > 4 ? 30 : 0);
      ctx.fillStyle = INK; ctx.fillRect(hx - 1, hy - 1, 22, 18);
      ctx.fillStyle = ['#ffd6a5', '#bde0fe', '#cdeac0', '#ffc8dd'][i % 4]; ctx.fillRect(hx, hy, 20, 16);
      ctx.fillStyle = ['#e85d5d', '#5a7bd8', '#8a5a32'][i % 3];
      ctx.beginPath(); ctx.moveTo(hx - 3, hy + 1); ctx.lineTo(hx + 10, hy - 10); ctx.lineTo(hx + 23, hy + 1); ctx.closePath(); ctx.fill();
    }
    // the water park: a fence round the tube maze (top) and the log flume (bottom)
    const PX = 352, PY = 58, PW = 280, PH = 244;
    ctx.fillStyle = '#e9f6ff'; ctx.beginPath(); ctx.roundRect(PX, PY, PW, PH, 18); ctx.fill();
    ctx.strokeStyle = '#3aa0e8'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    // the flume: a long pool along the bottom, with a slide coming down into it
    ctx.fillStyle = '#6cc0ff'; ctx.beginPath(); ctx.roundRect(372, 200, 244, 88, 30); ctx.fill();
    ctx.fillStyle = '#4fb6ff'; ctx.beginPath(); ctx.roundRect(388, 226, 212, 50, 22); ctx.fill();
    ctx.fillStyle = '#bfe8ff'; for (let i = 0; i < 6; i++) ctx.fillRect(400 + i * 34 + Math.round(Math.sin(this.t * 0.04 + i) * 3), 216 + (i % 2) * 52, 12, 1);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(616, 92); ctx.bezierCurveTo(640, 150, 560, 160, 612, 206); ctx.stroke();
    // the tube maze: big rainbow tubes behind the top three stops
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = ['#ff7f95', '#5ab8ff', '#ffd24a'][k]; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(448 + k * 44, 150, 26 + (k % 2) * 8, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }
    drawText(ctx, 'SPLASH PARK', PX + PW / 2, PY + 6, { size: 1, color: '#3aa0e8', align: 'center', shadow: false });
    if (!save.unlocked('squishy')) {
      ctx.fillStyle = 'rgba(40,30,60,0.35)'; ctx.beginPath(); ctx.roundRect(PX, PY, PW, PH, 18); ctx.fill();
    }
    drawCloud(ctx, 60 + (this.t * 0.1) % 700 - 60, 40, 0.8);
    drawCloud(ctx, 330 + (this.t * 0.07) % 700 - 330, 26, 0.6);
    // the path
    ctx.strokeStyle = '#f2dcb0'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const seg of ROUTE) { ctx.beginPath(); seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.strokeStyle = '#d9b97e'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    for (const seg of ROUTE) { ctx.beginPath(); seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.setLineDash([]);
    // the places
    NODES.forEach((n, i) => this.drawNode(ctx, n, i));
    // the cat
    drawRig(ctx, this.rig, this.anim.pose, { x: this.x, y: this.y, facing: this.facing });
    this.flock?.draw(ctx);
    // header and info
    drawTextOutlined(ctx, 'WHERE TO?', VIEW_W / 2, 10, { size: 2, color: UI.gold, align: 'center' });
    if (this.target < 0) this.drawInfo(ctx, NODES[this.at], this.at);
    const n = save.needs(this.cat), happy = save.isHappy(this.cat);
    const mood = happy ? 'HAPPY CAT! POINTS x2' : n.food === 0 ? 'HUNGRY! GO HOME AND EAT' : n.drink === 0 ? 'THIRSTY! GO HOME FOR A DRINK' : 'FILL UP AT HOME FOR x2 POINTS';
    const w = measureText(mood, 1) + 16;
    panel(ctx, 8, VIEW_H - 28, w, 18, happy ? '#7a3a6a' : UI.panel);
    drawText(ctx, mood, 16, VIEW_H - 22, { size: 1, color: happy ? UI.pink : UI.cream });
  }

  private drawNode(ctx: CanvasRenderingContext2D, n: Node, i: number): void {
    const on = i === this.at && this.target < 0, locked = !this.unlocked(i);
    const pulse = on ? 2 + Math.sin(this.t * 0.15) * 2 : 0;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(n.x, n.y, 22 + pulse, 10 + pulse * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? UI.gold : locked ? '#8f88a3' : '#ffffff'; ctx.beginPath(); ctx.ellipse(n.x, n.y, 20 + pulse, 8 + pulse * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    if (n.id === 'house') {
      // the playhouse, with its little door
      const x = n.x, y = n.y - 26;
      ctx.fillStyle = INK; ctx.fillRect(x + 14, y - 4, 24, 20);
      ctx.fillStyle = '#d9a066'; ctx.fillRect(x + 16, y - 2, 20, 18);
      ctx.fillStyle = '#ff8fb1'; ctx.beginPath(); ctx.moveTo(x + 11, y - 2); ctx.lineTo(x + 26, y - 16); ctx.lineTo(x + 41, y - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(x + 26, y + 16, 5, Math.PI, 0); ctx.fill();
      return;
    }
    if (locked) {
      ctx.fillStyle = INK; ctx.fillRect(n.x - 7, n.y - 5, 14, 11); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y - 5, 5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = UI.gold; ctx.fillRect(n.x - 5, n.y - 3, 10, 7);
    } else {
      // the stage's number, in its area's colour
      const col = n.area === 'town' ? '#e85d5d' : n.area === 'tubes' ? '#8a5cd6' : '#2f8fd8';
      drawText(ctx, String(n.num), n.x + 1, n.y - 5, { size: 1, color: col, align: 'center', shadow: false });
    }
    // stars earned
    const st = save.data.stars[n.id] ?? 0;
    for (let s = 0; s < 3; s++) {
      ctx.fillStyle = s < st ? UI.gold : 'rgba(29,21,38,0.35)';
      starPath(ctx, n.x - 12 + s * 12, n.y + 17, 5, 2.2, 5); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  private drawInfo(ctx: CanvasRenderingContext2D, n: Node, i: number): void {
    const locked = !this.unlocked(i);
    const lines: string[] = [n.id === 'house' ? n.name : `${n.num}. ${n.name}`];
    if (n.id === 'house') lines.push('EAT, DRINK, PLAY, NAP', 'AND FISH FOR APPLES');
    else {
      const def = LEVELS[n.id];
      if (locked && n.id === 'squishy') lines.push('RUN THROUGH TOWN', 'TO REACH THE WATER PARK!');
      else if (locked) lines.push(`FINISH ${NODES[i - 1].name}`, 'TO OPEN THIS ONE!');
      else lines.push(save.data.best[n.id] != null ? `BEST: ${save.data.best[n.id]}` : 'NOT PLAYED YET', def.intro.split('\n')[0]);
    }
    // in the empty sky over the town, where it never covers a stop on the path
    const w = Math.max(...lines.map((l) => measureText(l, 1))) + 20;
    const bx = Math.max(8, Math.min(176 - w / 2, 340 - w)), by = 44;
    panel(ctx, bx, by, w, 16 + (lines.length - 1) * 11);
    lines.forEach((l, k) => drawText(ctx, l, bx + w / 2, by + 5 + k * 11, { size: 1, color: k === 0 ? UI.gold : locked ? UI.pink : UI.cream, align: 'center' }));
    if (this.lockedT > 0 && locked) drawTextOutlined(ctx, 'LOCKED!', n.x, n.y - 44, { size: 2, color: UI.pink, align: 'center' });
  }

  peek(): Record<string, unknown> { return { at: NODES[this.at].id, walking: this.target >= 0 }; }
}
