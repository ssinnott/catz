// What each cat LOOKS like: fur, markings, eyes, tail, outfit, size. What each cat can DO lives in
// roster.ts; how a look becomes a drawable rig lives in catRig.ts.
import type { CatId } from '../core/save.ts';

export type Pattern = 'tabby' | 'solid' | 'point' | 'mitts';
export type Outfit = 'champ' | 'scholar' | 'scarf' | 'gi' | 'sneakers' | 'knight';

export interface TailLook {
  /** Length in px at scale 1. */
  len: number;
  /** Radius at the root and at the tip. */
  r0: number;
  r1: number;
  /** Degrees each segment turns upward: how much of a question mark the tail is. */
  curl: number;
  /** Colour of the last segment, if different (a white tip, a dark point). */
  tip?: string;
  /** Dark rings along the tail (tabbies). */
  rings?: boolean;
  /** A fluffy tail: a second, fuzzier outline around the first. */
  fluffy?: boolean;
}

export interface CatLook {
  id: CatId;
  fur: string;
  /** Stripes, points and patches. */
  furDark: string;
  /** Muzzle, chest, belly and (for mitted cats) paws. */
  belly: string;
  nose: string;
  innerEar: string;
  /** Iris colour. */
  eye: string;
  whisker: string;
  pattern: Pattern;
  outfit: Outfit;
  tail: TailLook;
  /** Ear size multiplier. */
  ear: number;
  /** How far the cheek fur sticks out, 0..1. */
  cheeks: number;
  /** Rig scale: Crush is big, Sprout is little. */
  scale: number;
  /** Outline colour: near-black, but a black cat needs it a shade darker than his fur. */
  outline: string;
  /** Resting expression: Sly's calm half-lidded look is his whole character. */
  calm?: boolean;
}

export const LOOKS: Readonly<Record<CatId, CatLook>> = {
  crush: {
    id: 'crush', fur: '#f08a3c', furDark: '#c0531c', belly: '#ffe3c4', nose: '#e8706b', innerEar: '#ffb4a2',
    eye: '#c8e04a', whisker: '#fff8ec', pattern: 'tabby', outfit: 'champ',
    tail: { len: 25, r0: 4.4, r1: 3.2, curl: 13, rings: true },
    ear: 0.95, cheeks: 0.6, scale: 1.2, outline: '#24140f',
  },
  sprout: {
    id: 'sprout', fur: '#f6ead8', furDark: '#c99e72', belly: '#ffffff', nose: '#f294a8', innerEar: '#ffc3ce',
    eye: '#56b4ff', whisker: '#9a8470', pattern: 'point', outfit: 'scholar',
    tail: { len: 19, r0: 3.0, r1: 2.4, curl: 17, tip: '#c99e72' },
    ear: 1.12, cheeks: 0.35, scale: 0.84, outline: '#2a1f1a',
  },
  sly: {
    id: 'sly', fur: '#383450', furDark: '#25223a', belly: '#4a4566', nose: '#5a4a6c', innerEar: '#7a5480',
    eye: '#ffcf33', whisker: '#d9d2ec', pattern: 'solid', outfit: 'scarf',
    tail: { len: 30, r0: 3.0, r1: 2.0, curl: 19 },
    ear: 1.05, cheeks: 0.15, scale: 1.0, outline: '#110d18', calm: true,
  },
  biscuit: {
    id: 'biscuit', fur: '#e3b27c', furDark: '#b97c43', belly: '#fff2de', nose: '#d97a7d', innerEar: '#ffc0a8',
    eye: '#36c9b4', whisker: '#fff8ee', pattern: 'tabby', outfit: 'gi',
    tail: { len: 24, r0: 3.4, r1: 2.6, curl: 15, tip: '#b97c43' },
    ear: 1.0, cheeks: 0.4, scale: 0.96, outline: '#25170e',
  },
  truffle: {
    id: 'truffle', fur: '#7d4b33', furDark: '#5a3223', belly: '#f7e4c8', nose: '#ec8c98', innerEar: '#f7b0b8',
    eye: '#5fd36a', whisker: '#f5e8d8', pattern: 'mitts', outfit: 'sneakers',
    tail: { len: 22, r0: 4.2, r1: 3.6, curl: 21, tip: '#f7e4c8', fluffy: true },
    ear: 0.98, cheeks: 0.85, scale: 0.92, outline: '#1e110b',
  },
  pendragon: {
    id: 'pendragon', fur: '#aab0be', furDark: '#6c7386', belly: '#eceff4', nose: '#d98894', innerEar: '#f0b4bd',
    eye: '#f2994a', whisker: '#ffffff', pattern: 'tabby', outfit: 'knight',
    tail: { len: 24, r0: 3.7, r1: 2.8, curl: 12, rings: true },
    ear: 1.0, cheeks: 0.5, scale: 1.04, outline: '#171822',
  },
};
