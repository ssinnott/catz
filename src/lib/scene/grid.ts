// Tile grids and the four algorithms a 2D game always ends up needing on one: a line, a flood, a
// path, and a distance.
//
// This is the data half of the 2D layer; src/scene/projection.ts is the view half. Nothing here
// knows how a tile is drawn, how big it is in pixels or which way the camera is facing -- a grid is
// `w * h` cells and a few pure functions over them, so the same code serves a flat top-down dungeon
// and an isometric one.
//
// DETERMINISM: `line`, `flood` and `findPath` are integer/IEEE arithmetic with a total order on
// every tie, so two peers running the same lockstep frame produce the same path. That is not a
// theoretical property -- a monster that steps left on one machine and right on the other is a
// desynced match, which is why `findPath` breaks ties down to the cell index rather than leaving
// them to the heap's internal order.

/** The backing store of a grid: a `T[]`, or a typed array when `T` is `number`. */
export interface GridCells<T> {
  readonly length: number;
  [index: number]: T;
}

/** A dense `w * h` grid of cells in row-major order. */
export interface Grid<T = number> {
  readonly w: number;
  readonly h: number;
  readonly cells: GridCells<T>;
}

/** A width and a height; everything that only needs the bounds takes this. */
export interface GridBounds {
  readonly w: number;
  readonly h: number;
}

/** An (x, y) tile. Structurally the same as projection.ts's `TileCoord`. */
export interface Tile {
  x: number;
  y: number;
}

/** The four orthogonal steps, in the order N, E, S, W. */
export const DIR4: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** The eight steps: the four of `DIR4` first, then the diagonals NE, SE, SW, NW. */
export const DIR8: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

/** A grid of `T`, every cell `fill`. */
export function createGrid<T>(w: number, h: number, fill: T): Grid<T> {
  return { w, h, cells: new Array<T>(w * h).fill(fill) };
}

/** A grid of small unsigned integers (tile ids, flags) over a `Uint8Array`: 1 byte a cell, not 8. */
export function createByteGrid(w: number, h: number, fill: number = 0): Grid<number> {
  const cells = new Uint8Array(w * h);
  if (fill) cells.fill(fill);
  return { w, h, cells };
}

/** Row-major index of (x, y). Only meaningful when `inGrid` is true. */
export function gridIndex(g: GridBounds, x: number, y: number): number { return y * g.w + x; }

/** Is (x, y) inside the grid? */
export function inGrid(g: GridBounds, x: number, y: number): boolean { return x >= 0 && y >= 0 && x < g.w && y < g.h; }

/**
 * The cell at (x, y), or `outside` when it is off the grid. The out-of-bounds value is required
 * rather than defaulted: a level's edge behaviour ("everything past the wall is solid rock") is a
 * decision the caller has to make, and a silent `undefined` turns it into a crash three frames later.
 */
export function gridGet<T>(g: Grid<T>, x: number, y: number, outside: T): T {
  return x >= 0 && y >= 0 && x < g.w && y < g.h ? g.cells[y * g.w + x] : outside;
}

/** Write (x, y) if it is on the grid. Returns whether it was. */
export function gridSet<T>(g: Grid<T>, x: number, y: number, v: T): boolean {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
  g.cells[y * g.w + x] = v;
  return true;
}

/** Set every cell of the rectangle (clipped to the grid) to `v`. */
export function gridFill<T>(g: Grid<T>, x0: number, y0: number, x1: number, y1: number, v: T): void {
  const ax = Math.max(0, Math.min(x0, x1)), ay = Math.max(0, Math.min(y0, y1));
  const bx = Math.min(g.w - 1, Math.max(x0, x1)), by = Math.min(g.h - 1, Math.max(y0, y1));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) g.cells[y * g.w + x] = v;
}

/** Steps between two tiles moving orthogonally only. */
export function manhattan(x0: number, y0: number, x1: number, y1: number): number {
  return Math.abs(x1 - x0) + Math.abs(y1 - y0);
}
/** Steps between two tiles when a diagonal costs the same as an orthogonal (roguelike distance). */
export function chebyshev(x0: number, y0: number, x1: number, y1: number): number {
  return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
}
/** Distance when a diagonal costs sqrt(2): the admissible heuristic for 8-way movement. */
export function octile(x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Walk the Bresenham line from (x0, y0) to (x1, y1), calling `visit` on every tile including both
 * ends. Return `false` from `visit` to stop early; `line` then returns false, which is what makes
 * this a line-of-sight test as well as a bolt path.
 * @returns true if the walk reached (x1, y1).
 */
export function line(x0: number, y0: number, x1: number, y1: number, visit: (x: number, y: number) => boolean | void): boolean {
  let x = Math.round(x0), y = Math.round(y0);
  const ex = Math.round(x1), ey = Math.round(y1);
  const dx = Math.abs(ex - x), dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (visit(x, y) === false) return false;
    if (x === ex && y === ey) return true;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** The tiles of the Bresenham line, both ends included. */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): Tile[] {
  const out: Tile[] = [];
  line(x0, y0, x1, y1, (x, y) => { out.push({ x, y }); });
  return out;
}

/**
 * Is the straight line from (x0, y0) to (x1, y1) clear? Both endpoints are exempt, so a monster can
 * see out of the doorway it is standing in and a bolt can hit the wall it stops at.
 */
export function lineOfSight(x0: number, y0: number, x1: number, y1: number, blocks: (x: number, y: number) => boolean): boolean {
  const ex = Math.round(x1), ey = Math.round(y1);
  const sx = Math.round(x0), sy = Math.round(y0);
  return line(sx, sy, ex, ey, (x, y) => (x === sx && y === sy) || (x === ex && y === ey) || !blocks(x, y));
}

/**
 * Four-way flood from (x, y) over tiles `passable` accepts, calling `visit` once per reached tile
 * (the start included, and only if it is itself passable). Iterative, so a 132x66 level cannot blow
 * the stack. Return `false` from `visit` to stop the whole flood.
 * @returns how many tiles were reached.
 */
export function flood(g: GridBounds, x: number, y: number, passable: (x: number, y: number) => boolean, visit: (x: number, y: number) => boolean | void): number {
  if (!inGrid(g, x, y) || !passable(x, y)) return 0;
  const seen = new Uint8Array(g.w * g.h);
  const stack: number[] = [y * g.w + x];
  seen[y * g.w + x] = 1;
  let n = 0;
  while (stack.length) {
    const i = stack.pop() as number;
    const cx = i % g.w, cy = (i - cx) / g.w;
    n++;
    if (visit(cx, cy) === false) return n;
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      if (seen[j] || !passable(nx, ny)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return n;
}

/** What `findPath` is allowed to walk on, and how. */
export interface PathOptions {
  /** May a mover enter (x, y)? Called for candidate tiles only, never for the start. */
  passable(x: number, y: number): boolean;
  /**
   * Cost of stepping into (x, y) from (fromX, fromY). Defaults to 1, or sqrt(2) for a diagonal.
   *
   * A custom cost must never undercut those defaults -- at least 1 for an orthogonal step, and at
   * least sqrt(2) for a diagonal one when `diagonals` is on. Cheaper than that and the heuristic
   * starts overestimating, which costs you the guarantee that the path returned is the shortest;
   * it will still be a valid path, which is exactly why the mistake survives being looked at.
   */
  cost?(x: number, y: number, fromX: number, fromY: number): number;
  /** Allow the four diagonal steps. Default false. */
  diagonals?: boolean;
  /** With `diagonals`, allow squeezing past a corner between two blocked orthogonals. Default false. */
  cutCorners?: boolean;
  /** Stop on any tile adjacent to the goal -- for chasing something that is standing on a blocked tile. */
  stopAdjacent?: boolean;
  /** Give up after expanding this many tiles. Defaults to the whole grid. */
  maxNodes?: number;
}

/**
 * A* from `from` to `to`, returning the tiles walked THROUGH, start and goal included, or null if
 * there is no route (or `maxNodes` ran out). A path of length 1 means you are already there.
 *
 * Determinism: the open set is ordered by (f, then h, then cell index), which is a total order --
 * no two candidates can compare equal, so the tile popped next is fixed by the inputs alone and
 * never by the heap's internal arrangement. Two peers in lockstep therefore walk the same route.
 */
export function findPath(g: GridBounds, from: Tile, to: Tile, opts: PathOptions): Tile[] | null {
  const w = g.w, h = g.h, size = w * h;
  const sx = Math.round(from.x), sy = Math.round(from.y);
  const gx = Math.round(to.x), gy = Math.round(to.y);
  if (!inGrid(g, sx, sy) || !inGrid(g, gx, gy)) return null;
  const diagonals = opts.diagonals === true;
  const cutCorners = opts.cutCorners === true;
  const stopAdjacent = opts.stopAdjacent === true;
  const maxNodes = opts.maxNodes === undefined ? size : opts.maxNodes;
  const dirs = diagonals ? DIR8 : DIR4;
  const heuristic = diagonals ? octile : manhattan;
  const reached = (x: number, y: number): boolean =>
    (x === gx && y === gy) || (stopAdjacent && Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1 && (diagonals || x === gx || y === gy));

  if (reached(sx, sy)) return [{ x: sx, y: sy }];

  const gScore = new Float64Array(size).fill(Infinity);
  const hScore = new Float64Array(size);
  const fScore = new Float64Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const start = sy * w + sx;
  gScore[start] = 0;
  hScore[start] = heuristic(sx, sy, gx, gy);
  fScore[start] = hScore[start];

  // Binary min-heap of cell indices. `better` is the total order that makes the pop deterministic.
  const heap: number[] = [start];
  const better = (a: number, b: number): boolean =>
    fScore[a] !== fScore[b] ? fScore[a] < fScore[b] : hScore[a] !== hScore[b] ? hScore[a] < hScore[b] : a < b;
  const push = (i: number): void => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const parent = (c - 1) >> 1;
      if (!better(heap[c], heap[parent])) break;
      const t = heap[parent]; heap[parent] = heap[c]; heap[c] = t;
      c = parent;
    }
  };
  const pop = (): number => {
    const top = heap[0], last = heap.pop() as number;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < heap.length && better(heap[l], heap[m])) m = l;
        if (r < heap.length && better(heap[r], heap[m])) m = r;
        if (m === c) break;
        const t = heap[m]; heap[m] = heap[c]; heap[c] = t;
        c = m;
      }
    }
    return top;
  };

  let expanded = 0;
  while (heap.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur - cx) / w;
    if (reached(cx, cy)) {
      const path: Tile[] = [];
      for (let i = cur; i !== -1; i = came[i]) { const x = i % w; path.push({ x, y: (i - x) / w }); }
      path.reverse();
      return path;
    }
    if (++expanded > maxNodes) return null;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni] || !opts.passable(nx, ny)) continue;
      // A diagonal that clips a corner walks through solid rock in every view that draws walls as
      // blocks, so it is refused unless the caller says otherwise.
      if (dx !== 0 && dy !== 0 && !cutCorners && (!opts.passable(cx + dx, cy) || !opts.passable(cx, cy + dy))) continue;
      const step = opts.cost ? opts.cost(nx, ny, cx, cy) : (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      const tentative = gScore[cur] + step;
      if (tentative >= gScore[ni]) continue;
      came[ni] = cur;
      gScore[ni] = tentative;
      hScore[ni] = heuristic(nx, ny, gx, gy);
      fScore[ni] = tentative + hScore[ni];
      push(ni);
    }
  }
  return null;
}
