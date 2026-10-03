import type { Screen } from '../core/screens.ts';
export class TitleScreen implements Screen {
  readonly name = 'title';
  constructor(..._args: unknown[]) {}
  update(): void {}
  draw(ctx: CanvasRenderingContext2D): void { ctx.fillStyle = '#334'; ctx.fillRect(0, 0, 640, 360); }
}
