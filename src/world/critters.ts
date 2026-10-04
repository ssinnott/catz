// The bad guys' bodies. The raccoon bandit, the bulldog and the rat stand up on the same paper-doll
// rig as the cats (src/lib/art/rig.ts), with their own heads, tails and clothes, so a cat bonking a
// raccoon is two characters from one cartoon. Pigeons, crabs and frogs are not built on a skeleton
// at all and are drawn by hand in enemies.ts.
import { buildRig, type Rig, type RigBuild, type RigAccessory, type Proportions } from '../lib/art/rig.ts';
import type { PartHook } from '../lib/art/rigParts.ts';
import { celPath, celBall, outlinePath, tones } from '../lib/art/shading.ts';
import { pathTaperedCapsule, pathRoundedPoly } from '../lib/art/shapes.ts';
import { shade, type Palette } from '../lib/art/palettes.ts';
import { getChain } from '../lib/art/secondary.ts';
import { P, type PartialPose, type PoseSpec } from '../lib/art/poses.ts';
import type { Anim, AnimSet } from '../lib/art/animation.ts';
import { DEFAULT_PROPORTIONS } from '../lib/art/rig.ts';

type Hook = PartHook<Rig>;
type Ctx = CanvasRenderingContext2D;
const D2R = Math.PI / 180;
const R = Math.round;

export type CritterKind = 'raccoon' | 'dog' | 'rat';

interface CritterLook {
  kind: CritterKind;
  fur: string;
  furDark: string;
  belly: string;
  nose: string;
  outline: string;
  scale: number;
  tail: { len: number; r0: number; r1: number; curl: number; color?: string; rings?: string };
}

interface CritterBuild extends RigBuild { critter: CritterLook }
function lookOf(rig: Rig): CritterLook { return (rig.build as CritterBuild).critter; }

const LOOKS: Readonly<Record<CritterKind, CritterLook>> = {
  raccoon: { kind: 'raccoon', fur: '#9a95a8', furDark: '#3b3646', belly: '#e4e0ea', nose: '#26202e', outline: '#16121c', scale: 0.98, tail: { len: 22, r0: 4.2, r1: 3.6, curl: 6, rings: '#3b3646' } },
  dog: { kind: 'dog', fur: '#d9a066', furDark: '#93602f', belly: '#f4e0c4', nose: '#2a1d18', outline: '#1d140e', scale: 1.16, tail: { len: 8, r0: 2.8, r1: 2.2, curl: -30 } },
  rat: { kind: 'rat', fur: '#8f8586', furDark: '#5e5556', belly: '#d8cfcf', nose: '#f29aa7', outline: '#1b1617', scale: 0.72, tail: { len: 26, r0: 1.6, r1: 0.9, curl: -10, color: '#f0a3ae' } },
};

const PROPS: Readonly<Record<CritterKind, Partial<Proportions>>> = {
  raccoon: { headR: 9.5, neck: 1, torsoW: 17, torsoH: 15, hip: 15, upperArm: 7, lowerArm: 7, handR: 3.3, upperLeg: 7, lowerLeg: 7, footL: 7.5, armR: 3.4, legR: 3.8, footH: 4, shoulderX: 1, hipX: 3, bulge: 0.35, neckR: 4.2 },
  dog: { headR: 10.5, neck: 1, torsoW: 22, torsoH: 16, hip: 18, upperArm: 7, lowerArm: 7, handR: 4, upperLeg: 6.5, lowerLeg: 6.5, footL: 8, armR: 4.6, legR: 4.8, footH: 4, shoulderX: 2, hipX: 4, bulge: 0.4, neckR: 6 },
  rat: { headR: 9, neck: 1, torsoW: 15, torsoH: 14, hip: 13, upperArm: 6, lowerArm: 6, handR: 3, upperLeg: 6, lowerLeg: 6, footL: 7, armR: 2.8, legR: 3.2, footH: 3.5, shoulderX: 1, hipX: 3, bulge: 0.3, neckR: 3.5 },
};

function earsPath(ctx: Ctx, r: number, L: CritterLook, far: boolean): void {
  ctx.beginPath();
  if (L.kind === 'dog') return;
  const big = L.kind === 'rat' ? 0.5 : 0.36;
  const x = far ? -0.62 * r : 0.3 * r, y = far ? -0.72 * r : -0.84 * r;
  ctx.ellipse(x, y, big * r, big * r * 1.05, 0, 0, Math.PI * 2);
}

const headHook: Hook = (ctx, rig, pose) => {
  const L = lookOf(rig), r = rig.p.headR;
  // far ear
  earsPath(ctx, r, L, true);
  if (L.kind !== 'dog') {
    celPath(ctx, rig, rig.paletteFar.skin, -0.6 * r, -0.7 * r, r * 0.4, 0.4, 0);
    if (!rig.override) { ctx.beginPath(); ctx.ellipse(-0.6 * r, -0.7 * r, 0.2 * r, 0.22 * r, 0, 0, Math.PI * 2); ctx.fillStyle = shade(L.kind === 'rat' ? '#f0a3ae' : L.furDark, 0.8); ctx.fill(); }
  }
  // skull + near ear + snout as one shape
  ctx.beginPath();
  ctx.ellipse(0, 0.02 * r, 1.05 * r, 0.92 * r, 0, 0, Math.PI * 2);
  if (L.kind !== 'dog') { const big = L.kind === 'rat' ? 0.5 : 0.36; ctx.moveTo(0.3 * r + big * r, -0.84 * r); ctx.ellipse(0.3 * r, -0.84 * r, big * r, big * r * 1.05, 0, 0, Math.PI * 2); }
  if (L.kind === 'rat') {
    ctx.moveTo(0.5 * r, -0.2 * r); ctx.lineTo(1.75 * r, 0.32 * r); ctx.lineTo(0.55 * r, 0.62 * r); ctx.closePath();
  } else if (L.kind === 'dog') {
    // wide jowls: the bulldog's whole face
    ctx.moveTo(0.2 * r, 0.05 * r);
    ctx.ellipse(0.55 * r, 0.42 * r, 0.72 * r, 0.52 * r, 0, -Math.PI, Math.PI);
  } else {
    ctx.moveTo(0.55 * r, 0.0);
    ctx.ellipse(0.82 * r, 0.32 * r, 0.42 * r, 0.3 * r, -0.2, -Math.PI, Math.PI);
  }
  celPath(ctx, rig, L.fur, -0.1 * r, -0.1 * r, 1.05 * r, 0.3, 0.3);
  if (rig.override) return;
  // inner near ear
  if (L.kind !== 'dog') {
    ctx.beginPath(); ctx.ellipse(0.3 * r, -0.84 * r, (L.kind === 'rat' ? 0.3 : 0.2) * r, (L.kind === 'rat' ? 0.32 : 0.22) * r, 0, 0, Math.PI * 2);
    ctx.fillStyle = L.kind === 'rat' ? '#f6b3bd' : L.furDark; ctx.fill();
  }
  // markings
  if (L.kind === 'raccoon') {
    // the bandit mask: a dark band over both eyes, pale fur above and below it
    ctx.fillStyle = L.belly;
    ctx.beginPath(); ctx.ellipse(0.62 * r, 0.3 * r, 0.5 * r, 0.32 * r, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = L.furDark;
    ctx.beginPath();
    ctx.moveTo(-0.62 * r, -0.12 * r); ctx.quadraticCurveTo(0.1 * r, -0.42 * r, 0.82 * r, -0.2 * r);
    ctx.lineTo(0.9 * r, 0.06 * r); ctx.quadraticCurveTo(0.1 * r, 0.12 * r, -0.56 * r, 0.22 * r); ctx.closePath(); ctx.fill();
    // a black beanie
    ctx.fillStyle = '#26212e';
    ctx.beginPath(); ctx.ellipse(-0.05 * r, -0.66 * r, 0.98 * r, 0.42 * r, -0.08, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(R(-1.0 * r), R(-0.68 * r), R(1.98 * r), 2);
  } else if (L.kind === 'dog') {
    ctx.fillStyle = L.belly;
    ctx.beginPath(); ctx.ellipse(0.6 * r, 0.5 * r, 0.6 * r, 0.4 * r, 0, 0, Math.PI * 2); ctx.fill();
    // brow patch over the near eye
    ctx.fillStyle = L.furDark;
    ctx.beginPath(); ctx.ellipse(0.32 * r, -0.28 * r, 0.32 * r, 0.24 * r, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = L.belly;
    ctx.beginPath(); ctx.ellipse(0.9 * r, 0.42 * r, 0.5 * r, 0.16 * r, 0.3, 0, Math.PI * 2); ctx.fill();
  }
  // floppy dog ears hang over the sides of the head
  if (L.kind === 'dog') {
    for (const far of [true, false]) {
      ctx.beginPath();
      const x = far ? -0.78 * r : -0.08 * r;
      ctx.moveTo(x, -0.78 * r); ctx.quadraticCurveTo(x - 0.5 * r, -0.4 * r, x - 0.32 * r, 0.25 * r);
      ctx.quadraticCurveTo(x + 0.1 * r, 0.05 * r, x + 0.32 * r, -0.62 * r); ctx.closePath();
      celPath(ctx, rig, far ? shade(L.furDark, 0.85) : L.furDark, x, -0.3 * r, r * 0.4, 0.4, 0);
    }
  }
  face(ctx, rig, r, L, pose.face | 0);
};

function face(ctx: Ctx, rig: Rig, r: number, L: CritterLook, f: number): void {
  const ink = L.outline;
  const ey = R(-0.14 * r);
  const eyes = [[0.36 * r, 2.2], [-0.18 * r, 1.7]] as const;
  for (const [ex, er] of eyes) {
    if (f === 5) { // dazed: spirals
      ctx.strokeStyle = L.kind === 'raccoon' ? '#ffffff' : ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ex, ey, er + 0.6, 0, Math.PI * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, er * 0.4, Math.PI, Math.PI * 2.4); ctx.stroke();
      continue;
    }
    if (f === 2) { // hurt: squeezed
      ctx.strokeStyle = L.kind === 'raccoon' ? '#ffffff' : ink; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(ex - er, ey - 1.5); ctx.lineTo(ex + er, ey); ctx.lineTo(ex - er, ey + 1.5); ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(ex, ey, er + 0.5, er + 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16101c';
    ctx.beginPath(); ctx.arc(ex + 0.7, ey + 0.4, er * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(R(ex), R(ey - 1), 1, 1);
  }
  if (f !== 5 && f !== 2) {
    // a grumpy brow: these are the bad guys
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0.1 * r, ey - 4.5); ctx.lineTo(0.62 * r, ey - 2.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.36 * r, ey - 3.6); ctx.lineTo(-0.02 * r, ey - 2.8); ctx.stroke();
  }
  // nose and mouth
  ctx.fillStyle = L.nose;
  if (L.kind === 'rat') {
    ctx.beginPath(); ctx.arc(1.72 * r, 0.32 * r, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(R(1.25 * r), R(0.55 * r), 2, 2); // buck teeth
  } else if (L.kind === 'dog') {
    ctx.beginPath(); ctx.ellipse(1.02 * r, 0.12 * r, 2.4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0.5 * r, 0.62 * r); ctx.quadraticCurveTo(0.8 * r, 0.5 * r, 1.08 * r, 0.62 * r); ctx.stroke();
    if (f !== 5) { ctx.fillStyle = '#ffffff'; ctx.fillRect(R(0.62 * r), R(0.52 * r), 1, 2); ctx.fillRect(R(0.95 * r), R(0.52 * r), 1, 2); } // under-bite fangs
  } else {
    ctx.beginPath(); ctx.ellipse(1.18 * r, 0.22 * r, 1.8, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0.7 * r, 0.55 * r); ctx.lineTo(1.0 * r, 0.5 * r); ctx.stroke();
  }
  // whiskers
  ctx.strokeStyle = L.kind === 'dog' ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  const wx = L.kind === 'rat' ? 1.3 * r : 0.95 * r;
  ctx.moveTo(wx, 0.32 * r); ctx.lineTo(wx + 0.6 * r, 0.18 * r);
  ctx.moveTo(wx, 0.42 * r); ctx.lineTo(wx + 0.6 * r, 0.52 * r);
  ctx.stroke();
}

const torsoHook: Hook = (ctx, rig) => {
  const L = lookOf(rig), W = rig.p.torsoW, H = rig.p.torsoH, hp = rig.p.hip;
  const pts = [-W / 2 + 1, -H + 2, -W / 2 + 5, -H - 1, W / 2 - 5, -H - 1, W / 2, -H + 3, W / 2 + 1, -H * 0.42, hp / 2 + 1, 2, -hp / 2 - 1, 2, -W / 2 - 1, -H * 0.5];
  const shirt = L.kind === 'raccoon' ? '#f4f1f6' : L.fur;
  pathRoundedPoly(ctx, pts, 3);
  celPath(ctx, rig, shirt, 0, -H / 2, Math.max(W, H) * 0.6, 0.34, 0.3);
  if (rig.override) return;
  ctx.save(); pathRoundedPoly(ctx, pts, 3); ctx.clip();
  if (L.kind === 'raccoon') {
    // the burglar's stripes
    ctx.fillStyle = '#2b2633';
    for (let y = -H + 2; y < 2; y += 5) ctx.fillRect(-W, R(y), W * 2, 2.5);
  } else {
    ctx.fillStyle = L.belly;
    ctx.beginPath(); ctx.ellipse(W * 0.22, -H * 0.4, W * 0.3, H * 0.38, -0.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (L.kind === 'dog') {
    // spiked collar
    ctx.beginPath(); ctx.rect(-W / 2 + 1, -H - 1, W - 2, 4);
    outlinePath(ctx, rig); ctx.fillStyle = '#d8343f'; ctx.fill();
    ctx.fillStyle = '#e6e9ef';
    for (let x = -W / 2 + 4; x < W / 2 - 2; x += 5) { ctx.beginPath(); ctx.moveTo(x - 1.6, -H - 1); ctx.lineTo(x, -H - 4); ctx.lineTo(x + 1.6, -H - 1); ctx.closePath(); ctx.fill(); }
  }
};

const hipsHook: Hook = (ctx, rig) => {
  const L = lookOf(rig), hw = rig.p.hip / 2;
  ctx.beginPath(); ctx.moveTo(-hw, -5); ctx.lineTo(hw, -5); ctx.lineTo(hw + 0.5, 3); ctx.quadraticCurveTo(0, 7, -hw - 0.5, 3); ctx.closePath();
  celPath(ctx, rig, L.kind === 'raccoon' ? '#3b4a7a' : L.fur, 0, 0, hw, 0.36, 0.2);
};

const handHook: Hook = (ctx, rig, _pose, info) => {
  const L = lookOf(rig), r = info.r, col = info.far ? info.pal.skin : (L.kind === 'raccoon' ? L.furDark : L.fur);
  ctx.beginPath(); ctx.ellipse(0.5 * r, 0, 1.1 * r, 0.95 * r, 0, 0, Math.PI * 2);
  celPath(ctx, rig, col, 0.5 * r, 0, r, 0.3, 0.3);
};

const footHook: Hook = (ctx, rig, _pose, info) => {
  const L = lookOf(rig), fl = info.w ?? 7, fh = info.h ?? 4;
  const col = info.far ? info.pal.skin : (L.kind === 'raccoon' ? L.furDark : L.kind === 'rat' ? '#f0a3ae' : L.fur);
  const top = -fh + 1, sole = 2.4, h = sole - top;
  ctx.beginPath();
  ctx.moveTo(-2.6 + h * 0.5, top); ctx.lineTo(fl - h * 0.55, top + 0.3);
  ctx.arc(fl - h * 0.55, top + h * 0.5 + 0.15, h * 0.5, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-2.6 + h * 0.5, sole);
  ctx.arc(-2.6 + h * 0.5, top + h * 0.5, h * 0.5, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  celPath(ctx, rig, col, fl * 0.3, -0.5, fl * 0.55, 0.3, 0.3);
};

function tail(): RigAccessory {
  return {
    attach: 'hip', layer: 'back',
    draw(ctx, rig) {
      const L = lookOf(rig), T = L.tail, n = 5, seg = T.len / n;
      const ch = getChain(rig, 'tail', n, { joint: 'torso', rest: [-1, 0], stiffness: 0.12, damping: 0.78, gain: 1.6, maxAng: 30 });
      let ang = 176, x = -rig.p.hip * 0.38, y = -2;
      const px = [x], py = [y], pr = [T.r0];
      for (let i = 0; i < n; i++) {
        ang += T.curl + ch.ang[i] + Math.sin(rig.tick * 0.08 + i) * (L.kind === 'dog' ? 14 : 4);
        x += Math.cos(ang * D2R) * seg; y += Math.sin(ang * D2R) * seg;
        px.push(x); py.push(y); pr.push(T.r0 + (T.r1 - T.r0) * ((i + 1) / n));
      }
      const col = T.color || L.fur;
      ctx.beginPath();
      for (let i = 0; i < n; i++) pathTaperedCapsule(ctx, px[i], py[i], px[i + 1], py[i + 1], pr[i], pr[i + 1], true);
      outlinePath(ctx, rig); ctx.fillStyle = rig.col(col); ctx.fill();
      if (rig.override || !T.rings) return;
      ctx.save(); ctx.clip();
      ctx.strokeStyle = T.rings; ctx.lineWidth = 3;
      for (let i = 1; i <= n; i += 2) {
        const a = Math.atan2(py[i] - py[i - 1], px[i] - px[i - 1]) + Math.PI / 2, rr = pr[i] + 2;
        ctx.beginPath(); ctx.moveTo(px[i] - Math.cos(a) * rr, py[i] - Math.sin(a) * rr); ctx.lineTo(px[i] + Math.cos(a) * rr, py[i] + Math.sin(a) * rr); ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/** The raccoon's loot sack, slung over its back. */
const sack: RigAccessory = {
  attach: 'torso', layer: 'back',
  draw(ctx, rig) {
    const H = rig.p.torsoH;
    ctx.beginPath(); ctx.ellipse(-8, -H * 0.55, 7, 8, -0.3, 0, Math.PI * 2);
    ctx.moveTo(-4, -H * 0.55 - 7); ctx.lineTo(0, -H - 3); ctx.lineTo(-1, -H * 0.55 - 9); ctx.closePath();
    celPath(ctx, rig, '#b98a52', -8, -H * 0.55, 8, 0.4, 0.3);
    if (!rig.override) { ctx.fillStyle = '#ffd54a'; ctx.fillRect(-10, R(-H * 0.6), 3, 3); }
  },
};

export function buildCritter(kind: CritterKind): Rig {
  const L = LOOKS[kind];
  const palette: Palette = { skin: L.fur, hair: L.furDark, primary: L.fur, secondary: kind === 'raccoon' ? '#3b4a7a' : L.fur, sleeve: kind === 'raccoon' ? '#f4f1f6' : L.fur, accent: '#ffcb3d', metal: '#cfd6e2', dark: L.outline, glow: '#ffffff', belly: L.belly };
  const accessories: RigAccessory[] = [tail()];
  if (kind === 'raccoon') accessories.push(sack);
  const build: CritterBuild = {
    critter: L, basePalette: palette, proportions: PROPS[kind], scale: L.scale, outline: L.outline,
    parts: { head: headHook, torso: torsoHook, hips: hipsHook, hand: handHook, foot: footHook, face: () => {} },
    accessories, thinR: 4, hiMin: 6, flatR: 2.5, ramp: { hi: 1.14, sh: 0.78, rim: 1.4 },
  };
  return buildRig(build);
}

// ---------------------------------------------------------------- critter animations

function critterAnims(kind: CritterKind): AnimSet {
  const p = { ...DEFAULT_PROPORTIONS, ...PROPS[kind] } as Proportions;
  const hipY = -(p.upperLeg + p.lowerLeg + p.footH - 2);
  const ankle = (u: number, l: number) => hipY + Math.cos(u * D2R) * p.upperLeg + Math.cos((u + l) * D2R) * p.lowerLeg;
  const G = (s: PoseSpec & { legR?: [number, number]; legL?: [number, number] }, lift = 0): PartialPose => {
    const lr = s.legR || [0, 0], ll = s.legL || [0, 0];
    const y = -(p.footH - 2) - Math.max(ankle(lr[0], lr[1]), ankle(ll[0], ll[1])) - lift;
    const root = (s.root as number[] | undefined) || [0, 0, 0];
    return P({ ...s, root: [root[0], y + (root[1] || 0), root[2] || 0] });
  };
  const anim = (loop: boolean, frames: [number, PartialPose][]): Anim => ({ loop, frames: frames.map(([dur, pose]) => ({ dur, pose })) });
  const sneak = kind === 'raccoon' ? 18 : kind === 'rat' ? 24 : 6;
  return {
    idle: anim(true, [[30, G({ armR: [20, 40], armL: [-10, 30], torso: sneak * 0.5 })], [30, G({ armR: [24, 44], armL: [-8, 34], torso: sneak * 0.5 + 2, squash: 0.985 })]]),
    walk: anim(true, [
      [9, G({ legR: [26, -16], legL: [-20, -10], armR: [40, 60], armL: [30, 70], torso: sneak, head: -sneak * 0.6 })],
      [9, G({ legR: [4, -8], legL: [-6, -36], armR: [36, 60], armL: [26, 70], torso: sneak, head: -sneak * 0.6 }, 1)],
      [9, G({ legR: [-20, -10], legL: [26, -16], armR: [30, 70], armL: [40, 60], torso: sneak, head: -sneak * 0.6 })],
      [9, G({ legR: [-6, -36], legL: [4, -8], armR: [26, 70], armL: [36, 60], torso: sneak, head: -sneak * 0.6 }, 1)],
    ]),
    run: anim(true, [
      [5, G({ legR: [44, -24], legL: [-38, -30], armR: [-50, 80], armL: [50, 70], torso: 16, head: -12 })],
      [5, G({ legR: [6, -18], legL: [34, -118], armR: [-8, 70], armL: [8, 70], torso: 14, head: -10 }, 2)],
      [5, G({ legR: [-38, -30], legL: [44, -24], armR: [50, 70], armL: [-50, 80], torso: 16, head: -12 })],
      [5, G({ legR: [34, -118], legL: [6, -18], armR: [8, 70], armL: [-8, 70], torso: 14, head: -10 }, 2)],
    ]),
    bark: anim(false, [[8, G({ torso: -8, head: -14, armR: [60, 60], armL: [50, 60] })], [8, G({ torso: 6, head: 6, armR: [70, 40], armL: [60, 40], squash: 1.05 })], [8, G({ torso: -8, head: -14, armR: [60, 60], armL: [50, 60] })]]),
    bonked: anim(true, [
      [8, G({ root: [0, 0, -8], torso: -6, head: -12, armR: [50, 40], armL: [30, 40], face: 5 })],
      [8, G({ root: [0, 0, 8], torso: 6, head: 10, armR: [30, 40], armL: [50, 40], face: 5 })],
    ]),
    flee: anim(true, [
      [5, G({ legR: [44, -24], legL: [-38, -30], armR: [160, 20], armL: [150, 20], torso: 10, head: -16, face: 2 })],
      [5, G({ legR: [-38, -30], legL: [44, -24], armR: [150, 20], armL: [160, 20], torso: 10, head: -14, face: 2 }, 2)],
    ]),
    hop: anim(false, [[6, G({ legR: [40, -80], legL: [30, -70], squash: 1.1 })], [12, P({ root: [0, -2, 0], legR: [30, -60], legL: [20, -50], armR: [120, 20], armL: [110, 20] })]]),
  };
}

const animCache = new Map<CritterKind, AnimSet>();
export function anims(kind: CritterKind): AnimSet {
  let a = animCache.get(kind);
  if (!a) { a = critterAnims(kind); animCache.set(kind, a); }
  return a;
}

export { celBall, tones };
