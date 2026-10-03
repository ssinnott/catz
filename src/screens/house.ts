// The Cat Playhouse: home. Walk up to anything and press the paw button.
//
//   food bowl       eat (fills FOOD)            water bowl     drink (fills DRINK)
//   apple tub       apple fishing, a minigame   scratching post   scritch scratch (PLAY)
//   toy mouse       at the top of the cat tree: bat it (PLAY)
//   yarn balls      knock them into the basket (PLAY)
//   playhouse       a nap, or swap to another cat
//   front door      out to the map
//
// Every one of those is a cut animation: the bars come in, the camera leans close, and the cat does
// the thing. A cat whose food, drink and play are all full is HAPPY, and happy cats score double.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { input, buttonName } from '../core/input.ts';
import { sfx } from '../core/audio.ts';
import { screens, type Screen } from '../core/screens.ts';
import { save, NEED_MAX, type CatId, type Needs } from '../core/save.ts';
import { drawText, drawTextOutlined, measureText } from '../lib/engine/text.ts';
import { Stage } from '../world/stage.ts';
import type { Scene } from '../world/director.ts';
import type { Spawn } from '../world/level.ts';
import { overlaps } from '../world/physics.ts';
import { HOUSE } from '../levels/house.ts';
import { drawCatHead, buildCat, CF, type CatRig } from '../cats/catRig.ts';
import { panel } from '../ui/hud.ts';
import { drawFishIcon } from '../world/pickups.ts';
import { heartPath } from '../core/particles.ts';
import { Menu } from '../ui/menu.ts';
import { audio } from '../core/audio.ts';
import { nav } from './nav.ts';

const INK = '#1d1526';

const PROMPT: Readonly<Record<string, string>> = {
  door: 'GO OUT', food: 'EAT', water: 'DRINK', apples: 'FISH FOR APPLES', scratch: 'SCRATCH', toy: 'PLAY', playhouse: 'GO INSIDE',
};

const EAT_LINE: Readonly<Record<CatId, string>> = {
  crush: 'MORE MUSCLE FUEL!', sprout: 'BRAIN FOOD!', sly: '...DELICIOUS.', biscuit: 'SO HUNGRY... YUM!!', truffle: 'YUMMY YUM!', pendragon: 'A FEAST FIT\nFOR A KNIGHT!',
};

interface Ball { x: number; y: number; vx: number; vy: number; r: number; color: string; spin: number; cool: number }

const BASKET = { x: 44 * 24, y: 8 * 24 + 6, w: 34 };
const BALL_HOME = [36 * 24, 39 * 24, 42 * 24];

export class HouseScreen implements Screen {
  readonly name = 'house';
  readonly touchControls = true;
  readonly music = 'house';
  readonly stage: Stage;
  private balls: Ball[] = [];
  private napping = false;
  private houseWobble = 0;
  private toySwing = 0;
  private bowlFood = 1;
  private headRig: CatRig;
  private menu: Menu | null = null;
  private t = 0;
  private hint = '';
  private hintT = 0;

  constructor(readonly cat: CatId, from: 'select' | 'map' | 'fishing' = 'map') {
    this.stage = new Stage(HOUSE, cat, {
      intro: false,
      hooks: {
        update: () => this.updateBalls(),
        drawBack: (ctx) => this.drawFurniture(ctx),
        drawFront: (ctx) => this.drawFront(ctx),
      },
    });
    this.headRig = buildCat(cat);
    BALL_HOME.forEach((x, i) => this.balls.push({ x, y: 280, vx: 0, vy: 0, r: 7, color: ['#ff6b8b', '#5ab8ff', '#ffd23f'][i], spin: 0, cool: 0 }));
    const p = this.stage.player;
    if (from === 'fishing') { const tub = this.station('apples')!; p.placeAt(tub.x - 26, tub.y, 1); }
    else if (from === 'map') { const door = this.station('door')!; p.placeAt(door.x + 20, door.y, 1); }
    this.stage.cam.snapTo(p.feetX + 60, p.feetY - 60);
    this.stage.play(this.welcome(from));
  }

  private station(name: string): Spawn | null {
    const i = (HOUSE.stations || []).indexOf(name);
    return this.stage.stations.find((s) => s.index === i) ?? null;
  }
  private stationName(s: Spawn): string { return (HOUSE.stations || [])[s.index] ?? ''; }
  private get needs(): Needs { return save.needs(this.cat); }

  // ---------------------------------------------------------------- scenes

  private *welcome(from: string): Scene {
    const p = this.stage.player, d = this.stage.director;
    p.script(true);
    yield 10;
    if (from === 'select') { p.play('wave', true); d.say(`HI! I'M ${p.def.name}!`, 0, 0, 80, () => p.headTop()); yield 70; }
    else if (from === 'fishing') { p.play('yum', true); yield 40; }
    else { p.play('stretch', true); d.say('HOME SWEET HOME!', 0, 0, 70, () => p.headTop()); yield 56; }
    p.script(false);
    if (!save.isHappy(this.cat)) this.showHint(this.hintText());
  }

  private hintText(): string {
    const n = this.needs;
    if (n.food < NEED_MAX) return 'HUNGRY? VISIT THE FOOD BOWL!';
    if (n.drink < NEED_MAX) return 'THIRSTY? HAVE A DRINK!';
    if (n.play < NEED_MAX) return 'PLAY! SCRATCH, CLIMB, OR BAT THE YARN!';
    return 'HAPPY CAT! POINTS x2 IN THE CHALLENGES!';
  }

  private showHint(text: string): void { this.hint = text; this.hintT = 240; }

  private *walkTo(x: number, face: 1 | -1): Scene {
    const p = this.stage.player;
    p.walkTo(x, 2.2);
    for (let i = 0; i < 160 && !p.arrived; i++) yield 1;
    p.facing = face;
  }

  private *eat(s: Spawn): Scene {
    const p = this.stage.player, d = this.stage.director;
    p.script(true); d.bars(true);
    yield* this.walkTo(s.x - 18, 1);
    d.focus = { x: s.x - 6, y: s.y - 30 }; d.zoomIn(1.7, 0.08);
    const long = this.cat === 'biscuit';
    if (long) { d.say('FOOD!!!', 0, 0, 40, () => p.headTop()); p.play('hop', true); yield 30; }
    p.play('eat');
    for (let i = 0; i < (long ? 170 : 110); i++) { this.bowlFood = Math.max(0.15, this.bowlFood - 0.006); yield 1; }
    p.play('yum', true);
    d.say(EAT_LINE[this.cat], 0, 0, 80, () => p.headTop());
    this.fill('food', NEED_MAX, s.x, s.y - 50);
    yield 60;
    yield* this.done();
    this.bowlFood = 1;
  }

  private *drink(s: Spawn): Scene {
    const p = this.stage.player, d = this.stage.director;
    p.script(true); d.bars(true);
    yield* this.walkTo(s.x - 18, 1);
    d.focus = { x: s.x - 6, y: s.y - 30 }; d.zoomIn(1.7, 0.08);
    p.play('drink');
    for (let i = 0; i < 100; i++) { if (i % 14 === 0) this.stage.parts.emit('ring', s.x, s.y - 6, { size: 2, life: 24 }); yield 1; }
    p.play('yum', true);
    d.say('AHH! REFRESHING!', 0, 0, 70, () => p.headTop());
    this.fill('drink', NEED_MAX, s.x, s.y - 50);
    yield 56;
    yield* this.done();
  }

  private *scratch(s: Spawn): Scene {
    const p = this.stage.player, d = this.stage.director;
    p.script(true); d.bars(true);
    yield* this.walkTo(s.x - 14, 1);
    d.focus = { x: s.x, y: s.y - 40 }; d.zoomIn(1.6, 0.08);
    p.play('scratch');
    for (let i = 0; i < 96; i++) {
      if (i % 7 === 0) this.stage.parts.burst('crumb', s.x - 2, s.y - 30 - (i % 3) * 8, 2, 1.5, Math.PI, Math.PI * 0.6, { color: '#e0c48c' });
      yield 1;
    }
    p.play('hop', true);
    d.say('SCRITCH SCRATCH!', 0, 0, 60, () => p.headTop());
    this.fill('play', 1, s.x, s.y - 60);
    yield 40;
    yield* this.done();
  }

  private *toy(s: Spawn): Scene {
    const p = this.stage.player, d = this.stage.director;
    p.script(true); d.bars(true);
    yield* this.walkTo(s.x - 12, 1);
    d.focus = { x: s.x, y: s.y - 40 }; d.zoomIn(1.6, 0.08);
    for (let k = 0; k < 3; k++) {
      p.play('bat', true);
      yield 8;
      this.toySwing = 1;
      sfx('squeak', 0.7, 1.3);
      this.stage.parts.burst('spark', s.x + 10, s.y - 44, 4, 1.5);
      yield 16;
    }
    p.play('spin', true);
    sfx('mew', 1, this.stage.player.def.pitch);
    yield 26;
    p.play('cheer');
    d.say('GOT IT! GOT IT!', 0, 0, 60, () => p.headTop());
    this.fill('play', 2, s.x, s.y - 70);
    yield 50;
    yield* this.done();
  }

  private *nap(s: Spawn): Scene {
    const p = this.stage.player, d = this.stage.director;
    p.script(true); d.bars(true);
    yield* this.walkTo(s.x, 1);
    d.focus = { x: s.x, y: s.y - 40 }; d.zoomIn(1.4, 0.06);
    sfx('door');
    p.state = 'hidden';
    this.napping = true;
    for (let i = 0; i < 170; i++) {
      this.houseWobble = Math.sin(i * 0.12) * 0.03;
      if (i % 30 === 0) { this.stage.parts.emit('z', s.x + 8, s.y - 58, { vx: 0.25, vy: -0.35 }); sfx('snore', 0.6); }
      yield 1;
    }
    this.napping = false; this.houseWobble = 0;
    p.state = 'script';
    p.placeAt(s.x - 30, s.y, 1);
    p.state = 'script';
    sfx('door');
    p.play('stretch', true);
    yield 50;
    d.say('WHAT A GOOD NAP!', 0, 0, 60, () => p.headTop());
    this.fill('play', 1, s.x, s.y - 70);
    yield 40;
    yield* this.done();
  }

  private *done(): Scene {
    const p = this.stage.player, d = this.stage.director;
    d.zoomIn(1, 0.1); d.bars(false);
    yield 10;
    p.script(false);
    if (save.isHappy(this.cat)) {
      sfx('cheer');
      d.shout('HAPPY CAT!', 'POINTS x2 IN THE CHALLENGES', 120, UI.pink);
      for (let i = 0; i < 6; i++) this.stage.parts.emit('heart', p.feetX + (i - 2.5) * 10, p.body.y - 10, { vy: -0.8 - i * 0.05 });
    } else this.showHint(this.hintText());
  }

  private fill(need: keyof Needs, amount: number, x: number, y: number): void {
    const before = this.needs[need];
    save.addNeed(this.cat, need, amount);
    const gained = this.needs[need] - before;
    const label = need === 'food' ? 'FOOD' : need === 'drink' ? 'DRINK' : 'PLAY';
    this.stage.parts.text(x, y, gained > 0 ? `+${label}` : `${label} FULL!`, gained > 0 ? UI.mint : UI.cream, 1, 70);
    sfx(gained > 0 ? 'sparkle' : 'pop');
  }

  // ---------------------------------------------------------------- yarn balls

  private updateBalls(): void {
    const s = this.stage, p = s.player, lv = s.lv;
    this.t++;
    if (this.toySwing > 0) this.toySwing *= 0.97;
    const atk = p.attackBox();
    for (const b of this.balls) {
      if (b.cool > 0) b.cool--;
      b.vy += 0.35;
      b.x += b.vx; b.y += b.vy;
      b.spin += b.vx * 0.1;
      const floor = 13 * 24;
      if (b.y + b.r > floor) { b.y = floor - b.r; if (Math.abs(b.vy) > 1.2) sfx('ball', Math.min(1, Math.abs(b.vy) / 6)); b.vy *= -0.62; b.vx *= 0.96; if (Math.abs(b.vy) < 0.6) b.vy = 0; }
      if (b.x - b.r < 24) { b.x = 24 + b.r; b.vx = Math.abs(b.vx) * 0.8; }
      if (b.x + b.r > (lv.w - 1) * 24) { b.x = (lv.w - 1) * 24 - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y - b.r < 24) { b.y = 24 + b.r; b.vy = Math.abs(b.vy); }
      // the cat: a paw swipe sends it flying, running into it nudges it along
      const box = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
      if (atk && b.cool <= 0 && overlaps(atk, box)) {
        b.vx = p.facing * 6.5; b.vy = -6.8; b.cool = 12;
        sfx('ball'); s.parts.burst('spark', b.x, b.y, 4, 1.5);
      } else if (overlaps(p.body, box) && b.cool <= 0) {
        const dir = b.x > p.feetX ? 1 : -1;
        b.vx = dir * Math.max(2.4, Math.abs(p.body.vx) * 1.3);
        if (p.body.vy > 1 && b.y > p.feetY - 6) { b.vy = -5; p.body.vy = -5; }
        b.cool = 8;
      }
      // into the basket: falling, through the rim
      if (b.vy > 0 && b.x > BASKET.x - BASKET.w / 2 + 4 && b.x < BASKET.x + BASKET.w / 2 - 4 && b.y > BASKET.y && b.y < BASKET.y + 12) {
        sfx('cheer');
        s.parts.burst('confetti', BASKET.x, BASKET.y, 24, 3, -Math.PI / 2, Math.PI);
        s.parts.text(BASKET.x, BASKET.y - 30, 'SCORE!', UI.gold, 2, 70);
        this.fill('play', 1, BASKET.x, BASKET.y - 50);
        if (!s.director.busy) { p.play('cheer'); s.director.say('NOTHING BUT NET!', 0, 0, 60, () => p.headTop()); }
        b.x = BALL_HOME[this.balls.indexOf(b)]; b.y = 120; b.vx = 0; b.vy = 0;
      }
    }
    for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
      const a = this.balls[i], c = this.balls[j], dx = c.x - a.x, dy = c.y - a.y, dist = Math.hypot(dx, dy), min = a.r + c.r;
      if (dist > 0 && dist < min) {
        const nx = dx / dist, ny = dy / dist, push = (min - dist) / 2;
        a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; c.vx -= rel * nx; c.vy -= rel * ny; }
      }
    }
  }

  // ---------------------------------------------------------------- screen

  update(): void {
    const s = this.stage;
    if (this.menu) {
      if (input.pressed('back')) { sfx('back'); this.menu = null; s.player.script(false); return; }
      this.menu.update();
      s.update();
      return;
    }
    if (input.pressed('pause') && !s.director.busy) { sfx('pop'); screens.push(new HousePause(this.cat)); return; }
    const near = !s.director.busy && s.player.controllable && s.player.body.onGround ? s.nearStation() : null;
    if (near && input.pressed('action')) {
      input.consume();
      this.use(near);
    }
    if (this.hintT > 0) this.hintT--;
    s.update();
  }

  private use(st: Spawn): void {
    const s = this.stage, name = this.stationName(st);
    switch (name) {
      case 'food': s.play(this.eat(st)); break;
      case 'water': s.play(this.drink(st)); break;
      case 'scratch': s.play(this.scratch(st)); break;
      case 'toy': s.play(this.toy(st)); break;
      case 'apples':
        sfx('select');
        screens.go(nav.fishing(this.cat), { at: s.catOnScreen() });
        break;
      case 'door':
        sfx('door');
        screens.go(nav.map(this.cat, 'house'), { at: s.catOnScreen() });
        break;
      case 'playhouse':
        sfx('pop');
        s.player.script(true);
        this.menu = new Menu([
          { label: 'TAKE A NAP', pick: () => { this.menu = null; s.player.script(false); s.play(this.nap(st)); } },
          { label: 'CHANGE CAT', pick: () => { screens.go(nav.select(), { at: s.catOnScreen() }); } },
          { label: 'NEVER MIND', pick: () => { this.menu = null; s.player.script(false); } },
        ], VIEW_W / 2, 140, 190);
        break;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.stage.draw(ctx);
    if (this.stage.director.letterbox < 0.95) {
      ctx.save();
      ctx.globalAlpha = 1 - this.stage.director.letterbox;
      this.drawNeeds(ctx);
      ctx.restore();
    }
    this.stage.director.drawScreen(ctx);
    if (this.menu) {
      ctx.fillStyle = 'rgba(29,21,38,0.5)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawTextOutlined(ctx, 'THE PLAYHOUSE', VIEW_W / 2, 100, { size: 2, color: UI.gold, align: 'center' });
      this.menu.draw(ctx);
    }
  }

  private drawNeeds(ctx: CanvasRenderingContext2D): void {
    const n = this.needs, happy = save.isHappy(this.cat);
    panel(ctx, 6, 6, 200, 52);
    ctx.save();
    ctx.beginPath(); ctx.arc(28, 31, 18, 0, Math.PI * 2); ctx.fillStyle = happy ? UI.pink : UI.panelHi; ctx.fill(); ctx.clip();
    drawCatHead(ctx, this.headRig, 28, 34, 1.3, happy ? CF.happy : n.food === 0 ? CF.hungry : CF.neutral);
    ctx.restore();
    drawText(ctx, this.stage.player.def.name, 52, 11, { size: 1, color: UI.cream });
    const rows: [keyof Needs, string][] = [['food', 'FOOD'], ['drink', 'DRINK'], ['play', 'PLAY']];
    rows.forEach(([k, label], i) => {
      const y = 23 + i * 11;
      drawText(ctx, label, 52, y, { size: 1, color: UI.grey });
      for (let j = 0; j < NEED_MAX; j++) {
        const on = j < n[k];
        ctx.fillStyle = on ? (k === 'food' ? '#ff9466' : k === 'drink' ? UI.water : UI.mint) : UI.panelLo;
        ctx.beginPath(); ctx.roundRect(94 + j * 16, y - 1, 13, 8, 3); ctx.fill();
      }
    });
    if (happy) {
      ctx.save(); ctx.translate(160, 34 + Math.sin(this.t * 0.1) * 2);
      heartPath(ctx, 9); ctx.fillStyle = UI.pink; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
      ctx.restore();
      drawText(ctx, 'x2', 175, 30, { size: 1, color: UI.pink });
    }
    const purr = `PURR POINTS ${save.data.purrs}`;
    panel(ctx, VIEW_W - measureText(purr, 1) - 28, 6, measureText(purr, 1) + 18, 20);
    drawText(ctx, purr, VIEW_W - measureText(purr, 1) - 19, 13, { size: 1, color: UI.gold });
    if (this.hintT > 0 && !this.stage.director.busy) {
      const a = Math.min(1, this.hintT / 30);
      ctx.save(); ctx.globalAlpha *= a;
      const w = measureText(this.hint, 1) + 20;
      panel(ctx, VIEW_W / 2 - w / 2, VIEW_H - 34, w, 20, UI.panel);
      drawText(ctx, this.hint, VIEW_W / 2, VIEW_H - 27, { size: 1, color: UI.cream, align: 'center' });
      ctx.restore();
    }
  }

  /** The room's furniture, drawn in the world behind the cat. */
  private drawFurniture(ctx: CanvasRenderingContext2D): void {
    const s = this.stage, t = s.time;
    const st = (name: string) => this.station(name)!;
    // a rug
    const floor = 13 * 24;
    ctx.fillStyle = '#c86fd0'; ctx.fillRect(6 * 24, floor - 3, 22 * 24, 3);
    ctx.fillStyle = '#e8a0ee'; for (let x = 6 * 24; x < 28 * 24; x += 12) ctx.fillRect(x, floor - 3, 6, 1);
    // the front door
    const door = st('door');
    {
      const x = door.x - 22, y = door.y - 80;
      ctx.fillStyle = INK; ctx.fillRect(x - 3, y - 3, 50, 83);
      ctx.fillStyle = '#9a5f33'; ctx.fillRect(x, y, 44, 80);
      ctx.fillStyle = '#b77a43'; ctx.fillRect(x + 4, y + 4, 36, 30); ctx.fillRect(x + 4, y + 40, 36, 36);
      ctx.fillStyle = '#bfe8ff'; ctx.fillRect(x + 10, y + 9, 24, 20);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 21, y + 9, 2, 20);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 36, y + 46, 3, 0, Math.PI * 2); ctx.fill();
      // the cat flap
      ctx.fillStyle = INK; ctx.fillRect(x + 12, y + 58, 20, 20);
      ctx.fillStyle = '#7a4a24'; ctx.fillRect(x + 14, y + 60, 16, 18);
      ctx.fillStyle = '#e85d5d'; ctx.fillRect(x - 8, door.y - 2, 60, 2);
    }
    // food bowl, with the cat's initial on it
    const food = st('food');
    bowl(ctx, food.x, food.y, '#e8413b', this.headRig.build.cat.id[0].toUpperCase(), () => {
      // a heap of fish-shaped kibble above the rim, going down as the cat eats
      const h = Math.max(0, Math.round(4 * this.bowlFood));
      for (let i = 0; i < 7; i++) {
        const kx = food.x - 10 + i * 3, ky = food.y - 12 - h + Math.abs(i - 3) * (h > 1 ? 1 : 0) + (i % 2);
        ctx.fillStyle = INK; ctx.fillRect(kx - 1, ky - 1, 5, 4);
        ctx.fillStyle = i % 3 ? '#c98a4a' : '#e0a060'; ctx.fillRect(kx, ky, 3, 2);
      }
    });
    // water bowl
    const water = st('water');
    bowl(ctx, water.x, water.y, '#3f73d9', '', () => {});
    ctx.fillStyle = '#8fd6ff'; ctx.beginPath(); ctx.ellipse(water.x, water.y - 10, 11, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(water.x - 6 + Math.round(Math.sin(t * 0.05) * 3), water.y - 11, 4, 1);
    // the apple tub
    const tub = st('apples');
    {
      const x = tub.x, y = tub.y;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - 26, y - 34, 52, 34, 6); ctx.fill();
      ctx.fillStyle = '#a8763c'; ctx.beginPath(); ctx.roundRect(x - 24, y - 32, 48, 31, 5); ctx.fill();
      for (const bx of [-14, 0, 14]) { ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x + bx - 1, y - 32, 2, 31); }
      ctx.fillStyle = '#5a6476'; ctx.fillRect(x - 25, y - 26, 50, 3); ctx.fillRect(x - 25, y - 10, 50, 3);
      ctx.fillStyle = '#6cc0ff'; ctx.fillRect(x - 22, y - 34, 44, 4);
      const apples = ['#e8413b', '#7ed66b', '#e8413b', '#ffcb3d'];
      apples.forEach((c, i) => {
        const ax = x - 14 + i * 9, ay = y - 35 + Math.sin(t * 0.06 + i) * 1.2;
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ax, ay, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ax, ay, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(ax, ay - 6, 1, 3);
      });
      // a little rod leaning on it
      ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 22, y - 2); ctx.lineTo(x + 36, y - 60); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 36, y - 60); ctx.quadraticCurveTo(x + 40, y - 30, x + 33, y - 20); ctx.stroke();
    }
    // the cat tree: a trunk from the floor to the top shelf, wrapped in rope at the bottom
    const post = st('scratch');
    {
      const x = post.x + 2;
      ctx.fillStyle = INK; ctx.fillRect(x - 6, 5 * 24, 12, floor - 5 * 24);
      ctx.fillStyle = '#c9a676'; ctx.fillRect(x - 5, 5 * 24, 10, floor - 5 * 24);
      ctx.fillStyle = '#e0c48c';
      for (let y = floor - 70; y < floor; y += 4) ctx.fillRect(x - 5, y, 10, 2);
      ctx.fillStyle = '#d8c3a5'; ctx.fillRect(x - 16, floor - 6, 32, 6);
    }
    // the toy mouse, dangling under the top shelf
    const toy = st('toy');
    {
      const ax = toy.x + 14, ay = 5 * 24 + 8;
      const sw = Math.sin(t * 0.08) * (0.25 + this.toySwing * 0.8);
      const mx = ax + Math.sin(sw) * 26, my = ay + Math.cos(sw) * 26 - 46;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay - 46); ctx.lineTo(mx, my); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(mx, my + 4, 7, 5, sw, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9a95a8'; ctx.beginPath(); ctx.ellipse(mx, my + 4, 5.5, 3.8, sw, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb3cc'; ctx.beginPath(); ctx.arc(mx - 2, my, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(Math.round(mx + 3), Math.round(my + 2), 1, 1);
    }
    // the basket on the wall
    {
      const x = BASKET.x, y = BASKET.y;
      ctx.fillStyle = INK; ctx.fillRect(x - BASKET.w / 2 - 2, y - 2, BASKET.w + 4, 22);
      ctx.fillStyle = '#d9a066'; ctx.fillRect(x - BASKET.w / 2, y, BASKET.w, 18);
      ctx.fillStyle = '#b77a43'; for (let i = 0; i < BASKET.w; i += 5) ctx.fillRect(x - BASKET.w / 2 + i, y, 2, 18);
      ctx.fillStyle = '#e8c08a'; ctx.fillRect(x - BASKET.w / 2, y, BASKET.w, 3);
      ctx.fillStyle = INK; ctx.fillRect(x - 2, y + 20, 4, floor - y - 20);
      drawText(ctx, 'YARN IN', x, y - 14, { size: 1, color: '#c86fd0', align: 'center', shadow: false });
    }
    // the cardboard playhouse
    const ph = st('playhouse');
    {
      ctx.save();
      ctx.translate(ph.x, ph.y);
      ctx.rotate(this.houseWobble);
      ctx.fillStyle = INK; ctx.fillRect(-34, -64, 68, 64);
      ctx.fillStyle = '#d9a066'; ctx.fillRect(-32, -62, 64, 62);
      ctx.fillStyle = '#c4884f'; ctx.fillRect(-32, -62, 8, 62);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-42, -60); ctx.lineTo(0, -98); ctx.lineTo(42, -60); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8fb1'; ctx.beginPath(); ctx.moveTo(-37, -62); ctx.lineTo(0, -94); ctx.lineTo(37, -62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, -16, 15, Math.PI, 0); ctx.lineTo(15, 0); ctx.lineTo(-15, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(0, -16, 13, Math.PI, 0); ctx.lineTo(13, 0); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(14, -44, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.napping ? '#ffe9a0' : '#bfe8ff'; ctx.beginPath(); ctx.arc(14, -44, 6, 0, Math.PI * 2); ctx.fill();
      if (this.napping) { drawCatHead(ctx, this.headRig, 14, -42, 0.42, CF.closed); }
      drawText(ctx, 'HOME', -14, -76, { size: 1, color: INK, shadow: false });
      ctx.restore();
    }
    // yarn balls
    for (const b of this.balls) drawYarn(ctx, b);
  }

  /** Prompts float over the station the cat is standing at. */
  private drawFront(ctx: CanvasRenderingContext2D): void {
    const s = this.stage;
    if (s.director.busy || this.menu) return;
    const st = s.player.controllable ? s.nearStation() : null;
    if (!st) return;
    const text = `${buttonName('action')}: ${PROMPT[this.stationName(st)] || ''}`;
    const w = measureText(text, 1) + 12;
    const y = st.y - (this.stationName(st) === 'playhouse' ? 112 : this.stationName(st) === 'door' ? 98 : 76) + Math.sin(s.time * 0.12) * 2;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(st.x - w / 2 - 2, y - 2, w + 4, 15, 5); ctx.fill();
    ctx.fillStyle = UI.gold; ctx.beginPath(); ctx.roundRect(st.x - w / 2, y, w, 11, 4); ctx.fill();
    drawText(ctx, text, st.x, y + 2, { size: 1, color: INK, align: 'center', shadow: false });
  }

  /** Test hooks: `goto:station` walks the cat beside a station; `skip` ends any scene. */
  cheat(cmd: string): void {
    const s = this.stage, p = s.player;
    const [k, v] = cmd.split(':');
    if (k === 'skip') { s.director.cancel(); p.script(false); }
    if (k === 'goto') { const st = this.station(v); if (st) { p.placeAt(st.x - 4, st.y, 1); s.cam.snapTo(p.feetX, p.feetY); } }
  }

  peek(): Record<string, unknown> {
    const p = this.stage.player, n = this.needs;
    return { x: Math.round(p.feetX), y: Math.round(p.feetY), state: p.state, busy: this.stage.director.busy, zoom: Math.round(this.stage.director.zoom * 100) / 100, food: n.food, drink: n.drink, play: n.play, happy: save.isHappy(this.cat), near: this.stage.nearStation() ? this.stationName(this.stage.nearStation()!) : '' };
  }
}

function bowl(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, letter: string, contents: () => void): void {
  contents();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x - 15, y - 11); ctx.lineTo(x + 15, y - 11); ctx.lineTo(x + 11, y); ctx.lineTo(x - 11, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 13, y - 9); ctx.lineTo(x + 13, y - 9); ctx.lineTo(x + 10, y - 1); ctx.lineTo(x - 10, y - 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 11, y - 8, 22, 1);
  if (letter) drawText(ctx, letter, x, y - 8, { size: 1, color: '#ffffff', align: 'center', shadow: false });
}

function drawYarn(ctx: CanvasRenderingContext2D, b: Ball): void {
  ctx.save();
  ctx.translate(Math.round(b.x), Math.round(b.y));
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, b.r + 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(b.spin);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(0, 0, b.r - 1, (b.r - 1) * 0.45, i * 0.8, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  // the loose end
  ctx.strokeStyle = b.color; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(b.x + Math.cos(b.spin) * b.r, b.y + Math.sin(b.spin) * b.r);
  ctx.quadraticCurveTo(b.x + Math.cos(b.spin) * (b.r + 8), b.y + 6, b.x - b.vx * 3 + Math.cos(b.spin) * 10, b.y + b.r); ctx.stroke();
}

class HousePause implements Screen {
  readonly name = 'pause';
  readonly overlay = true;
  private menu: Menu;
  constructor(cat: CatId) {
    this.menu = new Menu([
      { label: 'KEEP PLAYING', pick: () => screens.pop() },
      { label: () => (audio.muted ? 'SOUND: OFF' : 'SOUND: ON'), pick: () => { audio.toggleMute(); } },
      { label: 'GO TO THE MAP', pick: () => screens.go(nav.map(cat, 'house')) },
      { label: 'TITLE SCREEN', pick: () => screens.go(nav.title()) },
    ], VIEW_W / 2, 150, 220);
  }
  update(): void {
    if (input.pressed('back') || input.pressed('pause')) { sfx('back'); screens.pop(); return; }
    this.menu.update();
  }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(29,21,38,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextOutlined(ctx, 'PAUSED', VIEW_W / 2, 90, { size: 4, color: UI.gold, align: 'center', thickness: 2 });
    this.menu.draw(ctx);
  }
}

export { drawFishIcon };
