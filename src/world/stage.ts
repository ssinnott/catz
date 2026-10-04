// A level, running: the cat, the bad guys, the water, the fish, the camera, and the cut scenes.
//
// The stage owns every rule that involves two things touching -- a paw and a raccoon, a cat and a
// jet, a cat and the water -- because neither side of a collision should know the other's rules.
// The challenge screen (src/screens/play.ts) and the playhouse (src/screens/house.ts) both run one.
import { VIEW_W, VIEW_H, TILE, POINTS, UI } from '../config.ts';
import { sfx } from '../core/audio.ts';
import { input } from '../core/input.ts';
import { Particles } from '../core/particles.ts';
import { save, type CatId, type LevelId } from '../core/save.ts';
import { createCamera, type Camera } from '../lib/scene/camera.ts';
import { makeRng } from '../lib/engine/rng.ts';
import { CF } from '../cats/catRig.ts';
import { Flock } from '../cats/dragons.ts';
import { breakTile, inWater, parseLevel, surfaceAt, tileOf, type Level, type LevelDef, type Spawn } from './level.ts';
import { overlaps } from './physics.ts';
import { Player } from './player.ts';
import { Enemy, type EnemyKind } from './enemies.ts';
import { Jet, Pour, Geyser, Log, LogSpawner, drawWater, WATER_STYLES } from './hazards.ts';
import { Fish, Checkpoint, Goal, Decor } from './pickups.ts';
import { TileLayer } from './tiles.ts';
import { Backdrop } from './backdrops.ts';
import { Director, type Scene } from './director.ts';

export interface StageResult {
  level: LevelId | 'house';
  score: number;
  fish: number;
  fishTotal: number;
  gold: number;
  goldTotal: number;
  bonks: number;
  splashes: number;
  seconds: number;
  timeBonus: number;
  happy: boolean;
  stars: number;
}

export interface StageHooks {
  onFinish?(r: StageResult): void;
  update?(stage: Stage): void;
  drawBack?(ctx: CanvasRenderingContext2D, stage: Stage): void;
  drawFront?(ctx: CanvasRenderingContext2D, stage: Stage): void;
}

export interface StageOptions {
  intro?: boolean;
  hooks?: StageHooks;
}

const FLAG: Readonly<Record<CatId, string>> = { crush: '#f08a3c', sprout: '#5ab8ff', sly: '#7b4fc9', biscuit: '#e2493b', truffle: '#ff7aa8', pendragon: '#d8343f' };

export class Stage {
  readonly lv: Level;
  readonly def: LevelDef;
  readonly cat: CatId;
  readonly player: Player;
  readonly parts = new Particles();
  readonly director = new Director();
  readonly cam: Camera;
  readonly tiles: TileLayer;
  readonly backdrop: Backdrop;
  readonly enemies: Enemy[] = [];
  readonly fish: Fish[] = [];
  readonly jets: Jet[] = [];
  readonly pours: Pour[] = [];
  readonly geysers: Geyser[] = [];
  logs: Log[] = [];
  readonly spawners: LogSpawner[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly decor: Decor[] = [];
  readonly stations: Spawn[] = [];
  readonly goal: Goal | null = null;
  readonly flock: Flock | null = null;
  private hooks: StageHooks;
  respawn: { x: number; y: number; facing: 1 | -1 };
  score = 0;
  fishGot = 0;
  goldGot = 0;
  readonly fishTotal: number;
  readonly goldTotal: number;
  bonks = 0;
  splashes = 0;
  /** Steps of actual play (cut scenes do not count against the clock). */
  frames = 0;
  /** Steps since the stage was made, for everything that animates. */
  time = 0;
  readonly happy: boolean;
  finished = false;
  private hissCool = 0;
  private rng = makeRng(0x5ca7);

  constructor(def: LevelDef, cat: CatId, opts: StageOptions = {}) {
    this.def = def;
    this.lv = parseLevel(def);
    this.cat = cat;
    this.hooks = opts.hooks || {};
    const lv = this.lv;
    this.player = new Player(cat, lv.start.x, lv.start.y);
    this.respawn = { x: lv.start.x, y: lv.start.y, facing: 1 };
    this.tiles = new TileLayer(lv, def.theme);
    this.backdrop = new Backdrop(def.theme, lv.pw, def.name.length * 31 + 7);
    this.cam = createCamera({ viewW: VIEW_W, viewH: VIEW_H, ease: 0.12, bounds: { x: 0, y: 0, w: lv.pw, h: lv.ph } });
    this.happy = def.id !== 'house' && save.isHappy(cat);
    let fishN = 0, goldN = 0;
    let goal: Goal | null = null;
    for (const s of lv.spawns) {
      switch (s.kind) {
        case 'fish': this.fish.push(new Fish(s.x, s.y - 4, false)); fishN++; break;
        case 'goldfish': this.fish.push(new Fish(s.x, s.y - 4, true)); goldN++; break;
        case 'rat': case 'raccoon': case 'dog': case 'pigeon': case 'crab': case 'frog':
          this.enemies.push(new Enemy(s.kind as EnemyKind, s.x, s.y, s.index)); break;
        case 'jetR': this.jets.push(new Jet(lv, s.tx, s.ty, 1, s.index)); break;
        case 'jetL': this.jets.push(new Jet(lv, s.tx, s.ty, -1, s.index)); break;
        case 'pour': this.pours.push(new Pour(lv, s.tx, s.ty, s.index)); break;
        case 'geyser': this.geysers.push(new Geyser(lv, s.tx, s.index)); break;
        case 'logs': this.spawners.push(new LogSpawner(s.x, lv.waterTop[s.tx], def.logEvery ?? 200, s.index * 70, def.stream ?? 1)); break;
        case 'checkpoint': this.checkpoints.push(new Checkpoint(s.x, s.y, s.index)); break;
        case 'goal': goal = new Goal(s.x, s.y, def.theme); break;
        case 'station': this.stations.push(s); break;
        case 'lamp': case 'tree': case 'bush': case 'flowers': case 'fence': case 'sign':
          this.decor.push(new Decor(s.kind, s.x, s.y, def.theme, s.tx * 7 + s.ty)); break;
        default: break;
      }
    }
    this.goal = goal;
    this.fishTotal = fishN;
    this.goldTotal = goldN;
    if (this.player.def.dragons) this.flock = new Flock(lv.start.x, lv.start.y);
    // pre-roll the logs so the stream is already full when the level opens
    for (let i = 0; i < 900 && this.spawners.length; i++) this.stepLogs(1, true);
    this.cam.snapTo(this.player.feetX + 60, this.player.feetY - 50);
    if (opts.intro !== false) this.director.run(this.introScene());
  }

  // ---------------------------------------------------------------- scenes

  private *introScene(): Scene {
    const p = this.player, d = this.director;
    p.script(true);
    d.bars(true);
    d.focus = { x: p.feetX, y: p.feetY - 30 };
    d.zoomIn(1.5, 0.1);
    d.shout(this.def.name, this.happy ? 'HAPPY CAT!  POINTS x2' : 'FISH, GOLDEN FISH, AND DO NOT FALL IN!', 120);
    yield 30;
    p.play('meow', true);
    yield 14;
    d.say(this.def.intro, 0, 0, 90, () => p.headTop());
    for (let i = 0; i < 70; i++) { if (input.pressed('jump') || input.pressed('confirm')) break; yield 1; }
    d.zoomIn(1, 0.12);
    d.bars(false);
    p.script(false);
    d.shout('GO!', '', 40, UI.mint);
    sfx('select');
  }

  private *splashScene(): Scene {
    const p = this.player, d = this.director, b = p.body;
    const surface = Math.min(surfaceAt(this.lv, p.feetX, p.centerY + 4), this.lv.ph);
    this.splashes++;
    p.state = 'splash';
    b.vx = 0; b.vy = 0;
    p.wet = 1;
    p.play('flail', false);
    this.parts.splash(p.feetX, surface, 2.2);
    sfx('splash');
    this.cam.shake(5, 22);
    this.addPoints(POINTS.splash, p.feetX, surface - 50, true);
    d.shout('SPLASH!', 'BACK TO THE LAST BELL', 100, UI.sky);
    d.bars(true);
    d.focus = { x: p.feetX, y: surface - 20 };
    d.zoomIn(1.4, 0.1);
    // sink, kicking, under the translucent water
    for (let i = 0; i < 34; i++) {
      b.y += 0.7;
      if (i % 5 === 0) this.parts.emit('bubble', p.feetX + (this.rng.next() - 0.5) * 14, b.y + 10, { vy: -0.8 });
      yield 1;
    }
    sfx('bubbles');
    yield 16;
    d.closeIris({ x: VIEW_W / 2, y: VIEW_H / 2 });
    yield 22;
    // back at the checkpoint, dripping
    const r = this.respawn;
    p.placeAt(r.x, r.y, r.facing);
    p.state = 'script';
    p.wet = 1;
    this.flock?.gather(p.feetX, p.feetY);
    this.cam.snapTo(p.feetX + 40, p.feetY - 50);
    d.focus = { x: p.feetX, y: p.feetY - 30 };
    d.openIris();
    yield 12;
    p.play('shake', true);
    yield 40;
    d.say(this.rng.pick(['BRR! WET!', 'YUCK!', 'NOT AGAIN!', 'HISSSS!'])!, 0, 0, 50, () => p.headTop());
    yield 16;
    p.wet = 0.3;
    d.zoomIn(1, 0.12);
    d.bars(false);
    p.script(false);
    p.invuln = 60;
  }

  private *goalScene(): Scene {
    const p = this.player, d = this.director, g = this.goal!;
    this.finished = true;
    p.script(true);
    d.bars(true);
    sfx('fanfare');
    d.focus = { x: g.x, y: g.y - 40 };
    d.zoomIn(1.3, 0.06);
    p.walkTo(g.x + (this.def.theme === 'tubes' ? 0 : 18), 2.2);
    for (let i = 0; i < 120 && !p.arrived; i++) yield 1;
    if (this.def.theme === 'tubes') {
      // into the exit tube, and away down the slide
      p.play('slide', true);
      sfx('wheee');
      for (let i = 0; i < 20; i++) { p.body.y -= 0.4; yield 1; }
      p.state = 'hidden';
      this.parts.burst('spark', g.x, g.y - 30, 16, 3);
      yield 30;
      p.placeAt(g.x + 10, g.y, 1);
      p.state = 'script';
    }
    p.facing = 1;
    p.play('victory', true);
    d.flash = 0.5;
    sfx('win');
    for (let i = 0; i < 4; i++) this.parts.burst('confetti', g.x + (i - 1.5) * 40, g.y - 110, 18, 3.5, -Math.PI / 2, Math.PI * 0.9);
    const lines: Record<string, string> = { town: 'WE MADE IT TO THE\nWATER PARK!', tubes: 'OUT OF THE MAZE!', flume: 'WHAT A RIDE!' };
    d.shout(this.def.theme === 'town' ? 'WATER PARK!' : 'YOU DID IT!', '', 130);
    yield 30;
    d.say(lines[this.def.theme] || 'YAY!', 0, 0, 100, () => p.headTop());
    yield 110;
    this.hooks.onFinish?.(this.result());
  }

  /** The level's numbers, for the results screen. */
  result(): StageResult {
    const seconds = Math.floor(this.frames / 60);
    const timeBonus = Math.max(0, this.def.par - seconds) * POINTS.timeBonus * (this.happy ? 2 : 1);
    const score = this.score + timeBonus;
    const stars = 1 + (score >= this.def.silver ? 1 : 0) + (this.goldGot >= this.goldTotal && this.goldTotal > 0 ? 1 : 0);
    return { level: this.def.id, score, fish: this.fishGot, fishTotal: this.fishTotal, gold: this.goldGot, goldTotal: this.goldTotal, bonks: this.bonks, splashes: this.splashes, seconds, timeBonus, happy: this.happy, stars };
  }

  /** Run a scene from outside (the playhouse's activities). */
  play(scene: Scene): void { this.director.run(scene); }

  // ---------------------------------------------------------------- scoring

  addPoints(n: number, x: number, y: number, big = false): void {
    const gain = n > 0 && this.happy ? n * 2 : n;
    this.score = Math.max(0, this.score + gain);
    const text = (gain > 0 ? '+' : '') + gain;
    this.parts.text(x, y, text, gain > 0 ? UI.gold : UI.red, big ? 2 : 1, big ? 70 : 50);
  }

  // ---------------------------------------------------------------- update

  private stepLogs(k: number, silent = false): void {
    for (const s of this.spawners) { const log = s.update(k); if (log) this.logs.push(log); }
    for (const log of this.logs) {
      const ev = log.update(this.lv, k, silent ? DUMMY_PARTS : this.parts);
      if (ev === 'drop' && !silent) {
        if (log.rider) { sfx('wheee', 0.8); this.parts.text(log.x + log.w / 2, log.y - 50, 'WHEEE!', UI.gold, 1, 50); }
        if (this.near(log.x)) sfx('splash', 0.5, 1.3);
      }
    }
    this.logs = this.logs.filter((l) => l.alive);
  }

  private near(x: number): boolean { return Math.abs(x - this.player.feetX) < VIEW_W * 0.75; }

  update(): void {
    this.time++;
    const p = this.player;
    const k = p.slowmo > 0 ? 0.45 : 1;
    this.parts.timeScale = k;
    this.director.update();
    if (!this.finished && !this.director.busy) this.frames++;
    if (this.hissCool > 0) this.hissCool--;

    this.stepLogs(k);
    for (const log of this.logs) log.rider = p.body.ride === log;
    p.update(this.lv, this.logs, this.parts);
    this.playerEvents();

    const target = { x: p.feetX, y: p.feetY, quiet: p.def.quiet, hidden: p.shadow > 0 || p.state === 'hidden' || p.state === 'splash' };
    for (const e of this.enemies) e.update(this.lv, target, this.logs, k, this.parts);
    for (const j of this.jets) j.update(k, this.parts, this.near(j.mouthX));
    for (const pr of this.pours) pr.update(k, this.parts, this.near(pr.x));
    for (const g of this.geysers) g.update(k, this.parts, this.near(g.x));
    for (const f of this.fish) f.update(this.lv, this.logs, k);
    for (const c of this.checkpoints) c.update(k);
    if (this.flock) this.flock.update(p.feetX, p.body.y + p.body.h * 0.45, p.facing, p.shield > 0, 1);
    this.hooks.update?.(this);

    if (!this.finished && (p.state === 'play' || p.state === 'attack' || p.state === 'special' || p.state === 'hurt' || p.state === 'trip')) this.interact();

    // camera: lead in the direction the cat is facing; settle on it in cut scenes
    const lead = p.state === 'script' ? 0 : p.facing * 46 + p.body.vx * 8;
    this.cam.centerOn(p.feetX + lead, p.feetY - 46);
    this.cam.update();
    this.parts.update();
    // retire what is finished with
    for (let i = this.fish.length - 1; i >= 0; i--) if (this.fish[i].taken || this.fish[i].life <= 0) this.fish.splice(i, 1);
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].gone) this.enemies.splice(i, 1);
  }

  private playerEvents(): void {
    const p = this.player;
    for (const e of p.events) {
      if (e.kind === 'pound') this.pound(e.x, e.y);
      else if (e.kind === 'trip') { this.parts.text(e.x, e.y - 60, 'OOPS!', UI.pink, 1, 50); this.cam.shake(2, 8); }
      else if (e.kind === 'special') this.specialFx(e.x, e.y);
      else if (e.kind === 'fx' && e.name) this.animFx(e.name, e.x, e.y);
    }
  }

  private specialFx(x: number, y: number): void {
    const p = this.player, kind = p.def.special.kind;
    this.director.shout(p.def.special.name, '', 50, UI.mint);
    if (kind === 'think') this.parts.text(x, y - 40, '!', UI.gold, 3, 60);
    if (kind === 'shield' && this.flock) for (const d of this.flock.dragons) this.parts.burst('spark', d.x, d.y, 3, 1.5);
  }

  private animFx(name: string, x: number, y: number): void {
    const P = this.parts, f = this.player.facing;
    switch (name) {
      case 'crumbs': P.burst('crumb', x, y, 4, 1.6, -Math.PI / 2, Math.PI); break;
      case 'drops': P.burst('drop', x, y, 3, 1.4, -Math.PI / 2, Math.PI * 0.8, { size: 1.5 }); break;
      case 'hearts': P.emit('heart', x + (this.rng.next() - 0.5) * 12, y, { vy: -0.6, size: 4 }); break;
      case 'z': P.emit('z', x, y, { vx: 0.2 * f, vy: -0.35 }); break;
      case 'sparkles': P.burst('spark', x, y, 8, 2); break;
      case 'note': P.emit('note', x, y, { vx: 0.4 * f, vy: -0.6 }); break;
      case 'think': P.text(x, y, '...', UI.paper, 1, 40); break;
      case 'bulb': P.text(x, y, '!', UI.gold, 3, 50); P.burst('spark', x, y + 10, 10, 2.5); break;
      case 'zen': for (let i = 0; i < 3; i++) P.emit('petal', x + (i - 1) * 12, y, { vy: -0.3 }); break;
      case 'rumble': P.text(x, y, 'GRUMBLE', UI.grey, 1, 45); break;
      case 'shake': P.burst('drop', x, y - 24, 6, 3, f > 0 ? Math.PI : 0, Math.PI * 0.7, { size: 1.8 }); P.burst('drop', x, y - 24, 6, 3, f > 0 ? 0 : Math.PI, Math.PI * 0.7, { size: 1.8 }); break;
      case 'dust': P.dust(x, this.player.feetY, 6); break;
      case 'stars': P.burst('star', x, y, 4, 1.5, -Math.PI / 2, Math.PI); break;
    }
  }

  private interact(): void {
    const p = this.player, pb = p.body, lv = this.lv;
    // ---- the water: the one thing that sends you back
    if (inWater(lv, p.feetX, p.centerY + 4) || p.feetY > lv.ph + 30) { this.director.run(this.splashScene()); return; }

    // ---- fish
    const reach = { x: pb.x - 6, y: pb.y - 6, w: pb.w + 12, h: pb.h + 12 };
    for (const f of this.fish) {
      if (f.taken || (f.dropped && f.life > 200)) continue;
      if (!overlaps(reach, f.body)) continue;
      f.taken = true;
      if (f.gold) {
        this.goldGot++;
        this.addPoints(POINTS.goldFish, f.cx, f.cy - 10, true);
        sfx('goldfish');
        this.parts.burst('spark', f.cx, f.cy, 16, 3);
        this.director.shout('GOLDEN FISH!', `${this.goldGot} OF ${this.goldTotal}`, 70);
      } else {
        this.fishGot += f.dropped ? 0 : 1;
        this.addPoints(POINTS.fish + p.def.fishBonus, f.cx, f.cy - 8);
        sfx('fish');
        this.parts.burst('spark', f.cx, f.cy, 5, 1.5);
      }
    }

    // ---- bad guys
    const atk = p.attackBox();
    for (const e of this.enemies) {
      if (!e.dangerous) continue;
      const ec = e.body.x + e.body.w / 2;
      if (atk && overlaps(atk, e.body) && !p.hitThisSwing.has(e)) { p.hitThisSwing.add(e); this.bonk(e, p.def.power); continue; }
      if (!overlaps(pb, e.body)) continue;
      if (p.shield > 0) { this.bonk(e, 1); continue; }
      if (p.shadow > 0 || p.state === 'splash') continue;
      const stomp = pb.vy > 0 && pb.y + pb.h - pb.vy <= e.body.y + 9 && e.stompable;
      if (stomp) { this.bonk(e, p.def.power); p.stompBounce(); continue; }
      if (p.invuln > 0 || p.state === 'hurt') continue;
      if (p.hurt(ec)) this.loseFish();
    }
    // ---- dragon fire
    if (this.flock && this.time % 5 === 0) {
      for (const e of this.enemies) {
        if (!e.dangerous) continue;
        const ex = e.body.x + e.body.w / 2, ey = e.body.y + e.body.h / 2;
        if (Math.abs(ex - p.feetX) > 120 || Math.abs(ey - p.centerY) > 90) continue;
        if (this.flock.breathe(ex, ey, this.parts)) { this.bonk(e, 1); break; }
      }
    }

    // ---- water hazards
    const shielded = p.shield > 0;
    for (const j of this.jets) for (const shot of j.shots) {
      const box = shot.box();
      if (!box || !overlaps(pb, box)) continue;
      shot.burst();
      if (shielded) { this.steam(shot.x, shot.y); this.parts.burst('drop', shot.x, shot.y, 6, 2); continue; }
      if (p.shadow > 0) continue;
      if (p.soak(j.dir, 0, this.parts)) { this.addPoints(POINTS.soaked, p.feetX, pb.y - 10); this.parts.text(p.feetX, pb.y - 26, 'SPLOOSH!', UI.sky, 1, 45); sfx('splash', 0.5, 1.4); }
    }
    for (const pr of this.pours) {
      const box = pr.box();
      if (!box || !overlaps(pb, box)) continue;
      if (shielded) { this.steam(pr.x, pb.y); continue; }
      if (p.soak(p.feetX < pr.x ? -1 : 1, 1, this.parts)) { this.addPoints(POINTS.soaked, p.feetX, pb.y - 10); this.parts.text(p.feetX, pb.y - 26, 'SPLOOSH!', UI.sky, 1, 45); sfx('splash', 0.5, 1.2); }
    }
    for (const g of this.geysers) {
      const box = g.box();
      if (!box || !overlaps(pb, box)) continue;
      if (shielded) { this.steam(g.x, pb.y + pb.h); continue; }
      if (p.invulnerable || p.state === 'hurt') continue;
      p.launch(-9.5, (p.feetX < g.x ? -1 : 1) * 1.5);
      this.addPoints(POINTS.soaked, p.feetX, pb.y - 10);
      this.parts.text(p.feetX, pb.y - 26, 'WHOOSH!', UI.sky, 1, 45);
      sfx('geyser', 0.6);
    }

    // ---- checkpoints and the goal
    for (const c of this.checkpoints) {
      if (c.active || !overlaps(pb, c.box())) continue;
      for (const o of this.checkpoints) if (o.index < c.index) o.active = true;
      c.activate();
      this.respawn = { x: c.x + 20, y: c.y, facing: 1 };
      sfx('checkpoint');
      this.parts.text(c.x, c.y - 70, 'CHECKPOINT!', UI.mint, 1, 60);
      this.parts.burst('spark', c.x, c.y - 50, 10, 2);
    }
    if (this.goal && overlaps(pb, this.goal.box())) this.director.run(this.goalScene());
  }

  private steam(x: number, y: number): void {
    this.parts.emit('steam', x, y, { vx: (this.rng.next() - 0.5) * 1.5, vy: -1 });
    if (this.hissCool <= 0) { sfx('hiss', 0.5); this.hissCool = 20; }
  }

  private bonk(e: Enemy, power: number): void {
    const ex = e.body.x + e.body.w / 2;
    const out = e.bonk(this.player.feetX, power, this.parts);
    this.cam.shake(2, 6);
    this.parts.text(ex, e.body.y - 10, out ? 'BONK!' : 'BOP!', UI.paper, 1, 40);
    if (!out) return;
    this.bonks++;
    this.addPoints(POINTS.bonk, ex, e.body.y - 24);
    if (e.kind === 'raccoon') {
      // he drops the loot: fish everywhere
      for (let i = 0; i < 3; i++) this.fish.push(new Fish(ex, e.body.y + 20, false, true, (i - 1) * 1.8, -4 - i));
    }
  }

  private loseFish(): void {
    const p = this.player;
    this.addPoints(POINTS.hurt, p.feetX, p.body.y - 14);
    for (let i = 0; i < 3; i++) this.fish.push(new Fish(p.feetX, p.body.y + 10, false, true, (i - 1) * 2.2 - p.body.vx * 0.3, -4.5 - i * 0.6));
    this.cam.shake(3, 10);
  }

  private pound(x: number, y: number): void {
    this.cam.shake(7, 20);
    this.parts.dust(x, y, 14);
    this.parts.burst('star', x, y - 6, 6, 3, -Math.PI / 2, Math.PI);
    this.director.flash = 0.25;
    for (const e of this.enemies) {
      if (!e.dangerous) continue;
      const ex = e.body.x + e.body.w / 2, ey = e.body.y + e.body.h;
      if (Math.abs(ex - x) < 120 && Math.abs(ey - y) < 70) this.bonk(e, 2);
    }
    const tx = tileOf(x), ty = tileOf(y + 2);
    let broke = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (breakTile(this.lv, tx + dx, ty + dy)) {
        broke++;
        this.tiles.invalidate(tx + dx, ty + dy);
        const cx = (tx + dx + 0.5) * TILE, cy = (ty + dy + 0.5) * TILE;
        this.parts.burst('crumb', cx, cy, 12, 3, -Math.PI / 2, Math.PI * 1.4, { color: '#b5a491', size: 3 });
        this.parts.dust(cx, cy, 4);
      }
    }
    // a wall of cracked blocks beside him smashes too
    for (const dx of [-1, 1]) for (let dy = -2; dy <= -1; dy++) {
      if (breakTile(this.lv, tx + dx, ty + dy)) { broke++; this.tiles.invalidate(tx + dx, ty + dy); this.parts.dust((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE, 5); }
    }
    if (broke) { sfx('punch', 1, 0.7); this.parts.text(x, y - 70, 'SMASH!', UI.gold, 2, 50); }
  }

  // ---------------------------------------------------------------- draw

  draw(ctx: CanvasRenderingContext2D): void {
    const cam = this.cam, d = this.director, p = this.player;
    ctx.save();
    // a cut scene's close-up scales everything, backdrop included, about the point of interest
    const z = d.zoom;
    if (z !== 1) {
      // The point of interest glides from where it is on screen toward the middle as the zoom grows,
      // so a cat at floor level is not left under the letterbox bar. At z = 1 this is the identity.
      const fx = d.focus.x - cam.x, fy = d.focus.y - cam.y;
      const u = Math.max(0, Math.min(1, (z - 1) / 0.4));
      let ax = fx + (VIEW_W / 2 - fx) * u, ay = fy + (VIEW_H * 0.6 - fy) * u;
      // ...but never so far that the close-up shows past the edge of the level
      if (z > 1) {
        ax = Math.min(ax, (fx + cam.x) * z); ax = Math.max(ax, VIEW_W - (this.lv.pw - cam.x - fx) * z);
        ay = Math.min(ay, (fy + cam.y) * z); ay = Math.max(ay, VIEW_H - (this.lv.ph - cam.y - fy) * z);
      }
      ctx.translate(ax, ay); ctx.scale(z, z); ctx.translate(-fx, -fy);
    }
    this.backdrop.draw(ctx, cam.x, cam.y, this.time);
    ctx.translate(Math.round(-cam.x + cam.shakeX), Math.round(-cam.y + cam.shakeY));
    const view = cam.sceneRect();
    const margin = 80;
    const vx0 = view.x - margin, vx1 = view.x + view.w + margin;
    const vis = (x: number) => x > vx0 && x < vx1;

    for (const dc of this.decor) if (!dc.front && vis(dc.x)) dc.draw(ctx, this.time);
    if (this.goal) this.goal.drawBack(ctx, this.time);
    this.tiles.draw(ctx, view.x, view.y, view.w, view.h);
    this.hooks.drawBack?.(ctx, this);
    for (const c of this.checkpoints) if (vis(c.x)) c.draw(ctx, FLAG[this.cat]);
    for (const log of this.logs) if (vis(log.x) || vis(log.x + log.w)) log.draw(ctx);
    for (const f of this.fish) if (vis(f.cx)) f.draw(ctx);
    for (const e of this.enemies) if (vis(e.body.x)) e.draw(ctx);
    if (this.flock && this.player.shield <= 0) this.flock.draw(ctx);
    p.draw(ctx);
    if (this.flock && this.player.shield > 0) { this.drawShieldRing(ctx); this.flock.draw(ctx); }
    for (const j of this.jets) if (vis(j.mouthX) || j.shots.length) j.draw(ctx, this.time);
    for (const pr of this.pours) if (vis(pr.x)) pr.draw(ctx, this.time);
    // the water goes over everything in it: a cat that falls in is seen to sink
    const x0 = Math.max(0, tileOf(view.x) - 1), x1 = Math.min(this.lv.w - 1, tileOf(view.x + view.w) + 1);
    const y0 = Math.max(0, tileOf(view.y) - 1), y1 = Math.min(this.lv.h - 1, tileOf(view.y + view.h) + 1);
    drawWater(ctx, this.lv, x0, y0, x1, y1, WATER_STYLES[this.def.theme], this.time);
    for (const g of this.geysers) if (vis(g.x)) g.draw(ctx, this.time);
    this.parts.draw(ctx);
    for (const dc of this.decor) if (dc.front && vis(dc.x)) dc.draw(ctx, this.time);
    this.hooks.drawFront?.(ctx, this);
    d.drawWorld(ctx);
    ctx.restore();
    if (this.player.slowmo > 0) {
      ctx.fillStyle = `rgba(120,200,255,${0.1 + Math.sin(this.time * 0.1) * 0.03})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawShieldRing(ctx: CanvasRenderingContext2D): void {
    const p = this.player, cx = p.feetX, cy = p.body.y + p.body.h * 0.45;
    const a = 0.25 + Math.sin(this.time * 0.3) * 0.08;
    ctx.strokeStyle = `rgba(255,214,120,${a})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(cx, cy, 32, 30, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, 32, 30, 0, 0, Math.PI * 2); ctx.stroke();
  }

  /** Where the cat is on screen right now, for the iris to close onto. */
  catOnScreen(): { x: number; y: number } {
    const p = this.player;
    return { x: p.feetX - this.cam.x, y: p.feetY - 30 - this.cam.y };
  }

  /** The station the cat is standing at, if any (the playhouse). */
  nearStation(): Spawn | null {
    const p = this.player;
    let best: Spawn | null = null, bd = 34;
    for (const s of this.stations) { const dd = Math.abs(s.x - p.feetX); if (dd < bd && Math.abs(s.y - p.feetY) < 40) { bd = dd; best = s; } }
    return best;
  }
}

const DUMMY_PARTS = new Particles();

export { CF };
