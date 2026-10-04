// Every animation a cat can play, as keyframes for the engine's AnimPlayer (src/lib/art/animation.ts).
//
// Angles follow rig.ts: limb 0 hangs down, positive swings FORWARD; torso and head positive lean
// forward. armR / legR are the NEAR limbs. A pose is written with P() shorthand -- `armR: [upper,
// lower]` -- and most go through G(), which plants the feet: it works out from this cat's own leg
// lengths how far the body must drop for the lowest foot to touch the ground, so a crouch authored
// once sits right on a long-legged cat and a short one alike. That is why the set is built per cat
// (`animsFor(id)`) rather than shared: the numbers are the same, the proportions are not.
//
// Frames carry `sfx` (played by whoever owns the player), `fx` (particles: crumbs, hearts, Zs,
// droplets) and `event` -- 'hit' opens an attack's active window, the specials fire on theirs.
import { P, type PartialPose, type PoseSpec } from '../lib/art/poses.ts';
import type { Anim, AnimSet, FrameFx, PlayerFrame } from '../lib/art/animation.ts';
import type { Proportions } from '../lib/art/rig.ts';
import { DEFAULT_PROPORTIONS } from '../lib/art/rig.ts';
import type { CatId } from '../core/save.ts';
import { PROPORTIONS, CF } from './catRig.ts';

const D2R = Math.PI / 180;
type Spec = Omit<PoseSpec, 'root' | 'legR' | 'legL' | 'armR' | 'armL' | 'face'> & {
  root?: [number, number, number?];
  legR?: [number, number];
  legL?: [number, number];
  armR?: [number, number];
  armL?: [number, number];
  face?: number | keyof typeof CF;
};
type Extra = Partial<PlayerFrame>;

function faceNum(f: Spec['face']): number | undefined {
  if (f === undefined) return undefined;
  return typeof f === 'number' ? f : CF[f];
}

function fx(kind: string, x = 0, y = 0, extra: Record<string, unknown> = {}): FrameFx { return { kind, x, y, ...extra }; }

function anim(loop: boolean, list: [number, PartialPose, Extra?][]): Anim {
  return { loop, frames: list.map(([dur, pose, extra]) => ({ dur, pose, ...(extra || {}) })) };
}

/** Everything the authoring below needs to know about one cat's body. */
function kit(p: Proportions) {
  const hipY = -(p.upperLeg + p.lowerLeg + p.footH - 2);
  const ankle = (u: number, l: number) => hipY + Math.cos(u * D2R) * p.upperLeg + Math.cos((u + l) * D2R) * p.lowerLeg;
  /** A pose with its feet on the ground: root y is solved from the legs, then `lift` px raised. */
  const G = (s: Spec, lift = 0): PartialPose => {
    const lr = s.legR || [0, 0], ll = s.legL || [0, 0];
    const lowest = Math.max(ankle(lr[0], lr[1]), ankle(ll[0], ll[1]));
    const y = -(p.footH - 2) - lowest - lift;
    const root = s.root || [0, 0, 0];
    return P({ ...s, face: faceNum(s.face), root: [root[0], y + root[1], root[2] || 0] } as PoseSpec);
  };
  /** A pose in the air: no grounding, root exactly as written. */
  const A = (s: Spec): PartialPose => P({ ...s, face: faceNum(s.face) } as PoseSpec);
  /** Height of the body centre above the feet, for spinning around the middle instead of the toes. */
  const mid = -(-hipY + p.torsoH * 0.5);
  /** A full flip around the body's middle, as `steps` keyframes (root rotation pivots on the feet otherwise). */
  const flip = (base: Spec, turns: number, steps: number, dur: number, lift = 0, dir = 1): [number, PartialPose, Extra?][] => {
    const out: [number, PartialPose, Extra?][] = [];
    for (let i = 0; i <= steps; i++) {
      const th = dir * (i / steps) * 360 * turns, t = th * D2R;
      const rx = mid * Math.sin(t) * -1, ry = mid * (1 - Math.cos(t));
      out.push([dur, A({ ...base, root: [rx, ry - lift, th] })]);
    }
    return out;
  };
  return { G, A, flip, hipY, mid };
}

// ------------------------------------------------------------------ the shared set

function baseSet(p: Proportions): AnimSet {
  const { G, A, flip } = kit(p);
  const stand = (s: Spec = {}) => G({ armR: [8, 18], armL: [-6, 16], ...s });
  const set: AnimSet = {
    idle: anim(true, [
      [38, stand({ torso: 1, head: 0 }), { ease: 'inout' }],
      [38, stand({ armR: [10, 22], armL: [-4, 20], torso: 3, head: 2, squash: 0.985 }), { ease: 'inout' }],
    ]),
    groom: anim(false, [
      [10, G({ armR: [100, 120], armL: [-6, 16], head: -8, torso: -2 }), { ease: 'out' }],
      [8, G({ armR: [112, 128], armL: [-6, 16], head: -16, torso: -3, face: 'lick' })],
      [8, G({ armR: [106, 124], armL: [-6, 16], head: -8, torso: -2, face: 'lick' })],
      [8, G({ armR: [112, 128], armL: [-6, 16], head: -16, torso: -3, face: 'lick' })],
      [8, G({ armR: [106, 124], armL: [-6, 16], head: -8, torso: -2, face: 'lick' })],
      [14, G({ armR: [158, 72], armL: [-6, 16], head: 14, torso: 4, face: 'closed' }), { ease: 'inout' }],
      [14, G({ armR: [140, 60], armL: [-6, 16], head: 10, torso: 4, face: 'closed' }), { ease: 'inout' }],
      [14, G({ armR: [158, 72], armL: [-6, 16], head: 14, torso: 4, face: 'closed' }), { ease: 'inout' }],
      [12, stand({ face: 'happy' })],
    ]),
    walk: anim(true, [
      [9, G({ legR: [26, -12], legL: [-22, -8], armR: [-22, 14], armL: [22, 14], torso: 4, head: -2 })],
      [9, G({ legR: [4, -6], legL: [-6, -34], armR: [-4, 14], armL: [4, 14], torso: 3, head: -1 }, 1.2)],
      [9, G({ legR: [-22, -8], legL: [26, -12], armR: [22, 14], armL: [-22, 14], torso: 4, head: -2 })],
      [9, G({ legR: [-6, -34], legL: [4, -6], armR: [4, 14], armL: [-4, 14], torso: 3, head: -1 }, 1.2)],
    ]),
    run: anim(true, [
      [6, G({ legR: [44, -20], legL: [-38, -28], armR: [-52, 80], armL: [52, 70], torso: 13, head: -9 })],
      [6, G({ legR: [6, -16], legL: [34, -118], armR: [-8, 70], armL: [8, 70], torso: 11, head: -8 }, 2.5)],
      [6, G({ legR: [-38, -28], legL: [44, -20], armR: [52, 70], armL: [-52, 80], torso: 13, head: -9 })],
      [6, G({ legR: [34, -118], legL: [6, -16], armR: [8, 70], armL: [-8, 70], torso: 11, head: -8 }, 2.5)],
    ]),
    skid: anim(false, [
      [8, G({ legR: [40, -10], legL: [20, -30], armR: [60, 30], armL: [40, 30], torso: -16, head: -6, face: 'surprised' })],
      [6, stand()],
    ]),
    jump: anim(false, [
      [4, A({ legR: [-12, 0], legL: [-6, 0], armR: [150, 10], armL: [140, 10], torso: -4, head: -6, stretch: 1.08 })],
      [9, A({ legR: [58, -100], legL: [38, -84], armR: [122, 30], armL: [102, 30], torso: 4, head: -2 })],
    ]),
    fall: anim(true, [
      [10, A({ legR: [22, -34], legL: [-10, -22], armR: [112, 40], armL: [92, 40], torso: 0, head: 4 })],
      [10, A({ legR: [16, -28], legL: [-6, -26], armR: [120, 32], armL: [98, 32], torso: 1, head: 5 })],
    ]),
    land: anim(false, [
      [4, G({ legR: [42, -76], legL: [32, -64], armR: [34, 20], armL: [24, 20], torso: 10, head: -6, squash: 1.12 })],
      [7, stand()],
    ]),
    duck: anim(true, [
      [20, G({ legR: [74, -130], legL: [62, -124], armR: [64, 50], armL: [50, 50], torso: 32, head: -26, squash: 1.1, stretch: 0.62 }), { ease: 'inout' }],
      [20, G({ legR: [74, -130], legL: [62, -124], armR: [66, 52], armL: [52, 52], torso: 33, head: -24, squash: 1.12, stretch: 0.6 }), { ease: 'inout' }],
    ]),
    crawl: anim(true, [
      [8, G({ legR: [84, -130], legL: [50, -116], armR: [80, 30], armL: [40, 60], torso: 34, head: -26, squash: 1.12, stretch: 0.6 })],
      [8, G({ legR: [50, -116], legL: [84, -130], armR: [40, 60], armL: [80, 30], torso: 34, head: -26, squash: 1.12, stretch: 0.6 })],
    ]),
    hurt: anim(false, [
      [6, G({ legR: [30, -20], legL: [-10, -10], armR: [140, 40], armL: [120, 40], torso: -24, head: -16, root: [-3, 0, -8], face: 'hurt' })],
      [16, G({ legR: [12, -10], legL: [-6, -8], armR: [60, 40], armL: [40, 40], torso: -10, head: -6, face: 'hurt' })],
      [8, stand({ face: 'grit' })],
    ]),
    flail: anim(true, [
      [4, A({ legR: [36, -50], legL: [-24, -10], armR: [168, 14], armL: [36, 40], torso: -8, head: -10, face: 'shout' })],
      [4, A({ legR: [-24, -10], legL: [36, -50], armR: [36, 40], armL: [168, 14], torso: -8, head: -6, face: 'shout' })],
    ]),
    shake: anim(false, [
      [4, G({ root: [0, 0, -10], torso: -4, head: -10, squash: 1.06, face: 'closed', armR: [40, 30], armL: [-30, 30] }), { sfx: 'shake', fx: [fx('shake')] }],
      [4, G({ root: [0, 0, 10], torso: 4, head: 10, squash: 0.94, face: 'closed', armR: [-30, 30], armL: [40, 30] }), { fx: [fx('shake')] }],
      [4, G({ root: [0, 0, -10], torso: -4, head: -10, squash: 1.06, face: 'closed', armR: [40, 30], armL: [-30, 30] }), { fx: [fx('shake')] }],
      [4, G({ root: [0, 0, 10], torso: 4, head: 10, squash: 0.94, face: 'closed', armR: [-30, 30], armL: [40, 30] }), { fx: [fx('shake')] }],
      [4, G({ root: [0, 0, -8], torso: -3, head: -8, squash: 1.04, face: 'closed' }), { fx: [fx('shake')] }],
      [4, G({ root: [0, 0, 8], torso: 3, head: 8, squash: 0.96, face: 'closed' }), { fx: [fx('shake')] }],
      [10, stand({ face: 'grit' })],
      [14, stand({ face: 'happy' })],
    ]),
    eat: anim(true, [
      [9, G({ legR: [70, -110], legL: [60, -104], armR: [70, 20], armL: [60, 20], torso: 40, head: 34, face: 'closed' }), { sfx: 'eat', fx: [fx('crumbs', 16, -10)] }],
      [9, G({ legR: [70, -110], legL: [60, -104], armR: [70, 20], armL: [60, 20], torso: 36, head: 18, face: 'lick' })],
      [9, G({ legR: [70, -110], legL: [60, -104], armR: [70, 20], armL: [60, 20], torso: 40, head: 34, face: 'closed' }), { fx: [fx('crumbs', 16, -10)] }],
      [9, G({ legR: [70, -110], legL: [60, -104], armR: [70, 20], armL: [60, 20], torso: 37, head: 20, face: 'lick' })],
    ]),
    drink: anim(true, [
      [7, G({ legR: [70, -110], legL: [60, -104], armR: [64, 24], armL: [54, 24], torso: 42, head: 38, face: 'lick' }), { sfx: 'drink', fx: [fx('drops', 18, -6)] }],
      [7, G({ legR: [70, -110], legL: [60, -104], armR: [64, 24], armL: [54, 24], torso: 40, head: 30, face: 'closed' })],
      [7, G({ legR: [70, -110], legL: [60, -104], armR: [64, 24], armL: [54, 24], torso: 42, head: 38, face: 'lick' }), { fx: [fx('drops', 18, -6)] }],
      [7, G({ legR: [70, -110], legL: [60, -104], armR: [64, 24], armL: [54, 24], torso: 40, head: 30, face: 'closed' })],
    ]),
    yum: anim(false, [
      [10, stand({ head: -12, torso: -4, face: 'lick' })],
      [10, stand({ head: -8, armR: [100, 110], face: 'lick' })],
      [12, stand({ head: -6, armR: [40, 60], armL: [30, 60], torso: -6, face: 'happy' }), { fx: [fx('hearts', 0, -40)], sfx: 'purr' }],
      [24, stand({ head: -4, armR: [36, 70], armL: [26, 70], torso: -8, face: 'happy', squash: 1.04 })],
    ]),
    sit: anim(true, [
      [40, G({ legR: [86, -8], legL: [78, -12], armR: [24, 40], armL: [14, 40], torso: -4, head: 2 }), { ease: 'inout' }],
      [40, G({ legR: [86, -8], legL: [78, -12], armR: [26, 44], armL: [16, 44], torso: -2, head: 4, squash: 0.985 }), { ease: 'inout' }],
    ]),
    sleep: anim(true, [
      [50, G({ legR: [86, -8], legL: [78, -12], armR: [30, 50], armL: [20, 50], torso: 8, head: 26, face: 'closed' }), { ease: 'inout', fx: [fx('z', 6, -44)] }],
      [50, G({ legR: [86, -8], legL: [78, -12], armR: [30, 50], armL: [20, 50], torso: 10, head: 30, face: 'closed', squash: 1.03 }), { ease: 'inout', sfx: 'snore' }],
    ]),
    stretch: anim(false, [
      [12, G({ armR: [168, 4], armL: [160, 4], torso: -6, head: -12, stretch: 1.06, face: 'shout' }), { ease: 'out', sfx: 'mew' }],
      [16, G({ armR: [176, 0], armL: [170, 0], torso: -8, head: -14, stretch: 1.1, face: 'closed' })],
      [10, G({ legR: [20, -30], legL: [-10, -10], armR: [80, 20], armL: [70, 20], torso: 24, head: -14, face: 'closed' })],
      [12, stand({ face: 'happy' }), { fx: [fx('sparkles', 0, -30)] }],
    ]),
    meow: anim(false, [
      [6, stand({ head: -14, torso: -4, face: 'neutral' })],
      [26, stand({ head: -18, torso: -6, face: 'shout', squash: 1.04 }), { sfx: 'meow', fx: [fx('note', 10, -50)] }],
      [8, stand({ face: 'happy' })],
    ]),
    wave: anim(true, [
      [8, stand({ armR: [158, 40], face: 'happy' })],
      [8, stand({ armR: [150, -10], face: 'happy' })],
    ]),
    hop: anim(false, [
      [5, G({ legR: [30, -60], legL: [20, -50], armR: [20, 30], armL: [10, 30], squash: 1.1 })],
      [8, A({ root: [0, -12, 0], armR: [150, 20], armL: [140, 20], legR: [30, -60], legL: [10, -40], face: 'happy' }), { ease: 'out' }],
      [8, A({ root: [0, -2, 0], armR: [120, 20], armL: [110, 20], face: 'happy' }), { ease: 'in' }],
      [6, G({ squash: 1.08, face: 'happy' }), { fx: [fx('hearts', 0, -44)] }],
    ]),
    fishSit: anim(true, [
      [30, G({ legR: [86, -8], legL: [78, -12], armR: [64, 36], armL: [56, 40], torso: 4, head: 6 }), { ease: 'inout' }],
      [30, G({ legR: [86, -8], legL: [78, -12], armR: [66, 38], armL: [58, 42], torso: 5, head: 8 }), { ease: 'inout' }],
    ]),
    fishReel: anim(true, [
      [5, G({ legR: [86, -8], legL: [78, -12], armR: [44, 70], armL: [36, 74], torso: -6, head: -4, face: 'grit' })],
      [5, G({ legR: [86, -8], legL: [78, -12], armR: [54, 60], armL: [46, 64], torso: -2, head: -2, face: 'grit' })],
    ]),
    fishCatch: anim(false, [
      [8, G({ legR: [86, -8], legL: [78, -12], armR: [150, 20], armL: [140, 24], torso: -10, head: -14, face: 'surprised' })],
      [26, G({ legR: [86, -8], legL: [78, -12], armR: [160, 10], armL: [150, 14], torso: -8, head: -10, face: 'happy' }), { fx: [fx('sparkles', 0, -40)] }],
    ]),
    fishSplash: anim(false, [
      [10, A({ root: [10, -6, 50], armR: [150, 10], armL: [140, 10], legR: [-20, 0], legL: [-30, 0], face: 'surprised' })],
      [30, A({ root: [16, -4, 80], armR: [170, 0], armL: [160, 0], face: 'shout' })],
    ]),
    bat: anim(false, [
      [4, G({ armR: [-30, 50], torso: -6, legR: [20, -30], legL: [-10, -10], face: 'grit' })],
      [4, G({ armR: [70, -10], torso: 22, legR: [30, -40], legL: [-10, -10], face: 'happy' }), { event: 'hit', sfx: 'swipe' }],
      [10, G({ armR: [60, 0], torso: 18, legR: [30, -40], legL: [-10, -10], face: 'happy' })],
      [6, stand()],
    ]),
    scratch: anim(true, [
      [7, G({ armR: [168, 10], armL: [150, 30], torso: 10, head: -14, stretch: 1.05, face: 'closed' }), { sfx: 'scratch' }],
      [7, G({ armR: [128, 40], armL: [170, 10], torso: 12, head: -12, stretch: 1.05, face: 'happy' })],
    ]),
    peek: anim(true, [
      [20, stand({ head: -6, face: 'surprised' })],
      [30, stand({ head: 4, face: 'happy' })],
    ]),
    dizzy: anim(true, [
      [10, G({ root: [0, 0, -6], torso: -4, head: -10, armR: [40, 40], armL: [20, 40], face: 'dazed' })],
      [10, G({ root: [0, 0, 6], torso: 4, head: 10, armR: [30, 40], armL: [30, 40], face: 'dazed' })],
    ]),
    cheer: anim(true, [
      [10, stand({ armR: [165, 10], armL: [155, 10], face: 'happy', squash: 0.96 })],
      [10, G({ armR: [140, 40], armL: [130, 40], face: 'happy' }, 3)],
    ]),
    slide: anim(true, [
      [30, G({ legR: [80, -10], legL: [70, -10], armR: [150, 30], armL: [130, 30], torso: -20, head: -20, face: 'happy' })],
    ]),
    spin: anim(false, flip({ armR: [150, 20], armL: [140, 20], legR: [50, -90], legL: [40, -80], face: 'happy' }, 1, 8, 3, 6)),
  };
  set.ride = set.duck; // riding a log low is a duck with a wobble, played at its own speed
  return set;
}

// ------------------------------------------------------------------ per-cat moves

function crushSet(p: Proportions): AnimSet {
  const { G, A } = kit(p);
  return {
    attack: anim(false, [
      [6, G({ armR: [-62, 112], armL: [40, 80], torso: -12, head: -4, legR: [24, -20], legL: [-18, -6], face: 'grit' })],
      [3, G({ armR: [92, 0], armL: [-20, 60], torso: 18, head: 4, root: [3, 0, 0], legR: [30, -30], legL: [-24, -6], face: 'shout' }), { event: 'hit', sfx: 'punch' }],
      [8, G({ armR: [88, 0], armL: [-20, 60], torso: 16, root: [3, 0, 0], legR: [30, -30], legL: [-24, -6], face: 'angry' })],
      [10, G({ armR: [10, 30], armL: [-6, 20], torso: 2 })],
    ]),
    special: anim(false, [
      [8, A({ legR: [92, -150], legL: [86, -146], armR: [70, 110], armL: [60, 110], torso: 34, head: -10, face: 'grit', squash: 0.9 })],
      [40, A({ legR: [0, 0], legL: [0, 0], armR: [-10, 0], armL: [-20, 0], torso: 10, head: -4, stretch: 1.16, face: 'shout' })],
    ]),
    pound: anim(false, [
      [4, G({ legR: [60, -110], legL: [50, -100], armR: [20, -10], armL: [10, -10], torso: 40, head: -30, squash: 1.25, face: 'grit' }), { event: 'shock', sfx: 'pound' }],
      [16, G({ legR: [50, -90], legL: [40, -80], armR: [24, -10], armL: [14, -10], torso: 32, head: -24, squash: 1.08, face: 'grit' })],
      [10, G({ armR: [90, 110], armL: [80, 110], torso: -4, face: 'happy' })],
    ]),
    victory: anim(false, [
      [10, G({ armR: [92, 112], armL: [86, 112], torso: -4, head: -6, face: 'grit' }), { sfx: 'roar' }],
      [16, G({ armR: [96, 118], armL: [90, 118], torso: -6, head: -8, squash: 1.06, face: 'happy' }), { fx: [fx('sparkles', 0, -40)] }],
      [10, G({ armR: [92, 112], armL: [86, 112], torso: -4, face: 'happy' })],
      [8, G({ armR: [170, 6], armL: [-10, 20], torso: -8, head: -14, face: 'shout' }, 4)],
      [30, G({ armR: [174, 2], armL: [-10, 20], torso: -8, head: -12, face: 'happy' })],
    ]),
    quirk: anim(false, [
      [12, G({ armR: [92, 116], armL: [-6, 16], head: 8, torso: -2, face: 'smug' })],
      [20, G({ armR: [96, 124], armL: [-6, 16], head: 12, torso: -2, squash: 1.04, face: 'smug' }), { fx: [fx('sparkles', 10, -30)] }],
      [12, G({ armR: [8, 18], armL: [-6, 16], face: 'happy' })],
    ]),
  };
}

function sproutSet(p: Proportions): AnimSet {
  const { G, A } = kit(p);
  return {
    attack: anim(false, [
      [5, G({ armR: [176, 40], armL: [20, 30], torso: -8, head: -6, face: 'grit' })],
      [3, G({ armR: [86, 18], armL: [-10, 30], torso: 14, head: 4, face: 'happy' }), { event: 'hit', sfx: 'book', smear: { from: -90, to: 20, a: 0.4 } }],
      [7, G({ armR: [80, 18], armL: [-10, 30], torso: 12, face: 'happy' })],
      [8, G({ armR: [20, 40], armL: [-6, 16] })],
    ]),
    special: anim(false, [
      [10, G({ armR: [150, 134], armL: [-6, 16], head: 10, face: 'closed' })],
      [14, G({ armR: [150, 134], armL: [-6, 16], head: 12, face: 'closed' }), { fx: [fx('think', 0, -50)] }],
      [16, G({ armR: [176, 0], armL: [-6, 16], head: -10, face: 'surprised' }), { event: 'special', sfx: 'slowmo', fx: [fx('bulb', 0, -56)] }],
    ]),
    victory: anim(false, [
      [12, G({ armR: [150, 136], armL: [-6, 16], head: -4, face: 'smug' })],
      [8, A({ root: [0, -14, 0], armR: [170, 10], armL: [160, 10], legR: [40, -80], legL: [30, -70], face: 'happy' }), { sfx: 'mew' }],
      [8, G({ armR: [170, 10], armL: [160, 10], face: 'happy' })],
      [8, A({ root: [0, -14, 0], armR: [170, 10], armL: [160, 10], legR: [40, -80], legL: [30, -70], face: 'happy' }), { fx: [fx('sparkles', 0, -40)] }],
      [30, G({ armR: [100, 120], armL: [-6, 16], face: 'wink' })],
    ]),
    quirk: anim(false, [
      [10, G({ armR: [80, 70], armL: [70, 60], head: 18, torso: 6, face: 'neutral' })],
      [40, G({ armR: [84, 70], armL: [72, 60], head: 20, torso: 6, face: 'neutral' }), { fx: [fx('think', 0, -50)] }],
      [16, G({ armR: [150, 136], armL: [-6, 16], head: -4, face: 'surprised' }), { fx: [fx('bulb', 0, -56)] }],
      [10, G({ armR: [8, 18], armL: [-6, 16], face: 'happy' })],
    ]),
  };
}

function slySet(p: Proportions): AnimSet {
  const { G, A } = kit(p);
  return {
    attack: anim(false, [
      [3, G({ armR: [-24, 84], armL: [10, 30], torso: -6, face: 'smug' })],
      [3, G({ armR: [104, 0], armL: [-10, 30], torso: 14, face: 'angry' }), { event: 'hit', sfx: 'swipe', smear: { from: -70, to: 30, a: 0.35 } }],
      [3, G({ armR: [20, 40], armL: [104, 0], torso: 16, face: 'angry' }), { sfx: 'swipe' }],
      [9, G({ armR: [10, 30], armL: [-6, 16], torso: 4, face: 'smug' })],
    ]),
    special: anim(false, [
      [4, G({ legR: [50, -70], legL: [-40, -20], armR: [-60, 20], armL: [-50, 20], torso: 44, head: -36, face: 'smug' }), { event: 'special', sfx: 'shadow' }],
      [24, G({ legR: [60, -30], legL: [-60, -14], armR: [-70, 10], armL: [-60, 10], torso: 46, head: -38, face: 'smug' })],
    ]),
    run: anim(true, [
      [7, G({ legR: [48, -30], legL: [-42, -30], armR: [-40, 40], armL: [40, 40], torso: 26, head: -22, stretch: 0.94 })],
      [7, G({ legR: [8, -30], legL: [30, -110], armR: [-6, 40], armL: [6, 40], torso: 24, head: -20, stretch: 0.94 }, 1)],
      [7, G({ legR: [-42, -30], legL: [48, -30], armR: [40, 40], armL: [-40, 40], torso: 26, head: -22, stretch: 0.94 })],
      [7, G({ legR: [30, -110], legL: [8, -30], armR: [6, 40], armL: [-6, 40], torso: 24, head: -20, stretch: 0.94 }, 1)],
    ]),
    victory: anim(false, [
      [14, G({ armR: [60, 100], armL: [-10, 20], torso: 38, head: 22, face: 'closed' }), { ease: 'inout' }],
      [30, G({ armR: [60, 100], armL: [-10, 20], torso: 40, head: 24, face: 'closed' }), { fx: [fx('sparkles', 10, -24)] }],
      [16, G({ armR: [8, 18], armL: [-6, 16], torso: 0, face: 'smug' }), { ease: 'inout' }],
      [30, G({ armR: [8, 18], armL: [-6, 16], torso: 0, face: 'wink' })],
    ]),
    quirk: anim(false, [
      [16, G({ legR: [86, -8], legL: [78, -12], armR: [50, 90], armL: [40, 90], torso: 0, head: 0, face: 'closed' }), { ease: 'inout' }],
      [60, G({ legR: [86, -8], legL: [78, -12], armR: [50, 92], armL: [40, 92], torso: 0, head: -2, face: 'closed' }), { fx: [fx('zen', 0, -40)] }],
      [16, G({ armR: [8, 18], armL: [-6, 16], face: 'smug' }), { ease: 'inout' }],
    ]),
  };
}

function biscuitSet(p: Proportions): AnimSet {
  const { G, A, flip } = kit(p);
  return {
    attack: anim(false, [
      [4, G({ legR: [82, -104], legL: [-4, 0], armR: [60, 100], armL: [40, 110], torso: -6, head: -4, face: 'grit' })],
      [4, G({ legR: [96, -4], legL: [-8, 0], armR: [-30, 60], armL: [70, 90], torso: -14, head: -8, face: 'shout' }), { event: 'hit', sfx: 'hiya' }],
      [6, G({ legR: [94, -6], legL: [-8, 0], armR: [-30, 60], armL: [70, 90], torso: -14, head: -8, face: 'grit' })],
      [8, G({ armR: [60, 100], armL: [40, 110], legR: [20, -20], legL: [-14, -6], torso: 2, face: 'grit' })],
    ]),
    attack2: anim(false, [
      [4, G({ armR: [164, 64], armL: [40, 100], torso: -8, legR: [24, -20], legL: [-18, -6], face: 'grit' })],
      [3, G({ armR: [84, -2], armL: [30, 100], torso: 18, legR: [28, -28], legL: [-20, -6], face: 'shout' }), { event: 'hit', sfx: 'hiya', smear: { from: -100, to: 10, a: 0.4 } }],
      [6, G({ armR: [80, 0], armL: [30, 100], torso: 16, legR: [28, -28], legL: [-20, -6], face: 'grit' })],
      [8, G({ armR: [60, 100], armL: [40, 110], legR: [20, -20], legL: [-14, -6], torso: 2, face: 'grit' })],
    ]),
    special: anim(false, [
      [5, A({ legR: [70, -120], legL: [40, -100], armR: [60, 100], armL: [40, 100], torso: -10, face: 'grit' })],
      [22, A({ legR: [100, 0], legL: [-20, -90], armR: [-60, 40], armL: [80, 60], torso: -34, head: -12, face: 'shout' }), { event: 'special', sfx: 'hiya' }],
    ]),
    airJump: anim(false, flip({ legR: [70, -130], legL: [60, -120], armR: [60, 110], armL: [50, 110], torso: 10, face: 'happy' }, 1, 8, 3, 0)),
    run: anim(true, [
      [5, G({ legR: [48, -18], legL: [-42, -30], armR: [-60, 90], armL: [60, 80], torso: 15, head: -11 })],
      [5, G({ legR: [6, -16], legL: [36, -122], armR: [-10, 80], armL: [10, 80], torso: 13, head: -10 }, 3)],
      [5, G({ legR: [-42, -30], legL: [48, -18], armR: [60, 80], armL: [-60, 90], torso: 15, head: -11 })],
      [5, G({ legR: [36, -122], legL: [6, -16], armR: [10, 80], armL: [-10, 80], torso: 13, head: -10 }, 3)],
    ]),
    victory: anim(false, [
      [8, G({ armR: [60, 100], armL: [40, 110], legR: [20, -20], legL: [-14, -6], face: 'grit' })],
      [10, G({ legR: [84, -116], legL: [0, 0], armR: [146, -34], armL: [136, -34], torso: -4, head: -6, face: 'closed' }), { ease: 'out' }],
      [24, G({ legR: [86, -118], legL: [0, 0], armR: [150, -30], armL: [140, -30], torso: -4, head: -8, face: 'grit' })],
      [6, G({ legR: [96, -4], legL: [-8, 0], armR: [-30, 60], armL: [70, 90], torso: -14, face: 'shout' }), { sfx: 'hiya', fx: [fx('sparkles', 20, -20)] }],
      [30, G({ armR: [60, 100], armL: [40, 110], face: 'happy' })],
    ]),
    quirk: anim(false, [
      [10, G({ armR: [40, 100], armL: [30, 100], head: 10, torso: 6, face: 'hurt' }), { sfx: 'tummy' }],
      [24, G({ armR: [42, 104], armL: [32, 104], head: 12, torso: 8, squash: 1.03, face: 'hurt' }), { fx: [fx('rumble', 4, -18)] }],
      [16, G({ armR: [8, 18], armL: [-6, 16], head: -10, face: 'hungry' })],
      [10, G({ armR: [8, 18], armL: [-6, 16], face: 'neutral' })],
    ]),
  };
}

function truffleSet(p: Proportions): AnimSet {
  const { G, A, flip } = kit(p);
  return {
    attack: anim(false, [
      [4, G({ legR: [30, -60], legL: [10, -40], armR: [60, 60], armL: [40, 60], torso: -4, squash: 1.08, face: 'grit' })],
      [4, A({ root: [2, -6, 0], legR: [100, -12], legL: [-20, -40], armR: [-20, 40], armL: [120, 30], torso: -16, face: 'shout' }), { event: 'hit', sfx: 'swipe' }],
      [6, A({ root: [2, -3, 0], legR: [94, -14], legL: [-20, -40], armR: [-20, 40], armL: [120, 30], torso: -16, face: 'happy' })],
      [8, G({ armR: [8, 18], armL: [-6, 16], face: 'happy' })],
    ]),
    special: anim(false, [
      [8, G({ legR: [74, -130], legL: [64, -124], armR: [30, 20], armL: [20, 20], torso: 24, head: -20, squash: 1.2, stretch: 0.8, face: 'grit' })],
      [4, A({ legR: [-10, 0], legL: [-14, 0], armR: [176, 0], armL: [170, 0], torso: -6, head: -10, stretch: 1.22, face: 'shout' }), { event: 'special', sfx: 'spring' }],
      ...flip({ legR: [60, -100], legL: [50, -90], armR: [150, 20], armL: [140, 20], face: 'happy' }, 1, 8, 3, 0),
    ]),
    trip: anim(false, [
      [8, G({ torso: 30, head: 12, armR: [100, 20], armL: [80, 30], legR: [-30, -40], legL: [20, -10], root: [2, 0, 14], face: 'surprised' }), { sfx: 'trip' }],
      [7, A({ root: [6, -6, 58], torso: 18, head: -4, armR: [150, 0], armL: [140, 0], legR: [-20, -10], legL: [-10, -20], face: 'shout' })],
      [6, A({ root: [10, -9, 88], torso: 8, head: -10, armR: [170, 0], armL: [160, 0], legR: [-8, 0], legL: [-4, 0], squash: 1.08, face: 'dazed' }), { fx: [fx('dust', 24, 0), fx('stars', 30, -10)] }],
      [26, A({ root: [10, -9, 90], torso: 6, head: -8, armR: [172, 0], armL: [162, 0], legR: [-10, 10], legL: [-4, 0], face: 'dazed' })],
      [10, G({ root: [4, 0, 26], torso: 40, head: -16, armR: [80, 30], armL: [70, 30], legR: [60, -110], legL: [50, -100], face: 'hurt' })],
      [12, G({ armR: [40, 100], armL: [-6, 16], head: 6, face: 'happy' })],
    ]),
    run: anim(true, [
      [6, G({ legR: [44, -20], legL: [-38, -28], armR: [-52, 80], armL: [52, 70], torso: 12, head: -9 })],
      [6, G({ legR: [6, -16], legL: [34, -118], armR: [-8, 70], armL: [8, 70], torso: 10, head: -8 }, 4)],
      [6, G({ legR: [-38, -28], legL: [44, -20], armR: [52, 70], armL: [-52, 80], torso: 12, head: -9 })],
      [6, G({ legR: [34, -118], legL: [6, -16], armR: [8, 70], armL: [-8, 70], torso: 10, head: -8 }, 4)],
    ]),
    victory: anim(false, [
      [8, G({ legR: [74, -130], legL: [64, -124], torso: 20, head: -16, squash: 1.15, stretch: 0.85, face: 'grit' })],
      [6, A({ root: [0, -16, 0], armR: [176, 0], armL: [170, 0], stretch: 1.12, face: 'shout' }), { sfx: 'spring' }],
      ...flip({ legR: [60, -100], legL: [50, -90], armR: [150, 20], armL: [140, 20], face: 'happy' }, 1, 8, 3, 18),
      [6, G({ squash: 1.12, face: 'happy' }), { fx: [fx('sparkles', 0, -30)] }],
      [30, G({ armR: [165, 10], armL: [155, 10], face: 'happy' })],
    ]),
    quirk: anim(false, [
      [6, G({ torso: 18, head: 8, armR: [80, 20], armL: [60, 30], legR: [-20, -30], root: [0, 0, 8], face: 'surprised' }), { sfx: 'trip' }],
      [8, G({ torso: -10, head: -6, armR: [140, 20], armL: [120, 20], root: [0, 0, -6], face: 'surprised' })],
      [20, G({ armR: [100, 120], armL: [-6, 16], head: 4, face: 'wink' })],
    ]),
  };
}

function pendragonSet(p: Proportions): AnimSet {
  const { G, A } = kit(p);
  return {
    idle: anim(true, [
      [38, G({ armR: [24, 48], armL: [-10, 40], torso: 1, weapon: -40 }), { ease: 'inout' }],
      [38, G({ armR: [26, 52], armL: [-8, 44], torso: 3, head: 2, weapon: -40, squash: 0.985 }), { ease: 'inout' }],
    ]),
    attack: anim(false, [
      [5, G({ armR: [172, 30], armL: [40, 60], torso: -10, head: -6, legR: [24, -20], legL: [-18, -6], face: 'grit' })],
      [3, G({ armR: [72, -10], armL: [-20, 40], torso: 16, head: 4, legR: [30, -30], legL: [-24, -6], face: 'shout' }), { event: 'hit', sfx: 'sword', smear: { from: -110, to: 40, a: 0.55 } }],
      [7, G({ armR: [62, -10], armL: [-20, 40], torso: 14, legR: [30, -30], legL: [-24, -6], face: 'angry' })],
      [8, G({ armR: [24, 48], armL: [-10, 40], weapon: -40 })],
    ]),
    special: anim(false, [
      [10, G({ armR: [176, 0], armL: [130, 30], torso: -6, head: -10, face: 'grit' }), { event: 'special', sfx: 'shield' }],
      [20, G({ armR: [178, 0], armL: [136, 30], torso: -6, head: -12, face: 'shout' }), { fx: [fx('sparkles', 6, -60)] }],
    ]),
    victory: anim(false, [
      [10, G({ armR: [120, 30], armL: [40, 60], torso: -4, face: 'grit' })],
      [12, G({ armR: [178, 0], armL: [70, 120], torso: -8, head: -12, face: 'shout' }), { sfx: 'fanfare', fx: [fx('sparkles', 8, -64)] }],
      [40, G({ armR: [176, 2], armL: [70, 124], torso: -8, head: -10, face: 'happy' })],
    ]),
    quirk: anim(false, [
      [12, G({ armR: [100, 40], armL: [80, 60], torso: 4, head: 8, weapon: 70, face: 'neutral' })],
      [30, G({ armR: [102, 42], armL: [70, 70], torso: 4, head: 10, weapon: 70, face: 'happy' }), { fx: [fx('sparkles', 20, -26)] }],
      [12, G({ armR: [24, 48], armL: [-10, 40], weapon: -40, face: 'smug' })],
    ]),
  };
}

const PER_CAT: Readonly<Record<CatId, (p: Proportions) => AnimSet>> = {
  crush: crushSet, sprout: sproutSet, sly: slySet, biscuit: biscuitSet, truffle: truffleSet, pendragon: pendragonSet,
};

const cache = new Map<CatId, AnimSet>();

/** The full animation set for one cat: the shared moves, with that cat's own over them. */
export function animsFor(id: CatId): AnimSet {
  let set = cache.get(id);
  if (set) return set;
  const p = { ...DEFAULT_PROPORTIONS, ...PROPORTIONS[id] } as Proportions;
  set = { ...baseSet(p), ...PER_CAT[id](p) };
  if (!set.attack2) set.attack2 = set.attack;
  if (!set.pound) set.pound = set.land;
  if (!set.airJump) set.airJump = set.jump;
  if (!set.trip) set.trip = set.hurt;
  cache.set(id, set);
  return set;
}

/** Names every set is guaranteed to have, for tests. */
export const REQUIRED_ANIMS = [
  'idle', 'groom', 'walk', 'run', 'skid', 'jump', 'fall', 'land', 'duck', 'crawl', 'hurt', 'flail', 'shake', 'eat', 'drink', 'yum',
  'sit', 'sleep', 'stretch', 'meow', 'wave', 'hop', 'fishSit', 'fishReel', 'fishCatch', 'fishSplash', 'bat', 'scratch', 'peek',
  'dizzy', 'cheer', 'slide', 'spin', 'ride', 'attack', 'attack2', 'special', 'victory', 'quirk', 'pound', 'airJump', 'trip',
] as const;
