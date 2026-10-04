// Tile art. Static tiles are drawn once into 16x16-tile chunk canvases and blitted each frame, so a
// screen of detailed tiles costs a handful of drawImage calls. A chunk is rebuilt when a tile in or
// beside it changes (Crush smashing a cracked block).
//
// Each theme has its own look for the same few collision types: the town's grassy ground and brick,
// the tube maze's padded play-place cushions, the flume's mossy rocks and wooden docks, and the
// playhouse's floorboards and carpeted shelves.
import { TILE } from '../config.ts';
import { C_EMPTY, C_ONEWAY, C_WATER, artAt, colAt, isSolidCode, type Level, type Theme } from './level.ts';
import { shade } from '../lib/art/palettes.ts';

const CHUNK = 16;
const INK = '#1d1526';

type G = CanvasRenderingContext2D;

function rect(g: G, x: number, y: number, w: number, h: number, c: string): void { g.fillStyle = c; g.fillRect(x, y, w, h); }

/** A cheap, stable per-tile hash for texture variation. */
function hash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class TileLayer {
  private chunks = new Map<number, HTMLCanvasElement>();
  constructor(private readonly lv: Level, private readonly theme: Theme) {}

  invalidate(tx: number, ty: number): void {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor((tx + dx) / CHUNK), cy = Math.floor((ty + dy) / CHUNK);
      this.chunks.delete(cy * 10000 + cx);
    }
  }

  /** Draw the chunks overlapping a world-px rectangle. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const size = CHUNK * TILE;
    const cx0 = Math.max(0, Math.floor(x / size)), cy0 = Math.max(0, Math.floor(y / size));
    const cx1 = Math.min(Math.ceil(this.lv.w / CHUNK) - 1, Math.floor((x + w) / size));
    const cy1 = Math.min(Math.ceil(this.lv.h / CHUNK) - 1, Math.floor((y + h) / size));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cy * 10000 + cx;
      let c = this.chunks.get(key);
      if (!c) { c = this.build(cx, cy); this.chunks.set(key, c); }
      ctx.drawImage(c, cx * size, cy * size);
    }
  }

  private build(cx: number, cy: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = CHUNK * TILE; c.height = CHUNK * TILE;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK && ty < this.lv.h; ty++) {
      for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK && tx < this.lv.w; tx++) {
        const code = colAt(this.lv, tx, ty);
        if (code === C_EMPTY || code === C_WATER) continue;
        g.save();
        g.translate((tx - cx * CHUNK) * TILE, (ty - cy * CHUNK) * TILE);
        drawTile(g, this.lv, this.theme, tx, ty, artAt(this.lv, tx, ty), code);
        g.restore();
      }
    }
    return c;
  }
}

function solidish(lv: Level, tx: number, ty: number): boolean { const c = colAt(lv, tx, ty); return isSolidCode(c); }

/** Props sit ON the ground: grass, moss and floorboards carry on under them. */
const PROPS = new Set(['T', 'K', 'k', 'h', 'm', 'O', 'X', '>', '<', 'v']);

function drawTile(g: G, lv: Level, theme: Theme, tx: number, ty: number, ch: string, code: number): void {
  const above = artAt(lv, tx, ty - 1);
  const up = (!solidish(lv, tx, ty - 1) && colAt(lv, tx, ty - 1) !== C_WATER) || (PROPS.has(above) && !PROPS.has(ch));
  const down = !solidish(lv, tx, ty + 1);
  const left = !solidish(lv, tx - 1, ty);
  const right = !solidish(lv, tx + 1, ty);
  const n = hash(tx, ty);
  if (code === C_ONEWAY && ch !== 'k') { platform(g, theme, tx, ty, lv); return; }
  switch (ch) {
    case 'T': trashCan(g); return;
    case 'K': crate(g); return;
    case 'k': bench(g); return;
    case 'h': hydrant(g); return;
    case 'm': mailbox(g); return;
    case 'O': bouncePad(g, theme); return;
    case 'X': cracked(g, theme); return;
    case '>': case '<': case 'v': emitterWall(g, theme, ch); return;
  }
  if (theme === 'town') {
    if (ch === 'B') brick(g, tx, ty, up, left, right, down);
    else ground(g, n, up, left, right, down, '#c98d5a', '#a8703f', '#6cc551', '#4f9e3c');
  } else if (theme === 'tubes') {
    cushion(g, tx, ty, n, up, left, right, down, ch === 'B');
  } else if (theme === 'flume') {
    if (ch === 'B') planks(g, tx, up, left, right);
    else rock(g, n, up, left, right, down);
  } else {
    houseWall(g, tx, ty, up, left, right, down);
  }
}

// ---------------------------------------------------------------- town

function ground(g: G, n: number, up: boolean, left: boolean, right: boolean, down: boolean, dirt: string, dirtDark: string, grass: string, grassDark: string): void {
  rect(g, 0, 0, TILE, TILE, dirt);
  // pebbles and speckles
  rect(g, Math.floor(n * 18) + 2, Math.floor(n * 97) % 16 + 5, 3, 2, dirtDark);
  rect(g, Math.floor(n * 53) % 18 + 3, Math.floor(n * 31) % 10 + 12, 2, 2, dirtDark);
  rect(g, Math.floor(n * 71) % 20 + 2, Math.floor(n * 13) % 8 + 3, 2, 1, shade(dirt, 1.12));
  if (up) {
    rect(g, 0, 0, TILE, 7, grass);
    rect(g, 0, 7, TILE, 2, grassDark);
    for (let i = 0; i < TILE; i += 4) rect(g, i + ((i * 7) % 3), -2 + ((i / 4) % 2), 2, 3, grass);
    rect(g, 0, 1, TILE, 1, shade(grass, 1.15));
    rect(g, 0, -2, TILE, 1, 'rgba(0,0,0,0)');
  }
  if (left) rect(g, 0, up ? 2 : 0, 2, TILE, INK);
  if (right) rect(g, TILE - 2, up ? 2 : 0, 2, TILE, INK);
  if (up) rect(g, 0, -1, TILE, 2, INK);
  if (down) rect(g, 0, TILE - 2, TILE, 2, INK);
}

function brick(g: G, tx: number, ty: number, up: boolean, left: boolean, right: boolean, down: boolean): void {
  const red = '#d9644f', mortar = '#f2cfb0';
  rect(g, 0, 0, TILE, TILE, mortar);
  for (let row = 0; row < 4; row++) {
    const off = (row + ty) % 2 ? 6 : 0;
    for (let bx = -12; bx < TILE; bx += 12) {
      const x = bx + off;
      const c = (Math.floor((x + tx * TILE) / 12) + row + ty) % 3 === 0 ? shade(red, 0.9) : red;
      rect(g, Math.max(0, x), row * 6, Math.min(11, x + 11) - Math.max(0, x), 5, c);
      if (x >= 0) rect(g, x, row * 6, 11, 1, shade(red, 1.12));
    }
  }
  if (up) { rect(g, 0, 0, TILE, 4, '#e8e0d8'); rect(g, 0, 3, TILE, 1, '#b9b0a8'); rect(g, 0, -1, TILE, 2, INK); }
  if (left) rect(g, 0, 0, 2, TILE, INK);
  if (right) rect(g, TILE - 2, 0, 2, TILE, INK);
  if (down) rect(g, 0, TILE - 2, TILE, 2, INK);
}

function platform(g: G, theme: Theme, tx: number, ty: number, lv: Level): void {
  if (theme === 'tubes') {
    // a soft padded ledge with stripes
    rect(g, 0, 0, TILE, 9, INK);
    rect(g, 0, 1, TILE, 7, '#ff9eb5');
    for (let i = 0; i < TILE; i += 8) rect(g, i + 2, 1, 4, 7, '#ffffff');
    rect(g, 0, 1, TILE, 1, '#ffd6e2');
    return;
  }
  if (theme === 'house') {
    // a carpeted shelf of the cat tree
    rect(g, 0, 0, TILE, 9, INK);
    rect(g, 0, 1, TILE, 7, '#d8c3a5');
    for (let i = 0; i < TILE; i += 3) rect(g, i, 1 + (i % 2), 1, 2, '#efe1cc');
    rect(g, 0, 6, TILE, 2, '#b89e7e');
    const under = colAt(lv, tx, ty + 1);
    if (under === C_EMPTY && tx % 3 === 1) { rect(g, 9, 8, 6, TILE - 8, INK); rect(g, 10, 8, 4, TILE - 8, '#c9a676'); }
    return;
  }
  // wooden planks: the town's awnings and the flume's docks
  const wood = theme === 'flume' ? '#b77a43' : '#c48a52';
  rect(g, 0, 0, TILE, 9, INK);
  rect(g, 0, 1, TILE, 7, wood);
  rect(g, 0, 1, TILE, 1, shade(wood, 1.2));
  rect(g, 0, 6, TILE, 2, shade(wood, 0.78));
  rect(g, (tx * 5) % 12 + 3, 3, 1, 1, '#5a3a20');
  rect(g, (tx * 5) % 12 + 15, 3, 1, 1, '#5a3a20');
  rect(g, 11 + (tx % 2), 1, 1, 6, shade(wood, 0.7));
  if (theme === 'flume' && tx % 3 === 0) {
    // posts down into the water
    rect(g, 3, 8, 5, TILE - 8, INK); rect(g, 4, 8, 3, TILE - 8, '#8a5a32');
  }
  if (theme === 'town' && ty % 2 === 0 && tx % 4 === 0) {
    rect(g, 2, 8, 2, 6, INK);
  }
}

function trashCan(g: G): void {
  rect(g, 2, 2, 20, 22, INK);
  rect(g, 4, 6, 16, 17, '#9aa6b8');
  for (let x = 6; x < 20; x += 4) rect(g, x, 7, 1, 15, '#7c889b');
  rect(g, 4, 6, 16, 2, '#c2cad8');
  rect(g, 1, 1, 22, 6, INK);
  rect(g, 2, 2, 20, 4, '#b4bdcc');
  rect(g, 9, 0, 6, 2, INK);
}

function crate(g: G): void {
  rect(g, 0, 0, TILE, TILE, INK);
  rect(g, 1, 1, 22, 22, '#c9934f');
  rect(g, 1, 1, 22, 3, '#e0b070'); rect(g, 1, 20, 22, 3, '#a8763c');
  rect(g, 1, 1, 3, 22, '#a8763c'); rect(g, 20, 1, 3, 22, '#a8763c');
  g.strokeStyle = '#8a5a2a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(4, 4); g.lineTo(20, 20); g.moveTo(20, 4); g.lineTo(4, 20); g.stroke();
}

function bench(g: G): void {
  rect(g, 0, 0, TILE, 8, INK);
  rect(g, 0, 1, TILE, 6, '#8a5a32');
  rect(g, 0, 1, TILE, 2, '#a8763c');
  rect(g, 3, 7, 3, 17, INK); rect(g, 18, 7, 3, 17, INK);
}

function hydrant(g: G): void {
  rect(g, 6, 4, 12, 20, INK);
  rect(g, 7, 6, 10, 18, '#e8413b');
  rect(g, 3, 10, 18, 5, INK); rect(g, 4, 11, 16, 3, '#c9302b');
  rect(g, 7, 1, 10, 6, INK); rect(g, 8, 2, 8, 4, '#e8413b');
  rect(g, 8, 7, 2, 15, '#ff7b6b');
  rect(g, 11, 0, 2, 2, INK);
}

function mailbox(g: G): void {
  rect(g, 10, 12, 4, 12, INK);
  rect(g, 2, 0, 20, 14, INK);
  rect(g, 3, 2, 18, 11, '#3f73d9');
  rect(g, 3, 2, 18, 2, '#6b97ee');
  rect(g, 6, 6, 12, 2, '#25488f');
  rect(g, 17, 0, 2, 6, '#e8413b');
}

function bouncePad(g: G, theme: Theme): void {
  const top = theme === 'house' ? '#9ad0ff' : '#ff6fa3';
  rect(g, 1, 4, 22, 20, INK);
  rect(g, 3, 12, 18, 11, '#5b6576');
  for (let i = 0; i < 3; i++) rect(g, 5 + i * 6, 13, 2, 9, '#c2cad8');
  g.fillStyle = INK; g.beginPath(); g.ellipse(12, 8, 12, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = top; g.beginPath(); g.ellipse(12, 7, 10.5, 4.5, 0, 0, Math.PI * 2); g.fill();
  rect(g, 6, 5, 6, 1, '#ffffff');
}

function cracked(g: G, theme: Theme): void {
  const base = theme === 'tubes' ? '#b9a8d8' : theme === 'flume' ? '#8a95a8' : '#b5a491';
  rect(g, 0, 0, TILE, TILE, INK);
  rect(g, 1, 1, 22, 22, base);
  rect(g, 1, 1, 22, 2, shade(base, 1.2));
  g.strokeStyle = INK; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(4, 3); g.lineTo(10, 10); g.lineTo(7, 15); g.lineTo(13, 21);
  g.moveTo(10, 10); g.lineTo(18, 8); g.lineTo(20, 3); g.moveTo(13, 15); g.lineTo(19, 18); g.stroke();
}

function emitterWall(g: G, theme: Theme, ch: string): void {
  const base = theme === 'tubes' ? '#717c8f' : '#8a95a8';
  rect(g, 0, 0, TILE, TILE, INK);
  rect(g, 1, 1, 22, 22, base);
  rect(g, 1, 1, 22, 2, shade(base, 1.25));
  for (const [x, y] of [[4, 5], [19, 5], [4, 19], [19, 19]]) rect(g, x, y, 2, 2, shade(base, 0.7));
  rect(g, 8, 8, 8, 8, shade(base, 0.85));
  if (ch === 'v') rect(g, 9, 16, 6, 8, '#3a4352');
}

// ---------------------------------------------------------------- tubes

const CUSHIONS = ['#ff7f95', '#5ab8ff', '#ffd24a', '#7ed66b', '#c58bff'];

function cushion(g: G, tx: number, ty: number, n: number, up: boolean, left: boolean, right: boolean, down: boolean, metal: boolean): void {
  if (metal) {
    rect(g, 0, 0, TILE, TILE, '#5d6779');
    rect(g, 0, 0, TILE, 1, '#7d889b');
    rect(g, 3, 3, 2, 2, '#3e4655'); rect(g, 19, 19, 2, 2, '#3e4655');
    if (up) rect(g, 0, -1, TILE, 2, INK);
    if (left) rect(g, 0, 0, 2, TILE, INK);
    if (right) rect(g, TILE - 2, 0, 2, TILE, INK);
    if (down) rect(g, 0, TILE - 2, TILE, 2, INK);
    return;
  }
  const col = CUSHIONS[(Math.floor(tx / 7) + Math.floor(ty / 5) * 2) % CUSHIONS.length];
  const dark = shade(col, 0.78), light = shade(col, 1.18);
  rect(g, 0, 0, TILE, TILE, dark);
  // one padded square per tile: a highlight band top-left, a seam bottom-right, a tuft button
  g.fillStyle = col;
  g.beginPath(); g.roundRect(1, 1, 22, 22, 5); g.fill();
  rect(g, 4, 3, 14, 2, light);
  rect(g, 3, 4, 2, 12, light);
  rect(g, 11, 11, 2, 2, dark);
  rect(g, 10, 10, 1, 1, light);
  if (n > 0.85) { rect(g, 6, 15, 4, 1, dark); }
  if (up) { rect(g, 0, -1, TILE, 2, INK); rect(g, 0, 1, TILE, 2, '#ffffff'); }
  if (left) rect(g, 0, 0, 2, TILE, INK);
  if (right) rect(g, TILE - 2, 0, 2, TILE, INK);
  if (down) rect(g, 0, TILE - 2, TILE, 2, INK);
}

// ---------------------------------------------------------------- flume

function rock(g: G, n: number, up: boolean, left: boolean, right: boolean, down: boolean): void {
  const stone = '#8d99ad', dark = '#6d788c', light = '#adb8ca';
  rect(g, 0, 0, TILE, TILE, stone);
  rect(g, Math.floor(n * 9) + 2, Math.floor(n * 37) % 9 + 9, 9, 6, dark);
  rect(g, Math.floor(n * 9) + 2, Math.floor(n * 37) % 9 + 9, 9, 1, light);
  rect(g, Math.floor(n * 61) % 12 + 8, Math.floor(n * 17) % 6 + 2, 6, 4, light);
  if (up) {
    rect(g, 0, 0, TILE, 5, '#6fbf5a');
    for (let i = 0; i < TILE; i += 5) rect(g, i + 1, 5, 3, 2 + ((i / 5) % 2), '#6fbf5a');
    rect(g, 0, 0, TILE, 1, '#9be07f');
    rect(g, 0, -1, TILE, 2, INK);
  }
  if (left) rect(g, 0, 0, 2, TILE, INK);
  if (right) rect(g, TILE - 2, 0, 2, TILE, INK);
  if (down) rect(g, 0, TILE - 2, TILE, 2, INK);
}

function planks(g: G, tx: number, up: boolean, left: boolean, right: boolean): void {
  const wood = '#b77a43';
  rect(g, 0, 0, TILE, TILE, wood);
  for (let x = 0; x < TILE; x += 8) { rect(g, x, 0, 1, TILE, '#7a4a24'); rect(g, x + 1, 0, 1, TILE, '#d39a5f'); }
  rect(g, 3 + (tx % 2) * 8, 10, 2, 2, '#5a3a20');
  if (up) { rect(g, 0, 0, TILE, 3, '#d39a5f'); rect(g, 0, -1, TILE, 2, INK); }
  if (left) rect(g, 0, 0, 2, TILE, INK);
  if (right) rect(g, TILE - 2, 0, 2, TILE, INK);
}

// ---------------------------------------------------------------- house

function houseWall(g: G, tx: number, ty: number, up: boolean, left: boolean, right: boolean, down: boolean): void {
  if (up) {
    // floorboards
    rect(g, 0, 0, TILE, TILE, '#b57a45');
    rect(g, 0, 0, TILE, 3, '#d9a066');
    for (let y = 6; y < TILE; y += 6) rect(g, 0, y, TILE, 1, '#8f5c30');
    rect(g, (tx * 7) % 20, 8, 1, 4, '#8f5c30');
    rect(g, 0, -1, TILE, 2, INK);
  } else {
    rect(g, 0, 0, TILE, TILE, '#9a6638');
    rect(g, 0, (ty % 2) * 12, TILE, 1, '#7d5230');
  }
  if (left) rect(g, 0, 0, 2, TILE, INK);
  if (right) rect(g, TILE - 2, 0, 2, TILE, INK);
  if (down) rect(g, 0, TILE - 2, TILE, 2, INK);
}
