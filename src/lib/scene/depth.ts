// The painter's algorithm over a projection: what order to draw things in so they overlap correctly.
//
// A 2D game with a ground plane has no depth buffer, so "which is in front" is decided entirely by
// draw order, and getting it wrong is the single most visible bug in the genre -- a hero standing
// behind a wall, a barrel drawn over the head of the monster carrying it. Each of the three games
// solved it separately and identically: sort by how far down the screen a thing's FEET are, then
// draw in that order.
//
// `depthOf` in src/scene/projection.ts already gives that number for every view, so the sort is the
// same three lines whether the world is a flat dungeon, an isometric one or a beat-em-up's depth
// band. What is left is one override and two tie-breaks, all three easy to get subtly wrong:
//
//   `layer` beats everything. A layer is a decision the game has made -- "this is backdrop clutter,
//   it is always behind the cast" -- and a decision must not be overturnable by an accident of
//   position. Foodie Truck's particle system already splits into a 'back' pass and a 'front' pass
//   for exactly this reason; the field generalises that split to anything that draws.
//
//   It is also what makes STRICT 2D work. In a side-on game the y axis is height on the screen, not
//   depth into it, so sorting by it means a sprite's draw order changes as it jumps -- which is
//   nonsense. There, `layer` is the order and `depthOf` is only the stable fallback inside one.
//
//   Same layer and ground depth, different height: the HIGHER one is drawn first, i.e. behind. A
//   fighter who jumps must not pop in front of the one standing next to them -- their feet have not
//   moved.
//
//   All three equal: insertion order, which `Array.prototype.sort` has guaranteed to preserve since
//   ES2019. That is why nothing here needs an id field: a stable sort already means two entities on
//   the same tile keep whatever order the world holds them in, frame after frame, instead of
//   flickering past each other.
import { depthOf, type Projection } from './projection.ts';

/** Anything with a position on the ground plane and, optionally, a height above it. */
export interface SceneNode {
  /** World x. */
  x: number;
  /** World y -- depth into the screen, not height. */
  y: number;
  /** Height above the ground plane. Absent counts as 0. */
  z?: number;
  /**
   * Ordering band. EVERY node of layer 0 draws before ANY node of layer 1, whatever their depths.
   * Absent counts as 0, so a scene that never sets one behaves exactly as it did before.
   */
  layer?: number;
}

/** How far down the screen a node's footprint sits: its sort key, height excluded. */
export function depthOfNode(p: Projection, n: SceneNode): number { return depthOf(p, n.x, n.y); }

/** The comparator: layer, then ground depth ascending, then height DESCENDING, then insertion order. */
export function compareDepth(p: Projection, a: SceneNode, b: SceneNode): number {
  const la = a.layer === undefined ? 0 : a.layer, lb = b.layer === undefined ? 0 : b.layer;
  if (la !== lb) return la - lb;
  const da = depthOf(p, a.x, a.y), db = depthOf(p, b.x, b.y);
  if (da !== db) return da - db;
  const za = a.z === undefined ? 0 : a.z, zb = b.z === undefined ? 0 : b.z;
  return zb - za;
}

/** Sort `items` into draw order, in place, and return them. Stable, so equal nodes keep their order. */
export function sortScene<T extends SceneNode>(p: Projection, items: T[]): T[] {
  return items.sort((a, b) => compareDepth(p, a, b));
}

/**
 * A reusable draw list. `add` every visible thing, `flush` draws them back-to-front and empties the
 * list, ready for the next frame.
 *
 * The point of it over `sortScene(p, world.entities.slice())` is the missing `slice`: the buffer is
 * kept between frames, so a busy scene does not hand the garbage collector a fresh array of every
 * entity sixty times a second. Aether & Brass carries the same trick by hand as `world._sorted`.
 */
export interface DrawList<T extends SceneNode> {
  /** Queue one node. Nothing is sorted until `flush`. */
  add(item: T): void;
  /** How many nodes are queued. */
  readonly length: number;
  /** Sort into draw order and call `draw` on each, back to front, then empty the list. */
  flush(draw: (item: T, index: number) => void): void;
  /** Sort into draw order and hand back the buffer without drawing or emptying it. */
  sorted(): readonly T[];
  /** Empty the list without drawing. */
  clear(): void;
}

/** Create a `DrawList` for one projection. One per layer that needs its own ordering. */
export function createDrawList<T extends SceneNode>(p: Projection): DrawList<T> {
  // Held across frames and truncated rather than replaced, so steady-state drawing allocates nothing.
  const items: T[] = [];
  let n = 0;
  const cmp = (a: T, b: T): number => compareDepth(p, a, b);
  const list: DrawList<T> = {
    add(item) { items[n++] = item; },
    get length() { return n; },
    sorted() { items.length = n; items.sort(cmp); return items; },
    flush(draw) {
      items.length = n;
      items.sort(cmp);
      for (let i = 0; i < items.length; i++) draw(items[i], i);
      n = 0;
    },
    clear() { n = 0; },
  };
  return list;
}
