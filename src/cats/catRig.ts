// Cats on the engine's paper-doll rig (src/lib/art/rig.ts).
//
// The rig is a humanoid, and these are the kind of cats that stand up to do karate and wear armour,
// so the skeleton is used as it is: what changes is every part drawn on it. Each hook below is
// called by rig.ts in that part's own local space (see the LIMB SPACE note at the top of rig.ts),
// and every fill goes through `rig.col()` so the hit flash still whites the whole cat out.
//
//   head      skull + cheek fur + the near ear as ONE outlined shape (the far ear behind it), then
//             markings clipped inside it, then the muzzle -- the engine's "one path, stroked once"
//             rule from drawSkull, applied to a cat's head
//   face      big eyes in fourteen expressions, a nose, a ":3" mouth, whiskers, glasses
//   torso     a soft bean of a body with a belly patch, and the outfit over it
//   hips      fur, a champion's belt, a karate belt, or a knight's tassets
//   hand/foot round paws (sneakers and sabatons where the outfit says so)
//   tail      an accessory in the back layer, swung by a secondary-motion chain (src/lib/art/secondary.ts)
//             so it lags and swishes when the cat moves, plus an idle sway of its own
import { buildRig, type Rig, type RigBuild, type RigAccessory, type Proportions } from '../lib/art/rig.ts';
import { makePose, type Pose } from '../lib/art/poses.ts';
import type { Info, PartHook } from '../lib/art/rigParts.ts';

type Hook = PartHook<Rig>;
import { celPath, celBall, tones, outlinePath, LIGHT_X, LIGHT_Y } from '../lib/art/shading.ts';
import { pathTaperedCapsule, pathRoundedPoly } from '../lib/art/shapes.ts';
import { shade, mix, type Palette } from '../lib/art/palettes.ts';
import { getChain } from '../lib/art/secondary.ts';
import type { CatId } from '../core/save.ts';
import { LOOKS, type CatLook } from './look.ts';

type Ctx = CanvasRenderingContext2D;

/** Expressions. The first eight are the engine's FACE indices; the rest are the cats' own. */
export const CF = Object.freeze({
  neutral: 0, angry: 1, hurt: 2, happy: 3, shout: 4, dazed: 5, grit: 6, closed: 7,
  surprised: 8, smug: 9, hungry: 10, lick: 11, wink: 12, calm: 13,
});

export interface CatBuild extends RigBuild {
  cat: CatLook;
}

/** A built cat: the engine rig plus the few bits of mood the game sets before each draw. */
export interface CatRig extends Rig {
  build: CatBuild;
  /** -1 droops the tail, +1 holds it high and happy. */
  tailLift: number;
  /** 0..1: how soaked the cat is. Wet fur is darker and the ears and tail droop. */
  wet: number;
  /** Offsets the blink timer so six cats on one screen do not blink in unison. */
  blinkSeed: number;
  /** Force the eyes shut regardless of expression (sleeping inside the playhouse). */
  sleepy: boolean;
}

const R = Math.round;
const D2R = Math.PI / 180;

function lookOf(rig: Rig): CatLook { return (rig.build as CatBuild).cat; }
function catOf(rig: Rig): CatRig { return rig as CatRig; }

/** Fur colour, darkened as the cat gets wet. */
function furOf(rig: Rig, hex: string): string {
  const w = catOf(rig).wet || 0;
  return w > 0.01 ? mix(hex, shade(hex, 0.62), Math.min(1, w)) : hex;
}

// ---------------------------------------------------------------- proportions

const BASE: Partial<Proportions> = {
  headR: 10.5, neck: 1, torsoW: 17, torsoH: 15, hip: 15, upperArm: 7, lowerArm: 7, handR: 3.4,
  upperLeg: 7, lowerLeg: 7, footL: 7.5, armR: 3.4, legR: 3.8, footH: 4, shoulderX: 1, hipX: 3,
  bulge: 0.35, neckR: 4.2,
};

export const PROPORTIONS: Readonly<Record<CatId, Partial<Proportions>>> = {
  crush: { ...BASE, torsoW: 21, torsoH: 16, hip: 17, armR: 4.5, legR: 4.6, handR: 4.2, upperArm: 7.5, lowerArm: 7.5, neckR: 5, shoulderX: 2, hipX: 3.5, footL: 8.5 },
  sprout: { ...BASE, headR: 11, torsoW: 15, torsoH: 13, hip: 13, upperArm: 6, lowerArm: 6, handR: 3.1, upperLeg: 6, lowerLeg: 6, armR: 3, legR: 3.4, footL: 6.5 },
  sly: { ...BASE, headR: 10, torsoW: 15, torsoH: 16, hip: 13, upperLeg: 8, lowerLeg: 8, armR: 3.0, legR: 3.4, upperArm: 7.5, lowerArm: 7.5 },
  biscuit: { ...BASE, torsoW: 16.5, hip: 14.5, upperLeg: 7.5, lowerLeg: 7.5 },
  truffle: { ...BASE, headR: 10.8, torsoW: 16, torsoH: 14, hip: 15, upperLeg: 7.5, footL: 9, footH: 4.5 },
  pendragon: { ...BASE, torsoW: 18, torsoH: 16, hip: 15.5, armR: 3.6, legR: 4, footL: 8 },
};

// ---------------------------------------------------------------- small path helpers

/**
 * A triangle with a rounded apex, appended as a new subpath. Always wound CLOCKWISE, like the skull's
 * ellipse: these are unioned into one path and filled with the nonzero rule, and a subpath wound the
 * other way cancels the fill where it overlaps -- a hole, with the stroke showing through it.
 */
function triSub(ctx: Ctx, ax: number, ay: number, tx: number, ty: number, bx: number, by: number, rr: number): void {
  if ((tx - ax) * (by - ay) - (ty - ay) * (bx - ax) < 0) { const x = ax, y = ay; ax = bx; ay = by; bx = x; by = y; }
  ctx.moveTo(ax, ay);
  ctx.arcTo(tx, ty, bx, by, rr);
  ctx.lineTo(bx, by);
  ctx.closePath();
}

interface EarGeom { ax: number; ay: number; tx: number; ty: number; bx: number; by: number }

function earGeom(r: number, L: CatLook, far: boolean, droop: number): EarGeom {
  const e = L.ear;
  if (far) {
    return { ax: -0.9 * r, ay: -0.32 * r, tx: (-0.78 - droop * 0.5) * r, ty: (-1.34 * e + droop * 0.75) * r, bx: -0.22 * r, by: -0.86 * r };
  }
  return { ax: 0.14 * r, ay: -0.84 * r, tx: (0.68 + droop * 0.45) * r, ty: (-1.36 * e + droop * 0.75) * r, bx: 0.88 * r, by: -0.38 * r };
}

function earSub(ctx: Ctx, g: EarGeom, rr: number): void { triSub(ctx, g.ax, g.ay, g.tx, g.ty, g.bx, g.by, rr); }

/** The inner ear: the same triangle pulled toward its own centre. */
function innerEarSub(ctx: Ctx, g: EarGeom, k: number): void {
  const cx = (g.ax + g.tx + g.bx) / 3, cy = (g.ay + g.ty + g.by) / 3;
  const p = (x: number, y: number): [number, number] => [x + (cx - x) * k, y + (cy - y) * k];
  const a = p(g.ax, g.ay), t = p(g.tx, g.ty), b = p(g.bx, g.by);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1] + 1); ctx.lineTo(t[0], t[1]); ctx.lineTo(b[0], b[1] + 1); ctx.closePath();
}

/** The skull, the near ear and the cheek tufts as one path: one outline around the whole head. */
function headSub(ctx: Ctx, r: number, L: CatLook, droop: number): void {
  ctx.beginPath();
  ctx.ellipse(0, 0.04 * r, 1.1 * r, 0.93 * r, 0, 0, Math.PI * 2);
  earSub(ctx, earGeom(r, L, false, droop), 1.4);
  const c = L.cheeks;
  if (c > 0) {
    // back cheek: two little points of fur below and behind the ear line
    triSub(ctx, -0.98 * r, 0.05 * r, -(1.16 + 0.22 * c) * r, 0.36 * r, -0.86 * r, 0.42 * r, 0.6);
    triSub(ctx, -0.9 * r, 0.38 * r, -(1.02 + 0.2 * c) * r, 0.66 * r, -0.62 * r, 0.7 * r, 0.6);
    // front cheek, under the muzzle
    triSub(ctx, 0.56 * r, 0.7 * r, (0.86 + 0.14 * c) * r, (0.86 + 0.1 * c) * r, 0.92 * r, 0.42 * r, 0.6);
  }
}

// ---------------------------------------------------------------- head

const headHook: Hook = (ctx, rig, _pose, info) => {
  const L = lookOf(rig), r = info.r, cat = catOf(rig);
  const droop = Math.min(1, cat.wet * 1.2);
  const fur = furOf(rig, L.fur), furFar = furOf(rig, rig.paletteFar.skin);
  // far ear, behind everything
  const gf = earGeom(r, L, true, droop);
  ctx.beginPath(); earSub(ctx, gf, 1.4);
  celPath(ctx, rig, furFar, (gf.ax + gf.bx) / 2, gf.ty * 0.7, r * 0.45, 0.45, 0);
  if (!rig.override) {
    innerEarSub(ctx, gf, 0.38);
    ctx.fillStyle = shade(L.pattern === 'point' ? L.furDark : L.innerEar, 0.72); ctx.fill();
  }
  // skull + near ear + cheeks
  headSub(ctx, r, L, droop);
  celPath(ctx, rig, fur, -0.15 * r, -0.1 * r, 1.1 * r, 0.3, 0.34);
  if (rig.override) return;
  ctx.save();
  headSub(ctx, r, L, droop);
  ctx.clip();
  markings(ctx, rig, r, L, droop);
  // muzzle and chin: lighter fur, no outline of its own -- a colour change inside the head shape
  const belly = furOf(rig, L.belly);
  ctx.fillStyle = belly;
  ctx.beginPath();
  if (L.pattern === 'mitts') {
    ctx.ellipse(0.5 * r, 0.42 * r, 0.62 * r, 0.44 * r, -0.1, 0, Math.PI * 2);
    ctx.moveTo(0.3 * r, 0.1 * r); ctx.lineTo(0.42 * r, -0.62 * r); ctx.lineTo(0.62 * r, 0.1 * r); // a blaze up the nose
  } else {
    ctx.ellipse(0.52 * r, 0.4 * r, 0.46 * r, 0.33 * r, -0.12, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  // near inner ear, drawn over the outline's inner half
  const gn = earGeom(r, L, false, droop);
  innerEarSub(ctx, gn, 0.36);
  ctx.fillStyle = L.innerEar; ctx.fill();
  if (L.pattern === 'point') {
    // Sprout's ear tips are dark: a Siamese kitten's points
    ctx.save(); ctx.beginPath(); earSub(ctx, gn, 1.4); ctx.clip();
    ctx.fillStyle = L.furDark; ctx.beginPath(); ctx.arc(gn.tx, gn.ty, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
};

function markings(ctx: Ctx, rig: Rig, r: number, L: CatLook, droop: number): void {
  const dark = furOf(rig, L.furDark);
  ctx.fillStyle = dark;
  if (L.pattern === 'tabby') {
    // three forehead stripes, the middle one longest: an "M" read from a distance
    for (const [x, len] of [[-0.3, 0.32], [0.04, 0.42], [0.36, 0.3]] as const) {
      ctx.beginPath();
      ctx.moveTo((x - 0.08) * r, -0.98 * r);
      ctx.lineTo((x + 0.08) * r, -0.98 * r);
      ctx.lineTo((x + 0.02) * r, (-0.98 + len) * r);
      ctx.lineTo((x - 0.02) * r, (-0.98 + len) * r);
      ctx.closePath(); ctx.fill();
    }
    // cheek stripes at the back of the head
    for (const y of [0.0, 0.26]) {
      ctx.beginPath();
      ctx.moveTo(-1.15 * r, (y - 0.06) * r); ctx.lineTo(-0.62 * r, (y + 0.02) * r); ctx.lineTo(-1.15 * r, (y + 0.1) * r);
      ctx.closePath(); ctx.fill();
    }
  } else if (L.pattern === 'point') {
    // a soft mask around the eyes and nose
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.ellipse(0.48 * r, 0.12 * r, 0.42 * r, 0.3 * r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (L.pattern === 'solid') {
    // a black cat's sheen: one cool highlight arc across the crown
    ctx.strokeStyle = shade('#6f6a9c', droop > 0.3 ? 0.7 : 1);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-0.05 * r, 0.25 * r, 0.95 * r, -2.35, -1.25); ctx.stroke();
  } else if (L.pattern === 'mitts') {
    // a darker cap over the top of the head
    ctx.beginPath(); ctx.ellipse(-0.25 * r, -0.85 * r, 0.8 * r, 0.32 * r, 0.15, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- face

function blinking(rig: Rig): boolean {
  const t = (rig.tick + catOf(rig).blinkSeed) % 230;
  return t < 7 || (t > 14 && t < 19 && catOf(rig).blinkSeed % 3 === 0);
}

const faceHook: Hook = (ctx, rig, pose, info) => {
  const L = lookOf(rig), r = info.r, cat = catOf(rig);
  let face = pose.face | 0;
  if (cat.sleepy) face = CF.closed;
  if (face === CF.neutral && L.calm) face = CF.calm;
  if ((face === CF.neutral || face === CF.calm || face === CF.smug) && blinking(rig)) face = CF.closed;
  const ink = rig.col(L.outline);
  const ey = R(-0.12 * r);
  const nx = 0.38 * r, fx = -0.24 * r;           // near and far eye centres
  drawEye(ctx, rig, L, nx, ey, 2.7, 3.2, face, true);
  drawEye(ctx, rig, L, fx, ey, 1.9, 3.0, face, false);
  // nose: a small rounded triangle at the front of the muzzle
  const nnx = 0.86 * r, nny = 0.18 * r;
  ctx.fillStyle = rig.col(L.nose);
  ctx.beginPath(); ctx.moveTo(nnx - 2, nny - 1); ctx.lineTo(nnx + 1.6, nny - 1.2); ctx.lineTo(nnx, nny + 1.4); ctx.closePath(); ctx.fill();
  if (!rig.override) { ctx.fillStyle = '#ffffff'; ctx.fillRect(R(nnx - 1), R(nny - 1), 1, 1); }
  drawMouth(ctx, rig, L, nnx - 0.6, nny + 1.6, face, ink);
  // whiskers: two on the near cheek, two peeking out behind the far one
  if (!rig.override) {
    const droop = cat.wet * 2;
    ctx.strokeStyle = L.whisker; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.82 * r, 0.36 * r); ctx.lineTo(1.5 * r, (0.2 + droop * 0.1) * r);
    ctx.moveTo(0.82 * r, 0.46 * r); ctx.lineTo(1.48 * r, (0.6 + droop * 0.12) * r);
    ctx.moveTo(-1.08 * r, 0.28 * r); ctx.lineTo(-1.42 * r, (0.18 + droop * 0.1) * r);
    ctx.moveTo(-1.08 * r, 0.4 * r); ctx.lineTo(-1.4 * r, (0.48 + droop * 0.1) * r);
    ctx.stroke();
  }
  // rosy cheeks when happy
  if (!rig.override && (face === CF.happy || face === CF.wink || face === CF.hungry || face === CF.lick)) {
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    ctx.beginPath(); ctx.ellipse(0.12 * r, 0.42 * r, 2.2, 1.3, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (L.outfit === 'scholar') drawGlasses(ctx, rig, nx, ey, fx);
};

function drawEye(ctx: Ctx, rig: Rig, L: CatLook, cx: number, cy: number, rx: number, ry: number, face: number, near: boolean): void {
  const ink = rig.col(L.outline);
  const shut = (shape: 'happy' | 'closed' | 'squeeze') => {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath();
    if (shape === 'happy') ctx.arc(cx, cy + 1.2, rx * 0.95, Math.PI * 1.12, Math.PI * 1.88);
    else if (shape === 'closed') ctx.arc(cx, cy - 0.6, rx * 0.9, Math.PI * 0.15, Math.PI * 0.85);
    else { const d = near ? -1 : 1; ctx.moveTo(cx - rx * d, cy - 1.8); ctx.lineTo(cx + rx * d * 0.8, cy); ctx.lineTo(cx - rx * d, cy + 1.8); }
    ctx.stroke();
  };
  if (face === CF.happy || (face === CF.wink && near)) { shut('happy'); return; }
  if (face === CF.closed || face === CF.lick) { shut('closed'); return; }
  if (face === CF.hurt) { shut('squeeze'); return; }
  if (face === CF.dazed) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, rx * 0.95, 0, Math.PI * 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 0.3, cy, rx * 0.4, Math.PI, Math.PI * 2.5); ctx.stroke();
    return;
  }
  const wide = face === CF.surprised || face === CF.shout ? 1.18 : face === CF.hungry ? 1.1 : 1;
  const erx = rx * wide, ery = ry * wide;
  // socket rim, iris, pupil, light
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(cx, cy, erx + 0.9, ery + 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rig.col(L.eye);
  ctx.beginPath(); ctx.ellipse(cx, cy, erx, ery, 0, 0, Math.PI * 2); ctx.fill();
  if (rig.override) return;
  ctx.fillStyle = shade(L.eye, 1.25);
  ctx.beginPath(); ctx.ellipse(cx, cy + ery * 0.45, erx * 0.7, ery * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  const look = near ? 0.55 : 0.35;
  const small = face === CF.surprised || face === CF.angry || face === CF.shout;
  const big = face === CF.hungry;
  const pw = small ? 0.75 : big ? 1.55 : 1.05, ph = small ? 1.3 : big ? 2.5 : 2.2;
  ctx.fillStyle = '#140d1c';
  ctx.beginPath(); ctx.ellipse(cx + look, cy + 0.2, pw, ph, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(R(cx - erx * 0.45), R(cy - ery * 0.55), near ? 2 : 1, near ? 2 : 1);
  if (big) ctx.fillRect(R(cx + erx * 0.25), R(cy + ery * 0.3), 1, 1);
  // lids: drawn in fur over the top of the eye, with an ink edge
  let lid = 0, slant = 0;
  if (face === CF.angry) { lid = 0.42; slant = near ? -1 : 1; }
  else if (face === CF.grit) lid = 0.5;
  else if (face === CF.smug || face === CF.calm) lid = 0.48;
  if (lid > 0) {
    const top = cy - ery - 1.2, edge = cy - ery + ery * 2 * lid;
    ctx.fillStyle = rig.col(furOf(rig, near ? L.fur : rig.paletteFar.skin));
    ctx.beginPath();
    ctx.moveTo(cx - erx - 1.5, top); ctx.lineTo(cx + erx + 1.5, top);
    ctx.lineTo(cx + erx + 1.5, edge + slant * 1.6); ctx.lineTo(cx - erx - 1.5, edge - slant * 1.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - erx - 0.6, edge - slant * 1.4); ctx.lineTo(cx + erx + 0.6, edge + slant * 1.4); ctx.stroke();
  }
}

function drawMouth(ctx: Ctx, rig: Rig, L: CatLook, x: number, y: number, face: number, ink: string): void {
  const pink = rig.col('#ff7f9c');
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineCap = 'round';
  const w3 = () => { // the ":3" -- a little w under the nose
    ctx.beginPath();
    ctx.moveTo(x, y - 0.5); ctx.lineTo(x, y + 0.6);
    ctx.moveTo(x - 2.2, y + 0.2); ctx.quadraticCurveTo(x - 1.1, y + 2.2, x, y + 0.6);
    ctx.quadraticCurveTo(x + 1.1, y + 2.2, x + 2.2, y + 0.2);
    ctx.stroke();
  };
  switch (face) {
    case CF.happy: case CF.wink: case CF.hungry: {
      ctx.beginPath(); ctx.moveTo(x - 2.4, y + 0.4); ctx.quadraticCurveTo(x, y + 4.6, x + 2.4, y + 0.4); ctx.closePath(); ctx.fill();
      if (!rig.override) { ctx.fillStyle = pink; ctx.fillRect(R(x - 1), R(y + 2), 2, 1); }
      if (face === CF.hungry && !rig.override) { ctx.fillStyle = '#9fe0ff'; ctx.fillRect(R(x + 1), R(y + 3), 1, 3); ctx.fillRect(R(x + 0.5), R(y + 5.5), 2, 2); }
      break;
    }
    case CF.shout: case CF.surprised: {
      const big = face === CF.shout ? 1 : 0.6;
      ctx.beginPath(); ctx.ellipse(x, y + 2.2 * big, 1.8 * big + 0.6, 2.4 * big, 0, 0, Math.PI * 2); ctx.fill();
      if (!rig.override && face === CF.shout) {
        ctx.fillStyle = pink; ctx.fillRect(R(x - 1), R(y + 3), 2, 1);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(R(x - 2), R(y + 0.5), 1, 1); ctx.fillRect(R(x + 1), R(y + 0.5), 1, 1);
      }
      break;
    }
    case CF.hurt: case CF.dazed: {
      ctx.beginPath(); ctx.moveTo(x - 2.4, y + 2); ctx.lineTo(x - 1.2, y + 1); ctx.lineTo(x, y + 2); ctx.lineTo(x + 1.2, y + 1); ctx.lineTo(x + 2.4, y + 2); ctx.stroke();
      break;
    }
    case CF.angry: case CF.grit: {
      ctx.beginPath(); ctx.moveTo(x - 2.2, y + 2.2); ctx.lineTo(x + 2.2, y + 1.6); ctx.stroke();
      if (face === CF.grit && !rig.override) { ctx.fillStyle = '#ffffff'; ctx.fillRect(R(x - 1.5), R(y + 0.8), 3, 1); }
      break;
    }
    case CF.lick: {
      w3();
      if (!rig.override) { ctx.fillStyle = pink; ctx.beginPath(); ctx.ellipse(x + 0.6, y + 2.6, 1.3, 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case CF.smug: case CF.calm: {
      ctx.beginPath(); ctx.moveTo(x, y - 0.5); ctx.lineTo(x, y + 0.6);
      ctx.moveTo(x - 2.2, y + 0.6); ctx.quadraticCurveTo(x, y + 2.2, x + 2.4, y + 0.2); ctx.stroke();
      break;
    }
    default: w3();
  }
}

function drawGlasses(ctx: Ctx, rig: Rig, nx: number, ey: number, fx: number): void {
  const frame = rig.col('#3b2d57');
  ctx.strokeStyle = frame; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.ellipse(nx, ey, 4.3, 4.1, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(fx, ey, 3.0, 3.9, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fx + 3, ey - 1); ctx.quadraticCurveTo((nx + fx) / 2 + 0.3, ey - 2.6, nx - 4.3, ey - 1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fx - 3, ey - 1); ctx.lineTo(fx - 8, ey - 2.4); ctx.stroke();
  if (rig.override) return;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(R(nx + 1.5), R(ey - 3), 1, 2);
}

// ---------------------------------------------------------------- body

/** The torso: a soft bean, belly patch in front, outfit over it. Torso space: hip centre origin, y up negative. */
const torsoHook: Hook = (ctx, rig, pose, info) => {
  const L = lookOf(rig), W = info.w ?? rig.p.torsoW, H = info.h ?? rig.p.torsoH, hp = rig.p.hip;
  const pts = [-W / 2 + 1, -H + 2, -W / 2 + 5, -H - 1, W / 2 - 5, -H - 1, W / 2, -H + 3, W / 2 + 1, -H * 0.42, hp / 2 + 1, 2, -hp / 2 - 1, 2, -W / 2 - 1, -H * 0.5];
  const fur = furOf(rig, L.fur);
  const body = () => pathRoundedPoly(ctx, pts, 3);
  const coat = L.outfit === 'gi' ? '#f7f3ea' : fur;
  body();
  celPath(ctx, rig, coat, 0, -H / 2, Math.max(W, H) * 0.6, 0.34, 0.3);
  if (rig.override) return;
  ctx.save(); body(); ctx.clip();
  if (L.outfit === 'gi') {
    // the V of the lapels shows fur at the throat; the overlap is one ink line
    ctx.fillStyle = furOf(rig, L.belly);
    ctx.beginPath(); ctx.moveTo(-1, -H - 1); ctx.lineTo(W * 0.32, -H - 1); ctx.lineTo(W * 0.1, -H * 0.55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rig.col(L.outline); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-2, -H); ctx.lineTo(W * 0.1, -H * 0.55); ctx.lineTo(W * 0.38, -H * 0.18); ctx.stroke();
    ctx.strokeStyle = tones(rig, coat).sh;
    ctx.beginPath(); ctx.moveTo(-W * 0.3, -H * 0.8); ctx.lineTo(-W * 0.22, -H * 0.1); ctx.stroke();
  } else {
    // belly patch
    ctx.fillStyle = furOf(rig, L.belly);
    ctx.beginPath(); ctx.ellipse(W * 0.22, -H * 0.4, W * 0.3, H * (L.pattern === 'mitts' ? 0.5 : 0.38), -0.1, 0, Math.PI * 2); ctx.fill();
    if (L.pattern === 'tabby') {
      ctx.fillStyle = furOf(rig, L.furDark);
      for (let i = 0; i < 3; i++) {
        const y = -H * (0.25 + i * 0.24);
        ctx.beginPath(); ctx.moveTo(-W / 2 - 1, y - 1.6); ctx.lineTo(-W * 0.12, y + 0.4); ctx.lineTo(-W / 2 - 1, y + 1.6); ctx.closePath(); ctx.fill();
      }
    }
    if (L.outfit === 'champ') {
      // big chest: a shadow seam under the pecs
      ctx.strokeStyle = tones(rig, furOf(rig, L.belly)).sh; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W * 0.02, -H * 0.62); ctx.quadraticCurveTo(W * 0.2, -H * 0.5, W * 0.42, -H * 0.62); ctx.stroke();
    }
  }
  ctx.restore();
  if (L.outfit === 'knight') breastplate(ctx, rig, W, H);
  if (L.outfit === 'scholar') bowTie(ctx, rig, W, H);
  if (L.outfit === 'scarf') scarfWrap(ctx, rig, W, H);
};

function breastplate(ctx: Ctx, rig: Rig, W: number, H: number): void {
  const steel = '#cdd5e3', gold = '#f0c040';
  const pts = [-W / 2 + 2, -H + 1, W / 2 - 3, -H + 1, W / 2 + 1, -H * 0.55, W / 2 - 1, -H * 0.08, -W / 2 + 1, -H * 0.08, -W / 2 - 0.5, -H * 0.55];
  pathRoundedPoly(ctx, pts, 3);
  celPath(ctx, rig, steel, W * 0.1, -H * 0.6, W * 0.6, 0.32, 0.4);
  if (rig.override) return;
  ctx.fillStyle = gold;
  ctx.fillRect(R(-W / 2 + 3), R(-H + 1), R(W - 7), 2);
  ctx.fillRect(R(-W / 2 + 2), R(-H * 0.08 - 2), R(W - 3), 2);
  // the dragon crest: a red shield with a gold flame
  const sx = W * 0.16, sy = -H * 0.52;
  ctx.fillStyle = '#d8343f';
  ctx.beginPath(); ctx.moveTo(sx - 3.5, sy - 4); ctx.lineTo(sx + 3.5, sy - 4); ctx.lineTo(sx + 3.5, sy + 0.5); ctx.lineTo(sx, sy + 4.5); ctx.lineTo(sx - 3.5, sy + 0.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = gold;
  ctx.beginPath(); ctx.moveTo(sx, sy - 2.8); ctx.lineTo(sx + 1.6, sy + 0.6); ctx.lineTo(sx, sy + 2.6); ctx.lineTo(sx - 1.6, sy + 0.6); ctx.closePath(); ctx.fill();
}

function bowTie(ctx: Ctx, rig: Rig, W: number, H: number): void {
  const x = W * 0.16, y = -H + 1.5, green = '#3fae5a';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x - 4.5, y - 2.5); ctx.lineTo(x - 4.5, y + 2.5); ctx.closePath();
  ctx.moveTo(x, y); ctx.lineTo(x + 4.5, y - 2.5); ctx.lineTo(x + 4.5, y + 2.5); ctx.closePath();
  outlinePath(ctx, rig); ctx.fillStyle = rig.col(green); ctx.fill();
  if (rig.override) return;
  ctx.fillStyle = shade(green, 0.7); ctx.fillRect(R(x - 1), R(y - 1), 2, 2);
}

function scarfWrap(ctx: Ctx, rig: Rig, W: number, H: number): void {
  const purple = '#7b4fc9';
  ctx.beginPath();
  ctx.moveTo(-W / 2 + 1, -H + 1); ctx.quadraticCurveTo(0, -H - 3, W / 2 + 1, -H + 0.5);
  ctx.lineTo(W / 2 + 1, -H + 4.5); ctx.quadraticCurveTo(0, -H + 2, -W / 2 + 1, -H + 5);
  ctx.closePath();
  // the hanging front end
  ctx.moveTo(W * 0.18, -H + 3); ctx.lineTo(W * 0.38, -H + 3); ctx.lineTo(W * 0.34, -H * 0.42); ctx.lineTo(W * 0.14, -H * 0.46); ctx.closePath();
  celPath(ctx, rig, purple, 0, -H + 3, W * 0.5, 0.36, 0.3);
  if (rig.override) return;
  // a silver crescent pin
  ctx.fillStyle = '#e6e8f2';
  ctx.beginPath(); ctx.arc(W * 0.3, -H + 2.5, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = purple;
  ctx.beginPath(); ctx.arc(W * 0.3 + 1, -H + 2, 1.6, 0, Math.PI * 2); ctx.fill();
}

/** Hips: hip space, origin at the hip line. */
const hipsHook: Hook = (ctx, rig, _pose, info) => {
  const L = lookOf(rig), hp = info.w ?? rig.p.hip;
  const hw = hp / 2;
  const base = L.outfit === 'gi' ? '#f7f3ea' : furOf(rig, L.fur);
  const shape = () => { ctx.beginPath(); ctx.moveTo(-hw, -5); ctx.lineTo(hw, -5); ctx.lineTo(hw + 0.5, 3); ctx.quadraticCurveTo(0, 7, -hw - 0.5, 3); ctx.closePath(); };
  if (L.outfit === 'champ' || L.outfit === 'gi' || L.outfit === 'knight') {
    shape();
    celPath(ctx, rig, base, 0, 0, hw, 0.36, 0.2);
  } else {
    // bare fur: ink only the sides and the seat. The top edge meets the torso's own fur, and a line
    // there would cut the cat in half at the waist.
    ctx.beginPath(); ctx.moveTo(hw, -2.5); ctx.lineTo(hw + 0.5, 3); ctx.quadraticCurveTo(0, 7, -hw - 0.5, 3); ctx.lineTo(-hw, -2.5);
    outlinePath(ctx, rig);
    shape(); ctx.fillStyle = rig.col(base); ctx.fill();
    if (!rig.override) {
      ctx.save(); shape(); ctx.clip();
      ctx.fillStyle = tones(rig, base).sh; ctx.fillRect(R(hw * 0.25), -6, R(hw), 14);
      ctx.restore();
    }
  }
  if (rig.override) return;
  if (L.outfit === 'champ') {
    const gold = '#ffcb3d';
    ctx.fillStyle = '#c6303a'; ctx.fillRect(R(-hw), -5, R(hp), 4);
    celBall(ctx, rig, hw * 0.25, -3, 4.2, gold, true);
    ctx.fillStyle = '#e8424f'; ctx.fillRect(R(hw * 0.25 - 1), -4, 2, 2);
  } else if (L.outfit === 'gi') {
    const belt = '#28222e';
    ctx.fillStyle = belt; ctx.fillRect(R(-hw), -5, R(hp), 3);
    // the knot and its two ends, which hang and swing a little with the step
    const sw = Math.sin(rig.tick * 0.12) * 1.2;
    ctx.fillRect(R(hw * 0.2 - 1.5), -6, 4, 4);
    ctx.fillRect(R(hw * 0.2 - 1 + sw * 0.3), -2, 2, 6);
    ctx.fillRect(R(hw * 0.2 + 1.5 + sw), -2, 2, 5);
  } else if (L.outfit === 'knight') {
    const steel = '#b9c2d2';
    for (let i = 0; i < 3; i++) {
      const x = -hw + i * (hp / 3);
      ctx.beginPath(); ctx.rect(x + 0.5, -4, hp / 3 - 1, 8);
      outlinePath(ctx, rig); ctx.fillStyle = i === 2 ? shade(steel, 1.08) : steel; ctx.fill();
    }
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(R(-hw), -5, R(hp), 2);
  } else if (L.pattern === 'mitts') {
    ctx.fillStyle = furOf(rig, L.belly);
    ctx.beginPath(); ctx.ellipse(hw * 0.35, -1, hw * 0.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  }
};

/** A round paw. Hand space: +x along the forearm, origin at the hand joint. */
const handHook: Hook = (ctx, rig, _pose, info) => {
  const L = lookOf(rig), r = info.r;
  const col = info.far ? info.pal.skin : furOf(rig, L.pattern === 'mitts' ? L.belly : L.fur);
  ctx.beginPath(); ctx.ellipse(0.5 * r, 0, 1.12 * r, 1.0 * r, 0, 0, Math.PI * 2);
  celPath(ctx, rig, col, 0.5 * r, 0, r, 0.3, 0.32);
  if (rig.override) return;
  ctx.strokeStyle = tones(rig, col).deep; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(1.25 * r, -0.32 * r); ctx.lineTo(1.6 * r, -0.36 * r);
  ctx.moveTo(1.28 * r, 0.24 * r); ctx.lineTo(1.6 * r, 0.28 * r);
  ctx.stroke();
  if (L.outfit === 'champ') { ctx.fillStyle = info.far ? '#8f2730' : '#d8343f'; ctx.fillRect(R(-0.85 * r), R(-r * 0.9), R(0.7 * r), R(r * 1.8)); }
  if (L.outfit === 'knight') { ctx.fillStyle = info.far ? '#8a92a3' : '#c3cbd9'; ctx.fillRect(R(-0.95 * r), R(-r * 0.95), R(0.65 * r), R(r * 1.9)); }
};

/** A paw, a sneaker or a sabaton. Ankle space: origin at the ankle, +x toward the toe, y down. */
const footHook: Hook = (ctx, rig, _pose, info) => {
  const L = lookOf(rig), fl = info.w ?? 7, fh = info.h ?? 4;
  if (L.outfit === 'sneakers') {
    const pink = info.far ? '#c45a86' : '#ff7aa8';
    ctx.beginPath();
    ctx.moveTo(-3, -fh + 1); ctx.lineTo(fl * 0.35, -fh + 0.5); ctx.quadraticCurveTo(fl + 0.5, -fh * 0.3, fl, 1.5);
    ctx.lineTo(fl, 2.6); ctx.lineTo(-3.5, 2.6); ctx.closePath();
    celPath(ctx, rig, pink, fl * 0.3, -1, fl * 0.6, 0.3, 0.3);
    if (rig.override) return;
    ctx.save(); ctx.clip();
    ctx.fillStyle = info.far ? '#d9d9e3' : '#ffffff';
    ctx.fillRect(-4, 1, R(fl + 5), 3);
    ctx.beginPath(); ctx.arc(fl - 0.5, 0.8, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // untied laces: the reason Truffle trips
    if (!info.far) {
      const sw = Math.sin(rig.tick * 0.2) * 1.5;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(fl * 0.3, -fh + 1); ctx.quadraticCurveTo(fl * 0.2 + sw, 0, fl * 0.05 + sw, 3.5);
      ctx.moveTo(fl * 0.4, -fh + 1); ctx.quadraticCurveTo(fl * 0.55 - sw, 0, fl * 0.62 - sw, 3.8); ctx.stroke();
    }
    return;
  }
  if (L.outfit === 'knight') {
    const steel = info.far ? '#8f97a8' : '#c9d1df';
    ctx.beginPath();
    ctx.moveTo(-3, -fh); ctx.lineTo(fl * 0.4, -fh); ctx.quadraticCurveTo(fl + 1, -fh * 0.2, fl + 0.5, 2.2); ctx.lineTo(-3.5, 2.2); ctx.closePath();
    celPath(ctx, rig, steel, fl * 0.3, -1, fl * 0.6, 0.32, 0.4);
    if (rig.override) return;
    ctx.fillStyle = tones(rig, steel).sh;
    ctx.fillRect(R(fl * 0.25), -fh + 1, 1, R(fh + 1));
    ctx.fillRect(R(fl * 0.55), -fh + 2, 1, R(fh));
    return;
  }
  const col = info.far ? info.pal.skin : furOf(rig, L.pattern === 'mitts' ? L.belly : L.fur);
  // a bean: rounded heel, rounder toes, flat-ish sole
  const top = -fh + 1, sole = 2.4, h = sole - top;
  ctx.beginPath();
  ctx.moveTo(-2.6 + h * 0.5, top);
  ctx.lineTo(fl - h * 0.55, top + 0.3);
  ctx.arc(fl - h * 0.55, top + h * 0.5 + 0.15, h * 0.5, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-2.6 + h * 0.5, sole);
  ctx.arc(-2.6 + h * 0.5, top + h * 0.5, h * 0.5, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  celPath(ctx, rig, col, fl * 0.3, -0.5, fl * 0.55, 0.3, 0.3);
  if (rig.override) return;
  ctx.strokeStyle = tones(rig, col).deep; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(fl - 2.2, top + 1.2); ctx.lineTo(fl - 2.4, sole - 0.6); ctx.moveTo(fl - 4.2, top + 0.9); ctx.lineTo(fl - 4.4, sole - 0.6); ctx.stroke();
};

// ---------------------------------------------------------------- accessories

/** The tail, in the back layer. Hip space: origin at the hip line's centre, no torso rotation. */
function tailAccessory(): RigAccessory {
  return {
    attach: 'hip', layer: 'back',
    draw(ctx, rig) {
      const L = lookOf(rig), T = L.tail, cat = catOf(rig);
      const n = 6, seg = T.len / n;
      const ch = getChain(rig, 'tail', n, { joint: 'torso', rest: [-1, 0], stiffness: 0.11, damping: 0.8, gain: 1.6, rotGain: 0.5, follow: 0.45, maxAng: 32 });
      const lift = Math.max(-1, Math.min(1, cat.tailLift - cat.wet * 1.5));
      const curl = T.curl * (1 + lift * 0.35) * (1 - cat.wet * 0.7);
      let ang = 172 - lift * 26;
      let x = -rig.p.hip * 0.38, y = -2;
      const px: number[] = [x], py: number[] = [y], pr: number[] = [T.r0];
      for (let i = 0; i < n; i++) {
        const sway = Math.sin(rig.tick * 0.045 + i * 0.7 + cat.blinkSeed) * (2 + i * 1.3) * (1 - cat.wet);
        ang += curl + ch.ang[i] + sway;
        x += Math.cos(ang * D2R) * seg;
        y += Math.sin(ang * D2R) * seg;
        px.push(x); py.push(y); pr.push(T.r0 + (T.r1 - T.r0) * ((i + 1) / n));
      }
      // a shade toward the far palette: the tail is behind the body and should read that way
      const fur = furOf(rig, mix(L.fur, rig.paletteFar.skin, 0.3));
      const tube = (grow: number) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) pathTaperedCapsule(ctx, px[i], py[i], px[i + 1], py[i + 1], pr[i] + grow, pr[i + 1] + grow, true);
        if (T.fluffy) {
          // tufts, appended to the same path: one outline goes round the fuzz, none between the tufts
          for (let i = 1; i <= n; i++) {
            const a = Math.atan2(py[i] - py[i - 1], px[i] - px[i - 1]) + Math.PI / 2;
            for (const sd of [-1, 1]) {
              const cx = px[i] + Math.cos(a) * pr[i] * 0.85 * sd, cy = py[i] + Math.sin(a) * pr[i] * 0.85 * sd;
              ctx.moveTo(cx + 2.2 + grow, cy); ctx.arc(cx, cy, 2.2 + grow, 0, Math.PI * 2);
            }
          }
        }
      };
      tube(0);
      outlinePath(ctx, rig);
      ctx.fillStyle = rig.col(tones(rig, fur).base);
      ctx.fill();
      if (rig.override) return;
      ctx.save();
      tube(0); ctx.clip();
      if (T.rings) {
        ctx.strokeStyle = furOf(rig, L.furDark); ctx.lineWidth = 2;
        for (let i = 1; i < n; i += 1) {
          if (i % 2 === 0) continue;
          const a = Math.atan2(py[i + 1] - py[i], px[i + 1] - px[i]) + Math.PI / 2, rr = pr[i] + 1;
          ctx.beginPath(); ctx.moveTo(px[i] - Math.cos(a) * rr, py[i] - Math.sin(a) * rr); ctx.lineTo(px[i] + Math.cos(a) * rr, py[i] + Math.sin(a) * rr); ctx.stroke();
        }
      }
      if (T.tip) {
        ctx.fillStyle = furOf(rig, T.tip);
        ctx.beginPath(); ctx.arc(px[n], py[n], pr[n] + 3, 0, Math.PI * 2); ctx.fill();
      }
      // one shadow band down the whole tail: the tube again, thinner and pushed away from the light
      const lx = rig.light.x, ly = rig.light.y, k = 0.62;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const o0 = pr[i] * (1 - k), o1 = pr[i + 1] * (1 - k);
        pathTaperedCapsule(ctx, px[i] - lx * o0, py[i] - ly * o0, px[i + 1] - lx * o1, py[i + 1] - ly * o1, pr[i] * k, pr[i + 1] * k, true);
      }
      ctx.fillStyle = 'rgba(40,20,60,0.22)'; ctx.fill();
      ctx.restore();
    },
  };
}

/** Sprout's little sprout: a stem and two leaves on top of the head. Head space. */
const sproutLeaf: RigAccessory = {
  attach: 'head',
  draw(ctx, rig) {
    const r = rig.p.headR, sw = Math.sin(rig.tick * 0.06) * 0.15;
    ctx.save();
    ctx.translate(0.05 * r, -0.9 * r);
    ctx.rotate(sw);
    ctx.strokeStyle = rig.col('#3b8a3e'); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(1, -3, 0, -5.5); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 3, -6.2 + (s > 0 ? -0.6 : 0), 3.3, 1.8, s * 0.45, 0, Math.PI * 2);
      outlinePath(ctx, rig); ctx.fillStyle = rig.col(s > 0 ? '#7ad15c' : '#5cb848'); ctx.fill();
    }
    ctx.restore();
  },
};

/** Biscuit's red headband across the forehead, its two tails flying behind on a chain. Head space. */
const headband: RigAccessory = {
  attach: 'head',
  draw(ctx, rig) {
    const r = rig.p.headR, red = '#e2493b';
    const ch = getChain(rig, 'band', 3, { joint: 'head', rest: [-1, 0.35], stiffness: 0.09, damping: 0.82, gain: 2.4, maxAng: 50 });
    const kx = -1.1 * r, ky = -0.32 * r;
    // the tails, from the knot at the back of the head
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? rig.col(red) : rig.col(rig.outline);
      ctx.lineWidth = pass ? 1.8 : 3.6;
      for (const base of [146, 178]) {
        let a = base, x = kx, y = ky;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 0; i < 3; i++) {
          a += -9 + ch.ang[i] + Math.sin(rig.tick * 0.15 + i + base) * 7;
          x += Math.cos(a * D2R) * 4.4; y += Math.sin(a * D2R) * 4.4;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // the band: one thick curve over the brow, inked by drawing it wide in the outline colour first,
    // and clipped to the skull (plus the outline's width) so it wraps the head instead of jutting out
    const band = () => { ctx.beginPath(); ctx.moveTo(kx - 2, ky + 0.5); ctx.quadraticCurveTo(0, -1.0 * r, 1.3 * r, -0.5 * r); };
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0.04 * r, 1.1 * r + 1, 0.93 * r + 1, 0, 0, Math.PI * 2); ctx.clip();
    band(); ctx.strokeStyle = rig.col(rig.outline); ctx.lineWidth = 4.2; ctx.lineCap = 'butt'; ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0.04 * r, 1.1 * r, 0.93 * r, 0, 0, Math.PI * 2); ctx.clip();
    band(); ctx.strokeStyle = rig.col(red); ctx.lineWidth = 2.2; ctx.lineCap = 'butt'; ctx.stroke();
    if (!rig.override) { ctx.fillStyle = '#ffe9a8'; ctx.fillRect(R(0.3 * r), R(-0.86 * r), 2, 1); }
    ctx.restore();
    // the knot at the back
    ctx.beginPath(); ctx.arc(kx + 0.5, ky, 2, 0, Math.PI * 2);
    outlinePath(ctx, rig); ctx.fillStyle = rig.col(red); ctx.fill();
    ctx.lineCap = 'round';
  },
};

/** Truffle's pink bow at the base of the near ear. Head space. */
const bow: RigAccessory = {
  attach: 'head',
  draw(ctx, rig) {
    const r = rig.p.headR, x = 0.62 * r, y = -0.78 * r, pink = '#ff6fa3';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 3.5); ctx.lineTo(x - 4.5, y + 2); ctx.closePath();
    ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 3.5); ctx.lineTo(x + 4.5, y + 2); ctx.closePath();
    outlinePath(ctx, rig); ctx.fillStyle = rig.col(pink); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 0.5, 1.6, 0, Math.PI * 2);
    outlinePath(ctx, rig); ctx.fillStyle = rig.col(shade(pink, 1.15)); ctx.fill();
  },
};

/** Pendragon's helmet: a steel dome with ear slots, the visor up, and a red plume on a chain. Head space. */
const helmet: RigAccessory = {
  attach: 'head',
  draw(ctx, rig) {
    const r = rig.p.headR, steel = '#c9d1df';
    // plume first, so the dome sits over its root
    const ch = getChain(rig, 'plume', 3, { joint: 'head', rest: [-1, -0.2], stiffness: 0.1, damping: 0.8, gain: 2, maxAng: 40 });
    let x = -0.1 * r, y = -1.02 * r, a = -100;
    const red = '#d8343f';
    for (let i = 0; i < 3; i++) {
      a += -28 + ch.ang[i];
      const nx = x + Math.cos(a * D2R) * 5, ny = y + Math.sin(a * D2R) * 5;
      ctx.beginPath(); pathTaperedCapsule(ctx, x, y, nx, ny, 3.2 - i * 0.5, 2.6 - i * 0.6, true);
      outlinePath(ctx, rig); ctx.fillStyle = rig.col(i % 2 ? shade(red, 1.12) : red); ctx.fill();
      x = nx; y = ny;
    }
    const brim = () => { ctx.moveTo(0.98 * r, -0.46 * r); ctx.quadraticCurveTo(0.2 * r, -0.74 * r, -0.66 * r, -0.5 * r); };
    ctx.beginPath();
    ctx.moveTo(-1.16 * r, -0.05 * r);
    ctx.quadraticCurveTo(-1.12 * r, -1.1 * r, 0.1 * r, -1.08 * r);
    ctx.quadraticCurveTo(1.0 * r, -1.0 * r, 1.14 * r, -0.4 * r);
    ctx.lineTo(0.98 * r, -0.46 * r);
    ctx.quadraticCurveTo(0.2 * r, -0.74 * r, -0.66 * r, -0.5 * r);
    ctx.lineTo(-0.74 * r, 0.1 * r);
    ctx.closePath();
    celPath(ctx, rig, steel, 0, -0.7 * r, r, 0.3, 0.4);
    if (rig.override) return;
    // a gold rim along the brim, and one cold highlight on the crown
    ctx.save(); ctx.translate(0, -1); ctx.beginPath(); brim();
    ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.fillStyle = shade(steel, 1.18);
    ctx.fillRect(R(-0.55 * r), R(-0.98 * r), R(0.5 * r), 1);
  },
};

/** Pendragon's cape, behind everything. Torso space. */
const cape: RigAccessory = {
  attach: 'torso', layer: 'back',
  draw(ctx, rig) {
    const W = rig.p.torsoW, H = rig.p.torsoH, red = '#c62f3e';
    const ch = getChain(rig, 'cape', 3, { joint: 'torso', rest: [-0.35, 1], stiffness: 0.08, damping: 0.84, gain: 2.2, maxAng: 45 });
    const sway = Math.sin(rig.tick * 0.05) * 2;
    const flow = (ch.ang[0] + ch.ang[1] * 0.6) * 0.35;
    ctx.beginPath();
    ctx.moveTo(-W / 2 + 1, -H + 1);
    ctx.lineTo(W / 2 - 4, -H + 1);
    ctx.quadraticCurveTo(-W * 0.1 + flow, -H * 0.2, -W * 0.45 + flow * 1.6 + sway, 8);
    ctx.lineTo(-W * 0.95 + flow * 2 + sway, 6 + flow * 0.3);
    ctx.quadraticCurveTo(-W * 0.85 + flow, -H * 0.4, -W / 2 + 1, -H + 1);
    ctx.closePath();
    celPath(ctx, rig, red, -W * 0.4, -H * 0.3, H * 0.8, 0.4, 0.2);
    if (rig.override) return;
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(R(-W / 2 + 1), R(-H + 1), R(W - 5), 2);
  },
};

/** Sly's scarf end, streaming out behind him on a chain. Torso space, back layer. */
const scarfTail: RigAccessory = {
  attach: 'torso', layer: 'back',
  draw(ctx, rig) {
    const W = rig.p.torsoW, H = rig.p.torsoH, purple = '#7b4fc9';
    const ch = getChain(rig, 'scarf', 4, { joint: 'torso', rest: [-1, 0.25], stiffness: 0.08, damping: 0.85, gain: 2.6, maxAng: 50 });
    let x = -W / 2 + 2, y = -H + 3, a = 146;
    const xs = [x], ys = [y];
    for (let i = 0; i < 4; i++) {
      a += -9 + ch.ang[i] + Math.sin(rig.tick * 0.1 + i * 0.9) * 6;
      x += Math.cos(a * D2R) * 4.5; y += Math.sin(a * D2R) * 4.5;
      xs.push(x); ys.push(y);
    }
    ctx.beginPath();
    for (let i = 0; i < 4; i++) pathTaperedCapsule(ctx, xs[i], ys[i], xs[i + 1], ys[i + 1], 2.4, 2.0, true);
    outlinePath(ctx, rig); ctx.fillStyle = rig.col(purple); ctx.fill();
    if (rig.override) return;
    ctx.fillStyle = '#c7b3f0';
    ctx.fillRect(R(xs[4] - 1), R(ys[4] - 1), 2, 2);
  },
};

// ---------------------------------------------------------------- held things

function drawSword(ctx: Ctx, rig: Rig): void {
  const len = 21, blade = '#e8eef8', gold = '#f0c040';
  // grip and pommel
  ctx.beginPath(); ctx.rect(-5, -1.3, 6, 2.6);
  outlinePath(ctx, rig); ctx.fillStyle = rig.col('#7a4a2a'); ctx.fill();
  ctx.beginPath(); ctx.arc(-6, 0, 1.8, 0, Math.PI * 2);
  outlinePath(ctx, rig); ctx.fillStyle = rig.col(gold); ctx.fill();
  // blade
  ctx.beginPath(); ctx.moveTo(2, -1.8); ctx.lineTo(len - 3, -1.6); ctx.lineTo(len, 0); ctx.lineTo(len - 3, 1.6); ctx.lineTo(2, 1.8); ctx.closePath();
  outlinePath(ctx, rig); ctx.fillStyle = rig.col(blade); ctx.fill();
  if (!rig.override) { ctx.fillStyle = '#9aa6bd'; ctx.fillRect(3, 0, len - 7, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(4, -1, len - 9, 1); }
  // crossguard
  ctx.beginPath(); ctx.rect(0.5, -4.5, 2.4, 9);
  outlinePath(ctx, rig); ctx.fillStyle = rig.col(gold); ctx.fill();
}

function drawBook(ctx: Ctx, rig: Rig): void {
  ctx.save();
  ctx.rotate(-0.25);
  ctx.beginPath(); ctx.rect(-1, -6, 9, 10);
  outlinePath(ctx, rig); ctx.fillStyle = rig.col('#d94a4a'); ctx.fill();
  if (!rig.override) {
    ctx.fillStyle = '#fff3d6'; ctx.fillRect(6, -5, 2, 8);
    ctx.fillStyle = '#ffd36a'; ctx.fillRect(1, -3, 4, 1); ctx.fillRect(1, -1, 3, 1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- build

const PARTS = {
  head: headHook, face: faceHook, torso: torsoHook, hips: hipsHook, hand: handHook, foot: footHook,
};

let seedCounter = 17;

/** Build a cat's rig. Every call is a fresh rig with its own chains, so two copies swing independently. */
export function buildCat(id: CatId, scale = 1): CatRig {
  const L = LOOKS[id];
  const palette: Palette = {
    skin: L.fur, hair: L.furDark, primary: L.fur,
    secondary: L.outfit === 'gi' ? '#f7f3ea' : L.fur,
    sleeve: L.outfit === 'gi' ? '#f7f3ea' : L.outfit === 'knight' ? '#b9c2d2' : L.fur,
    accent: '#ffcb3d', metal: '#d8dfeb', dark: L.outline, glow: L.eye, belly: L.belly,
  };
  const accessories: RigAccessory[] = [tailAccessory()];
  if (L.outfit === 'scholar') accessories.push(sproutLeaf);
  if (L.outfit === 'gi') accessories.push(headband);
  if (L.outfit === 'sneakers') accessories.push(bow);
  if (L.outfit === 'knight') accessories.push(helmet, cape);
  if (L.outfit === 'scarf') accessories.push(scarfTail);
  const build: CatBuild = {
    cat: L, basePalette: palette, proportions: PROPORTIONS[id], scale: L.scale * scale, outline: L.outline,
    parts: PARTS, accessories,
    weapon: L.outfit === 'knight' ? { attach: 'handR', length: 21, draw: (ctx, rig) => drawSword(ctx, rig) }
      : L.outfit === 'scholar' ? { attach: 'handR', length: 9, draw: (ctx, rig) => drawBook(ctx, rig) } : null,
    // the small-sprite shading profile (see rig.ts: thinR / hiMin / flatR): a cat's limbs are thin,
    // and at the default 6.5 / 10 / 5 every one of them would be a flat fill
    thinR: 4, hiMin: 6, flatR: 2.5,
    farShade: 0.74, farDesat: 0.18,
    // lighter shadows than the engine's default ramp (0.66): bright, clean colour reads better for
    // fur than deep cel shadow, which turned every orange cat brown
    ramp: { hi: 1.14, sh: 0.8, rim: 1.4 },
  };
  const rig = buildRig(build) as CatRig;
  rig.tailLift = 0;
  rig.wet = 0;
  rig.sleepy = false;
  rig.blinkSeed = (seedCounter = (seedCounter * 37 + 11) % 997);
  return rig;
}

/** Feet-to-ear-tip height of a cat at its own scale, for placing speech bubbles and name tags. */
export function catHeight(rig: Rig): number {
  return (rig.height + rig.p.headR * 0.5) * rig.scale;
}

export type { Pose, Info };

/**
 * Just a cat's head, for portraits: the HUD, the select screen, the map. The head, face and head
 * accessories are called straight into a translated, scaled context -- exactly the space rig.ts
 * enters for them -- so a portrait is the same drawing as the cat in the level, not a copy of it.
 */
export function drawCatHead(ctx: Ctx, rig: CatRig, x: number, y: number, scale: number, face: number = CF.neutral): void {
  const s = scale;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);
  rig.ow = 1 / s;
  rig.pxScale = s;
  rig.light.x = LIGHT_X; rig.light.y = LIGHT_Y;
  rig.tick++;
  const pose = makePose({ face });
  const info = rig.partInfo;
  info.name = 'head'; info.far = false; info.pal = rig.palette; info.len = 0; info.r = rig.p.headR; info.color = rig.palette.skin; info.w = undefined; info.h = undefined; info.length = 0;
  rig.parts.head?.(ctx, rig, pose, info);
  rig.parts.face?.(ctx, rig, pose, info);
  for (const acc of rig.accessories) if (acc.attach === 'head') acc.draw(ctx, rig, pose);
  ctx.restore();
}
