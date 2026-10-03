// A challenge in progress: the stage, the HUD over it, and the pause menu on ESC / START / II.
import { VIEW_W, VIEW_H, UI } from '../config.ts';
import { input } from '../core/input.ts';
import { audio, sfx } from '../core/audio.ts';
import { screens, type Screen } from '../core/screens.ts';
import { drawTextOutlined } from '../lib/engine/text.ts';
import { save, type CatId } from '../core/save.ts';
import { Stage, type StageResult } from '../world/stage.ts';
import type { LevelDef } from '../world/level.ts';
import { drawHud } from '../ui/hud.ts';
import { Menu } from '../ui/menu.ts';
import { nav } from './nav.ts';

export class PlayScreen implements Screen {
  readonly name = 'play';
  readonly touchControls = true;
  readonly music: string;
  readonly stage: Stage;

  constructor(readonly level: LevelDef, readonly cat: CatId) {
    this.music = level.music;
    this.stage = new Stage(level, cat, { hooks: { onFinish: (r) => this.finish(r) } });
  }

  private finish(r: StageResult): void {
    // a challenge works up an appetite (and wears a cat out): one of each need used up
    save.addNeed(this.cat, 'food', -1);
    save.addNeed(this.cat, 'drink', -1);
    save.addNeed(this.cat, 'play', -1);
    screens.go(nav.results(this.level, this.cat, r), { at: this.stage.catOnScreen() });
  }

  update(): void {
    if (input.pressed('pause') && !this.stage.director.busy && !this.stage.finished) {
      sfx('pop');
      screens.push(new PauseScreen(this));
      return;
    }
    this.stage.update();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.stage.draw(ctx);
    // the HUD steps aside for cut scenes
    const lb = this.stage.director.letterbox;
    if (lb < 0.95) {
      ctx.save();
      ctx.globalAlpha = 1 - lb;
      drawHud(ctx, this.stage);
      ctx.restore();
    }
    this.stage.director.drawScreen(ctx);
  }

  /** Back to the last bell, no penalty: for when you are stuck. */
  restartFromBell(): void {
    const s = this.stage, r = s.respawn;
    s.player.placeAt(r.x, r.y, r.facing);
    s.flock?.gather(r.x, r.y);
    s.cam.snapTo(r.x + 40, r.y - 50);
  }

  /** Test hooks: `warp:x,y` (tiles), `goal` (just short of the goal), `skip` (end the intro). */
  cheat(cmd: string): void {
    const s = this.stage, p = s.player;
    const [k, v] = cmd.split(':');
    if (k === 'skip') { s.director.cancel(); p.script(false); }
    if (k === 'warp') { const [x, y] = v.split(',').map(Number); p.placeAt((x + 0.5) * 24, (y + 1) * 24, 1); s.cam.snapTo(p.feetX, p.feetY); }
    if (k === 'goal') {
      const g = s.lv.spawns.find((sp) => sp.kind === 'goal');
      if (g) { p.placeAt(g.x - 60, g.y, 1); s.cam.snapTo(p.feetX, p.feetY); }
    }
  }

  peek(): Record<string, unknown> {
    const s = this.stage, p = s.player;
    return {
      level: this.level.id, cat: this.cat, score: s.score, x: Math.round(p.feetX), y: Math.round(p.feetY), state: p.state,
      onGround: p.body.onGround, fish: s.fishGot, gold: s.goldGot, splashes: s.splashes, bonks: s.bonks,
      enemies: s.enemies.length, busy: s.director.busy, finished: s.finished, wet: p.wet, anim: p.anim.name,
    };
  }
}

class PauseScreen implements Screen {
  readonly name = 'pause';
  readonly overlay = true;
  private menu: Menu;
  constructor(private readonly game: PlayScreen) {
    this.menu = new Menu([
      { label: 'KEEP PLAYING', pick: () => screens.pop() },
      { label: 'BACK TO LAST BELL', pick: () => { screens.pop(); this.game.restartFromBell(); } },
      { label: () => (audio.muted ? 'SOUND: OFF' : 'SOUND: ON'), pick: () => { audio.toggleMute(); } },
      { label: 'QUIT TO MAP', pick: () => { screens.go(nav.map(game.cat)); } },
    ], VIEW_W / 2, 150, 220);
  }
  update(): void {
    if (input.pressed('back') || input.pressed('pause')) { sfx('back'); screens.pop(); return; }
    this.menu.update();
  }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(29,21,38,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextOutlined(ctx, 'PAUSED', VIEW_W / 2, 90, { size: 4, color: UI.gold, align: 'center', thickness: 2 });
    this.menu.draw(ctx);
  }
}
