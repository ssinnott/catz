// The cat you play: movement, jumping, ducking, the paw attack, the special move, and the states
// that take control away for a moment (getting bonked, tripping, soaked by a jet, a cutscene).
//
// It reads actions, never keys (src/core/input.ts), and reports what happened as `events` for the
// stage to act on -- the player does not know what a bad guy or a cracked block is, it only says
// "my paw is live here" or "I just slammed the ground there".
import { PHYS } from '../config.ts';
import { input } from '../core/input.ts';
import { sfx } from '../core/audio.ts';
import { approach } from '../lib/engine/math.ts';
import { drawRig, jointScreen } from '../lib/art/rig.ts';
import { AnimPlayer, type AnimEvent } from '../lib/art/animation.ts';
import { makeRng } from '../lib/engine/rng.ts';
import { buildCat, type CatRig } from '../cats/catRig.ts';
import { animsFor } from '../cats/catAnims.ts';
import { CATS, type CatDef } from '../cats/roster.ts';
import type { CatId } from '../core/save.ts';
import { makeBody, moveX, moveY, carry, fits, floorAt, type Body, type Platform } from './physics.ts';
import { C_ONEWAY, colAt, tileOf, type Level } from './level.ts';
import type { Particles } from '../core/particles.ts';

export type PlayerState = 'play' | 'attack' | 'special' | 'hurt' | 'trip' | 'script' | 'splash' | 'hidden';

export interface PlayerEvent {
  kind: 'hit' | 'pound' | 'land' | 'trip' | 'special' | 'step' | 'fx';
  x: number;
  y: number;
  /** For 'fx': the frame's effect name. */
  name?: string;
}

/** Things hazards and bad guys need to ask of the cat, without reaching into its internals. */
export interface Hittable {
  readonly body: Body;
  readonly invulnerable: boolean;
}

const DUCK_K = 0.56;

export class Player implements Hittable {
  readonly def: CatDef;
  readonly rig: CatRig;
  readonly anim: AnimPlayer;
  readonly body: Body;
  readonly standH: number;
  readonly duckH: number;
  facing: 1 | -1 = 1;
  state: PlayerState = 'play';
  ducking = false;
  private coyote = 0;
  private buffer = 0;
  private airJumps = 0;
  private jumpCut = false;
  private stateT = 0;
  private combo = 0;
  /** Steps the paw stays live after an attack's 'hit' frame. */
  hitActive = 0;
  /** Things this swing already hit, so one swipe bonks a bad guy once. */
  readonly hitThisSwing = new Set<object>();
  cooldown = 0;
  /** Sly: steps of shadow left (nothing can touch him). */
  shadow = 0;
  /** Pendragon: steps of dragon shield left. */
  shield = 0;
  /** Sprout: steps of slow motion left. The stage slows the world while this runs. */
  slowmo = 0;
  /** Steps of the current dash (Sly's shadow step, Biscuit's flying kick). */
  dash = 0;
  pounding = false;
  invuln = 0;
  /** 0..1 wetness, drained by time and by shaking off. */
  wet = 0;
  private runT = 0;
  private idleT = 0;
  private idleTurn = 0;
  /** An animation that locomotion must not interrupt until it finishes (groom, a flip, a shake). */
  private lock: string | null = null;
  private landTimer = 0;
  private stepT = 0;
  readonly events: PlayerEvent[] = [];
  private rng = makeRng(0xca7);
  /** A ghost trail while dashing: recent feet positions. */
  readonly trail: { x: number; y: number; f: number }[] = [];
  /** Scripted walking: where a cutscene wants the cat to go. */
  private scriptTarget: number | null = null;
  private scriptSpeed = 2;

  constructor(id: CatId, x: number, y: number) {
    this.def = CATS[id];
    this.rig = buildCat(id);
    this.anim = new AnimPlayer(animsFor(id));
    this.standH = this.def.hitbox.h;
    this.duckH = Math.round(this.def.hitbox.h * DUCK_K);
    this.body = makeBody(x - this.def.hitbox.w / 2, y - this.standH, this.def.hitbox.w, this.standH);
    this.anim.play('idle');
  }

  get feetX(): number { return this.body.x + this.body.w / 2; }
  get feetY(): number { return this.body.y + this.body.h; }
  get centerY(): number { return this.body.y + this.body.h / 2; }
  get invulnerable(): boolean { return this.invuln > 0 || this.shadow > 0 || this.state === 'splash' || this.state === 'hidden' || this.state === 'script'; }
  get controllable(): boolean { return this.state === 'play' || this.state === 'attack'; }

  /** Put the cat somewhere (respawn, level start), standing, still, dry. */
  placeAt(x: number, y: number, facing: 1 | -1 = 1): void {
    const b = this.body;
    b.h = this.standH; b.w = this.def.hitbox.w;
    b.x = x - b.w / 2; b.y = y - b.h;
    b.vx = 0; b.vy = 0; b.onGround = false; b.ride = null; b.dropThrough = 0;
    this.facing = facing;
    this.ducking = false;
    this.state = 'play';
    this.dash = 0; this.pounding = false; this.hitActive = 0; this.lock = null;
    this.trail.length = 0;
    this.anim.play('idle', { restart: true });
  }

  /** The animation to show, by name, optionally holding off locomotion until it ends. */
  play(name: string, lock = false, speed = 1): void {
    this.anim.play(name, { restart: true, speed });
    this.lock = lock ? name : null;
  }

  /** Cutscene control: take the controls away (or give them back). */
  script(on: boolean): void {
    if (on) { this.state = 'script'; this.scriptTarget = null; this.body.vx = 0; this.ducking = false; this.setHeight(this.standH); }
    else if (this.state === 'script') { this.state = 'play'; this.lock = null; }
  }

  /** Cutscene control: walk (or run) to a world x. */
  walkTo(x: number, speed = 2): void { this.scriptTarget = x; this.scriptSpeed = speed; }
  get arrived(): boolean { return this.scriptTarget === null; }

  private setHeight(h: number): boolean {
    const b = this.body;
    if (b.h === h) return true;
    const feet = b.y + b.h;
    if (h > b.h && this.levelRef && !fits(this.levelRef, b.x, feet - h, b.w, h)) return false;
    b.y = feet - h; b.h = h;
    return true;
  }

  private levelRef: Level | null = null;

  update(lv: Level, platforms: readonly Platform[], parts: Particles): void {
    this.levelRef = lv;
    this.events.length = 0;
    const b = this.body, d = this.def;
    this.stateT++;
    if (this.invuln > 0) this.invuln--;
    if (this.cooldown > 0) this.cooldown--;
    if (this.shadow > 0) this.shadow--;
    if (this.shield > 0) this.shield--;
    if (this.slowmo > 0) this.slowmo--;
    if (this.hitActive > 0) this.hitActive--;
    if (b.dropThrough > 0) b.dropThrough--;
    this.wet = Math.max(0, this.wet - 1 / 420);

    if (this.state === 'hidden' || this.state === 'splash') { this.tickAnim(parts); return; }

    // ride the log we stood on last step
    if (b.ride && b.onGround) carry(lv, b, b.ride);

    const playing = this.state === 'play' || this.state === 'attack';
    const ax = playing ? input.axisX() : 0;
    const down = playing && input.held('down');

    // ---- ducking (only on the ground; stand up only where there is headroom)
    const wantDuck = playing && down && b.onGround && this.dash === 0;
    if (wantDuck && !this.ducking) { this.setHeight(this.duckH); this.ducking = true; }
    else if (!wantDuck && this.ducking) { if (this.setHeight(this.standH)) this.ducking = false; }

    // ---- horizontal intent
    if (this.state === 'script') {
      if (this.scriptTarget !== null) {
        const dx = this.scriptTarget - this.feetX;
        if (Math.abs(dx) < 2) { this.scriptTarget = null; b.vx = 0; }
        else { this.facing = dx > 0 ? 1 : -1; b.vx = approach(b.vx, Math.sign(dx) * this.scriptSpeed, 0.4); }
      } else b.vx = approach(b.vx, 0, 0.4);
    } else if (this.dash > 0) {
      this.dash--;
      b.vx = this.facing * (d.special.kind === 'shadow' ? 7.5 : 6.5);
      b.vy = d.special.kind === 'kick' ? Math.min(b.vy, 0.6) : 0;
      this.trail.push({ x: this.feetX, y: this.feetY, f: this.facing });
      if (this.trail.length > 8) this.trail.shift();
      if (this.dash === 0) { this.state = 'play'; this.hitActive = 0; b.vx *= 0.4; }
    } else if (this.state === 'hurt') {
      b.vx = approach(b.vx, 0, b.onGround ? 0.25 : 0.05);
      if (this.stateT > 26 && b.onGround) this.state = 'play';
    } else if (this.state === 'trip') {
      b.vx = approach(b.vx, 0, 0.12);
      if (this.anim.done) { this.state = 'play'; this.lock = null; }
    } else {
      if (ax) this.facing = ax > 0 ? 1 : -1;
      const top = d.speed * (this.ducking ? 0.38 : 1) * (this.state === 'attack' && b.onGround ? 0.45 : 1);
      const target = ax * top;
      const accel = b.onGround ? d.accel : d.accel * 0.75;
      const friction = b.onGround ? (d.quiet ? 0.5 : 0.32) : 0.06;
      b.vx = approach(b.vx, target, ax ? accel : friction);
      // skid: a hard reversal at speed
      if (b.onGround && ax && Math.sign(b.vx) === -ax && Math.abs(b.vx) > d.speed * 0.7 && !this.lock && !d.quiet) {
        this.play('skid', true);
        parts.dust(this.feetX, this.feetY, 3, ax);
      }
    }
    if (this.trail.length && this.dash === 0 && this.stateT % 2 === 0) this.trail.shift();

    // ---- jumping
    if (playing && input.pressed('jump')) this.buffer = PHYS.buffer;
    if (b.onGround) { this.coyote = PHYS.coyote; this.airJumps = d.airJumps; this.pounding = false; }
    else if (this.coyote > 0) this.coyote--;
    if (this.buffer > 0) {
      this.buffer--;
      const onOneWay = b.onGround && !b.ride && this.standingOnOneWay(lv);
      if (playing && down && onOneWay) {
        b.dropThrough = 14; b.onGround = false; this.buffer = 0; this.coyote = 0;
        if (this.ducking && this.setHeight(this.standH)) this.ducking = false;
      } else if (playing && (b.onGround || this.coyote > 0) && this.state !== 'attack' && this.dash === 0) {
        this.jump(d.jump);
        parts.dust(this.feetX, this.feetY, 4);
      } else if (playing && this.airJumps > 0 && this.dash === 0) {
        this.airJumps--;
        this.jump(d.jump * 0.92);
        this.play('airJump', true);
        parts.burst('spark', this.feetX, this.feetY, 6, 2, Math.PI / 2, Math.PI);
      }
    }
    if (playing && !input.held('jump') && b.vy < 0 && !this.jumpCut && !this.pounding) { b.vy *= PHYS.jumpCut; this.jumpCut = true; }

    // ---- gravity (none while dashing)
    if (this.dash === 0) {
      let g = PHYS.gravity;
      if (d.float && playing && input.held('jump') && b.vy > 0) { g *= 0.35; if (b.vy > 1.7) b.vy = 1.7; }
      b.vy = Math.min(b.vy + g, this.pounding ? 13 : PHYS.maxFall);
    }

    // ---- attack and special
    if (playing && this.state === 'play' && this.dash === 0 && input.pressed('action')) this.attack();
    if (playing && this.dash === 0 && input.pressed('special') && this.cooldown === 0) this.special(parts);

    // ---- move
    const wasAir = !b.onGround, fallSpeed = b.vy;
    moveX(lv, b, b.vx);
    if (b.wall && this.dash > 0) { this.dash = 1; }
    moveY(lv, b, b.vy, platforms);
    if (b.landed && wasAir) this.onLand(fallSpeed, parts);
    if (b.bounced) {
      b.vy = -PHYS.bounce; b.onGround = false; this.jumpCut = true;
      sfx('spring', 0.8); parts.burst('spark', this.feetX, this.feetY, 8, 2.5, -Math.PI / 2, Math.PI);
      this.play('jump', false);
    }

    // ---- Truffle trips when she runs flat out for too long (never toward a drop)
    if (d.trips && this.state === 'play' && b.onGround && Math.abs(b.vx) > d.speed * 0.92) {
      this.runT++;
      if (this.runT > 150 && this.rng.chance(1 / 80) && this.safeAhead(lv)) this.trip(parts);
    } else if (!b.onGround || Math.abs(b.vx) < d.speed * 0.5) this.runT = Math.max(0, this.runT - 2);

    this.chooseAnim();
    this.tickAnim(parts);

    // footsteps
    if (b.onGround && Math.abs(b.vx) > 0.6 && this.state !== 'script') {
      this.stepT += Math.abs(b.vx);
      if (this.stepT > 26) { this.stepT = 0; if (!d.quiet) sfx('step', 0.6); if (Math.abs(b.vx) > d.speed * 0.8 && this.rng.chance(0.5)) parts.dust(this.feetX - this.facing * 4, this.feetY, 1, this.facing); }
    }
  }

  private standingOnOneWay(lv: Level): boolean {
    const b = this.body, r = tileOf(b.y + b.h + 1);
    let any = false;
    for (let c = tileOf(b.x + 0.5); c <= tileOf(b.x + b.w - 0.5); c++) {
      const code = colAt(lv, c, r);
      if (code !== C_ONEWAY && code !== 0) return false;
      if (code === C_ONEWAY) any = true;
    }
    return any;
  }

  private safeAhead(lv: Level): boolean {
    for (let i = 1; i <= 4; i++) if (!floorAt(lv, this.feetX + this.facing * i * 18, this.feetY + 2)) return false;
    return true;
  }

  private jump(v: number): void {
    const b = this.body;
    b.vy = -v; b.onGround = false; this.coyote = 0; this.buffer = 0; this.jumpCut = false;
    if (this.ducking && this.setHeight(this.standH)) this.ducking = false;
    sfx('jump', 0.7, 1.15 - this.rig.scale * 0.15);
    if (!this.lock) this.anim.play('jump', { restart: true });
  }

  private onLand(fallSpeed: number, parts: Particles): void {
    this.events.push({ kind: 'land', x: this.feetX, y: this.feetY });
    if (this.pounding) {
      this.pounding = false;
      this.events.push({ kind: 'pound', x: this.feetX, y: this.feetY });
      this.play('pound', true);
      this.state = 'play';
      return;
    }
    if (fallSpeed > 3.5) {
      sfx('land', Math.min(1, fallSpeed / 8));
      parts.dust(this.feetX, this.feetY, Math.round(Math.min(8, fallSpeed)));
      if (!this.lock || this.lock === 'airJump' || this.lock === 'special') { this.play('land', true); this.landTimer = 8; }
    }
  }

  attack(): void {
    this.state = 'attack';
    this.stateT = 0;
    this.combo = 1 - this.combo;
    this.hitThisSwing.clear();
    this.play(this.combo ? 'attack' : 'attack2', true);
  }

  special(parts: Particles): void {
    const d = this.def, b = this.body;
    this.cooldown = d.special.cooldown;
    this.events.push({ kind: 'special', x: this.feetX, y: this.centerY });
    switch (d.special.kind) {
      case 'pound':
        this.state = 'special'; this.stateT = 0;
        this.pounding = true;
        if (b.onGround) { b.vy = -6.5; b.onGround = false; } else b.vy = Math.max(b.vy, 4);
        this.play('special', true);
        sfx('whoosh');
        break;
      case 'think':
        this.slowmo = 300;
        if (b.onGround) this.play('special', true);
        sfx('slowmo');
        parts.burst('spark', this.feetX, this.body.y - 10, 10, 2.2);
        break;
      case 'shadow':
        this.state = 'special'; this.stateT = 0;
        this.dash = 22; this.shadow = 140;
        this.play('special', true);
        sfx('shadow');
        break;
      case 'kick':
        this.state = 'special'; this.stateT = 0;
        this.dash = 24; this.hitActive = 24;
        this.hitThisSwing.clear();
        this.play('special', true);
        sfx('hiya');
        break;
      case 'spring':
        b.vy = -13.6; b.onGround = false; this.jumpCut = true; this.coyote = 0;
        if (this.ducking && this.setHeight(this.standH)) this.ducking = false;
        this.play('special', true);
        sfx('spring');
        parts.burst('spark', this.feetX, this.feetY, 12, 3, -Math.PI / 2, Math.PI);
        parts.dust(this.feetX, this.feetY, 6);
        break;
      case 'shield':
        this.shield = 300;
        this.play('special', true);
        sfx('shield');
        break;
    }
  }

  /** A bad guy got the cat. Returns false if the hit did not land (invulnerable). */
  hurt(fromX: number): boolean {
    if (this.invulnerable || this.state === 'hurt') return false;
    const b = this.body;
    this.state = 'hurt'; this.stateT = 0;
    this.dash = 0; this.pounding = false; this.hitActive = 0;
    if (this.ducking && this.setHeight(this.standH)) this.ducking = false;
    const away = this.feetX < fromX ? -1 : 1;
    b.vx = away * 3.2; b.vy = -4.2; b.onGround = false;
    this.invuln = 100;
    this.play('hurt', true);
    sfx('hurt', 1, this.def.pitch);
    return true;
  }

  /** Hit by a water jet or pour: pushed along `dir`, soaked. Returns false if it did not land. */
  soak(dirX: number, dirY: number, parts: Particles): boolean {
    if (this.invulnerable || this.shield > 0 || this.state === 'hurt') return false;
    const b = this.body, k = this.def.pushback;
    this.wet = 1;
    this.invuln = 50;
    parts.splash(this.feetX, this.body.y + this.body.h * 0.4, 0.6);
    if (k < 0.5) {
      // Crush just stands there, dripping
      b.vx = dirX * 1.2;
      this.play('shake', true);
      return true;
    }
    this.state = 'hurt'; this.stateT = 0;
    this.dash = 0; this.hitActive = 0;
    if (this.ducking && this.setHeight(this.standH)) this.ducking = false;
    b.vx = dirX * 5.5 * k; b.vy = dirY ? dirY * 3 : -3.2; b.onGround = false;
    this.play('hurt', true);
    sfx('hurt', 0.9, this.def.pitch);
    return true;
  }

  /** Thrown into the air by a geyser. */
  launch(vy: number, vx: number): void {
    const b = this.body;
    this.state = 'hurt'; this.stateT = 0; this.dash = 0;
    b.vy = vy; b.vx = vx; b.onGround = false;
    this.wet = 1;
    this.play('flail', false);
  }

  trip(parts: Particles): void {
    this.state = 'trip'; this.stateT = 0; this.runT = 0;
    if (this.ducking && this.setHeight(this.standH)) this.ducking = false;
    this.body.vx = this.facing * this.def.speed * 1.1;
    this.play('trip', true);
    this.events.push({ kind: 'trip', x: this.feetX, y: this.feetY });
    parts.dust(this.feetX, this.feetY, 5, -this.facing);
  }

  /** Bounce off a bad guy's head. */
  stompBounce(): void {
    const b = this.body;
    b.vy = input.held('jump') ? -PHYS.stompBounce * 1.25 : -PHYS.stompBounce;
    this.jumpCut = !input.held('jump');
    this.airJumps = this.def.airJumps;
    this.pounding = false;
    if (this.state === 'special' && this.dash === 0) this.state = 'play';
    this.play('jump', false);
  }

  private chooseAnim(): void {
    const b = this.body, a = this.anim;
    if (this.state === 'script' || this.state === 'splash' || this.state === 'hidden') {
      if (this.state === 'script' && this.scriptTarget !== null && !this.lock) a.play(Math.abs(b.vx) > 2.4 ? 'run' : 'walk');
      else if (this.state === 'script' && !this.lock && a.name !== null && (a.name === 'walk' || a.name === 'run')) a.play('idle');
      return;
    }
    if (this.landTimer > 0) this.landTimer--;
    if (this.lock) {
      if (!a.done && a.name === this.lock) return;
      this.lock = null;
      if (this.state === 'attack') { this.state = 'play'; }
      if (this.state === 'special' && this.dash === 0 && !this.pounding) this.state = 'play';
    }
    if (this.state !== 'play') return;
    const moving = Math.abs(b.vx) > 0.25;
    if (!b.onGround) {
      this.idleT = 0;
      a.play(b.vy < 0 ? 'jump' : 'fall');
      return;
    }
    if (this.ducking) { this.idleT = 0; a.play(moving ? 'crawl' : 'duck', { speed: moving ? 1 : 1 }); return; }
    if (moving) {
      this.idleT = 0;
      const fast = Math.abs(b.vx) > this.def.speed * 0.62;
      a.play(fast ? 'run' : 'walk');
      a.speed = fast ? 0.7 + Math.abs(b.vx) / this.def.speed * 0.5 : 0.7 + Math.abs(b.vx) * 0.25;
      return;
    }
    this.idleT++;
    if (this.idleT > 420) {
      this.idleT = 0;
      this.idleTurn++;
      this.play(this.idleTurn % 2 ? 'groom' : 'quirk', true);
      return;
    }
    a.play('idle');
  }

  private tickAnim(parts: Particles): void {
    this.anim.tick();
    const evs: AnimEvent[] = this.anim.events;
    for (const e of evs) {
      if (e.type === 'sfx') sfx(e.name, 0.9, e.name === 'meow' || e.name === 'mew' || e.name === 'hurt' ? this.def.pitch : 1);
      else if (e.type === 'event' && e.name === 'hit') { this.hitActive = 7; this.events.push({ kind: 'hit', x: this.feetX, y: this.centerY }); }
      else if (e.type === 'fx') {
        // a frame's effect, placed relative to the feet in the rig's own px (so it follows facing and size)
        const v = e.value as { x?: number; y?: number };
        const sc = this.rig.scale;
        this.events.push({ kind: 'fx', x: this.feetX + (v.x || 0) * sc * this.facing, y: this.feetY + (v.y || 0) * sc, name: e.name });
      }
    }
    evs.length = 0;
    void parts;
  }

  /** The paw's reach, while an attack is live: a box in front of the cat. */
  attackBox(): { x: number; y: number; w: number; h: number } | null {
    if (this.hitActive <= 0) return null;
    const b = this.body, r = this.def.reach;
    const w = r + 6;
    return { x: this.facing > 0 ? b.x + b.w - 4 : b.x - w + 4, y: b.y - 4, w, h: b.h + 6 };
  }

  /** Mood for the art: tail up when happy and running, down when wet or hurt. */
  private mood(): void {
    const r = this.rig;
    r.wet = this.wet;
    const target = this.state === 'hurt' ? -0.8 : this.ducking ? -0.3 : this.body.onGround && Math.abs(this.body.vx) > 1.5 ? 0.15 : 0.45;
    r.tailLift += (target - r.tailLift) * 0.1;
  }

  draw(ctx: CanvasRenderingContext2D, alpha = 1): void {
    if (this.state === 'hidden') return;
    this.mood();
    const b = this.body;
    const blink = this.invuln > 0 && this.state !== 'splash' && this.state !== 'script' && Math.floor(this.invuln / 4) % 2 === 0;
    // ghost trail while dashing
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      drawRig(ctx, this.rig, this.anim.pose, { x: t.x, y: t.y, facing: t.f, alpha: 0.12 + i * 0.04, tint: this.def.special.kind === 'shadow' ? '#2a1d4a' : '#ffd36a', tintAlpha: 0.7, still: true });
    }
    const shadowed = this.shadow > 0;
    drawRig(ctx, this.rig, this.anim.pose, {
      x: b.x + b.w / 2, y: b.y + b.h, facing: this.facing,
      alpha: alpha * (blink ? 0.35 : 1) * (shadowed ? 0.45 : 1),
      tint: shadowed ? '#1b1230' : null, tintAlpha: 0.55,
    });
  }

  /** Screen-independent anchor for speech bubbles: just above the ears. */
  headTop(): { x: number; y: number } {
    const p = jointScreen(this.rig, 'head');
    return { x: p.x, y: p.y - this.rig.p.headR * this.rig.scale * 1.9 };
  }

}
