// The heads-up display while a cat is out on a challenge: its face and score on the left, the golden
// fish in the middle, the special move's charge on the right.
import { VIEW_W, UI } from '../config.ts';
import { drawText, drawTextOutlined, measureText } from '../lib/engine/text.ts';
import { drawCatHead, buildCat, CF, type CatRig } from '../cats/catRig.ts';
import { drawFishIcon } from '../world/pickups.ts';
import { input, buttonName } from '../core/input.ts';
import type { Stage } from '../world/stage.ts';
import type { CatId } from '../core/save.ts';

const portraits = new Map<CatId, CatRig>();
function portrait(id: CatId): CatRig {
  let r = portraits.get(id);
  if (!r) { r = buildCat(id); portraits.set(id, r); }
  return r;
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string = UI.panel, edge: string = UI.ink): void {
  ctx.fillStyle = edge;
  ctx.beginPath(); ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 7); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 4, y + 2, w - 8, 2);
}

export function drawHud(ctx: CanvasRenderingContext2D, stage: Stage): void {
  const p = stage.player;
  // cat badge + score
  panel(ctx, 6, 6, 128, 36);
  ctx.save();
  ctx.beginPath(); ctx.arc(26, 24, 15, 0, Math.PI * 2); ctx.fillStyle = UI.panelHi; ctx.fill();
  ctx.clip();
  const face = p.state === 'hurt' ? CF.hurt : p.wet > 0.5 ? CF.grit : stage.happy ? CF.happy : CF.neutral;
  drawCatHead(ctx, portrait(stage.cat), 26, 27, 1.15, face);
  ctx.restore();
  drawText(ctx, p.def.name, 46, 11, { size: 1, color: UI.cream });
  drawFishIcon(ctx, 54, 30, 0.8, false, stage.time);
  drawText(ctx, String(stage.score), 66, 25, { size: 2, color: UI.gold });

  // golden fish
  if (stage.goldTotal > 0) {
    const w = stage.goldTotal * 22 + 10;
    panel(ctx, VIEW_W / 2 - w / 2, 6, w, 26);
    for (let i = 0; i < stage.goldTotal; i++) {
      const x = VIEW_W / 2 - w / 2 + 16 + i * 22, got = i < stage.goldGot;
      ctx.save();
      if (!got) ctx.globalAlpha = 0.3;
      drawFishIcon(ctx, x, 19, 0.9, true, got ? stage.time : 0);
      ctx.restore();
    }
  }

  // special move charge
  const cd = p.cooldown, max = p.def.special.cooldown, ready = cd === 0;
  const rx = VIEW_W - 30, ry = 26;
  const right = input.touchMode ? VIEW_W - 44 : VIEW_W;
  panel(ctx, right - 132, 6, 126, 36);
  ctx.strokeStyle = UI.panelLo; ctx.lineWidth = 5;
  const cx = right - 24;
  ctx.beginPath(); ctx.arc(cx, ry - 2, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = ready ? UI.gold : UI.grey;
  ctx.beginPath(); ctx.arc(cx, ry - 2, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd / max)); ctx.stroke();
  const pulse = ready ? 1 + Math.sin(stage.time * 0.15) * 0.15 : 1;
  drawText(ctx, '★', cx - 2, ry - 6, { size: Math.round(pulse * 1), color: ready ? UI.gold : UI.dim, shadow: false });
  const name = p.def.special.name;
  drawText(ctx, name, right - 128 + (96 - measureText(name, 1)) / 2, 12, { size: 1, color: ready ? UI.cream : UI.grey });
  drawText(ctx, ready ? `PRESS ${buttonName('special')}` : 'CHARGING', right - 128 + (96 - measureText(ready ? `PRESS ${buttonName('special')}` : 'CHARGING', 1)) / 2, 25, { size: 1, color: ready ? UI.mint : UI.dim });
  void rx;

  if (stage.happy) {
    const t = stage.time;
    drawTextOutlined(ctx, 'x2', 140, 14 + Math.round(Math.sin(t * 0.1) * 1.5), { size: 2, color: UI.pink, thickness: 1 });
  }
  if (p.slowmo > 0) drawTextOutlined(ctx, 'THINKING FAST...', VIEW_W / 2, 40, { size: 1, color: UI.sky, align: 'center' });
}
