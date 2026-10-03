// The on-screen buttons for phones and tablets. They appear once a finger has touched the screen,
// only on screens that ask for them (the levels and the playhouse); menus are tapped directly.
import { TOUCH_BUTTONS, input } from '../core/input.ts';
import { drawText, measureText } from '../lib/engine/text.ts';
import { UI } from '../config.ts';

export function drawTouchControls(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  for (const b of TOUCH_BUTTONS) {
    const down = input.touchDown(b.action);
    ctx.globalAlpha = down ? 0.75 : 0.42;
    ctx.fillStyle = down ? UI.gold : UI.panel;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = down ? 0.95 : 0.7;
    ctx.strokeStyle = UI.paper; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1, 0, Math.PI * 2); ctx.stroke();
    const size = b.label.length > 2 ? 1 : 2;
    const w = measureText(b.label, size);
    drawText(ctx, b.label, Math.round(b.x - w / 2), Math.round(b.y - (7 * size) / 2), { size, color: down ? UI.ink : UI.paper, shadow: false });
  }
  ctx.restore();
}
