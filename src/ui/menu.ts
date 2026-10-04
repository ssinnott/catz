// A vertical list of choices: up/down (or a tap) moves, confirm picks. Used by the pause menu,
// the results screen and the title.
import { UI } from '../config.ts';
import { drawText, measureText } from '../lib/engine/text.ts';
import { input, type Tap } from '../core/input.ts';
import { sfx } from '../core/audio.ts';
import { panel } from './hud.ts';

export interface MenuItem {
  label: string | (() => string);
  pick: () => void;
}

export class Menu {
  index = 0;
  private t = 0;
  constructor(public items: MenuItem[], readonly x: number, readonly y: number, readonly w = 200, readonly rowH = 26) {}

  label(i: number): string { const l = this.items[i].label; return typeof l === 'function' ? l() : l; }

  /** Read input; returns true if an item was picked this step. */
  update(taps: Tap[] = input.takeTaps()): boolean {
    this.t++;
    if (input.pressed('up')) { this.index = (this.index + this.items.length - 1) % this.items.length; sfx('tick'); }
    if (input.pressed('down')) { this.index = (this.index + 1) % this.items.length; sfx('tick'); }
    for (const t of taps) {
      for (let i = 0; i < this.items.length; i++) {
        const iy = this.y + i * this.rowH;
        if (t.x >= this.x - this.w / 2 && t.x <= this.x + this.w / 2 && t.y >= iy - 4 && t.y <= iy + this.rowH - 6) {
          this.index = i; sfx('select'); this.items[i].pick(); return true;
        }
      }
    }
    if (input.pressed('confirm')) { sfx('select'); this.items[this.index].pick(); return true; }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.items.length; i++) {
      const on = i === this.index, iy = this.y + i * this.rowH;
      panel(ctx, this.x - this.w / 2, iy - 4, this.w, this.rowH - 6, on ? UI.panelHi : UI.panel);
      const label = this.label(i);
      const size = 1;
      const tx = this.x - measureText(label, size) / 2;
      drawText(ctx, label, Math.round(tx), iy + 3, { size, color: on ? UI.gold : UI.cream });
      if (on) {
        const bob = Math.round(Math.sin(this.t * 0.2) * 2);
        drawText(ctx, '▶', this.x - this.w / 2 + 8 + bob, iy + 3, { size: 1, color: UI.gold });
      }
    }
  }
}
