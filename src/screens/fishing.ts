import type { Screen } from '../core/screens.ts';
export class FishingScreen implements Screen {
  readonly name = 'fishing';
  constructor(..._args: unknown[]) {}
  update(): void {}
  draw(ctx: CanvasRenderingContext2D): void { ctx.fillStyle = '#334'; ctx.fillRect(0, 0, 640, 360); }
}
