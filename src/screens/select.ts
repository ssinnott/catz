import type { Screen } from '../core/screens.ts';
export class SelectScreen implements Screen {
  readonly name = 'select';
  constructor(..._args: unknown[]) {}
  update(): void {}
  draw(ctx: CanvasRenderingContext2D): void { ctx.fillStyle = '#334'; ctx.fillRect(0, 0, 640, 360); }
}
