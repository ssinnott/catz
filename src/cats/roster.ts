// What each cat can DO. The six were described as:
//
//   Crush      big and strong
//   Sprout     little and smart
//   Sly        black, smooth-moving, quiet and the most wise
//   Biscuit    very agile, great at karate, always hungry
//   Truffle    trips a lot, and good at jumping
//   Pendragon  a knight, with a big flock of dragons that follow him around
//
// and every line of that is a mechanic here: Crush hits twice as hard and shrugs off water jets;
// Sprout is small (ducks lowest) and can slow time to think; Sly accelerates smoothly and bad guys do
// not notice him; Biscuit is fastest, double-jumps, kicks, and gets extra points per fish; Truffle
// jumps highest and floats, but trips when she runs flat out; Pendragon's dragons fly with him,
// breathe fire at bad guys, and can make a shield that water bounces off.
import type { CatId } from '../core/save.ts';

export type SpecialKind = 'pound' | 'think' | 'shadow' | 'kick' | 'spring' | 'shield';

export interface CatDef {
  id: CatId;
  name: string;
  tagline: string;
  blurb: string;
  /** Top running speed, px/frame. */
  speed: number;
  /** How fast it gets there; Sly's is high, which is what "smooth" feels like. */
  accel: number;
  /** Take-off speed, px/frame. */
  jump: number;
  /** Extra jumps in mid-air (Biscuit's flip). */
  airJumps: number;
  /** Holding jump while falling floats (Truffle). */
  float: boolean;
  /** Bonk strength: the bulldog takes two hits, or one from Crush. */
  power: number;
  hitbox: { w: number; h: number };
  /** Paw/attack reach in front of the body, px. */
  reach: number;
  attackName: string;
  special: { kind: SpecialKind; name: string; desc: string; cooldown: number };
  voice: 'meow' | 'mew' | 'growl';
  pitch: number;
  /** Bar heights on the select screen, 1..5. */
  stats: { speed: number; jump: number; power: number; smarts: number };
  /** Extra points per fish treat. Biscuit is hungry. */
  fishBonus: number;
  /** Bad guys do not notice a quiet cat until it is right on top of them. */
  quiet: boolean;
  /** Runs flat out long enough and down she goes. */
  trips: boolean;
  /** How hard water jets push: Crush barely moves. */
  pushback: number;
  dragons: boolean;
}

export const CATS: Readonly<Record<CatId, CatDef>> = {
  crush: {
    id: 'crush', name: 'CRUSH', tagline: 'BIG AND STRONG',
    blurb: 'ONE PUNCH BONKS ANY BAD GUY.\nWATER JETS BARELY MOVE HIM.',
    speed: 2.6, accel: 0.3, jump: 8.0, airJumps: 0, float: false, power: 2,
    hitbox: { w: 19, h: 47 }, reach: 26, attackName: 'POW PUNCH',
    special: { kind: 'pound', name: 'GROUND POUND', desc: 'SLAM THE GROUND! BONKS EVERY BAD GUY NEARBY AND SMASHES CRACKED BLOCKS.', cooldown: 330 },
    voice: 'growl', pitch: 0.85, stats: { speed: 2, jump: 2, power: 5, smarts: 2 },
    fishBonus: 0, quiet: false, trips: false, pushback: 0.3, dragons: false,
  },
  sprout: {
    id: 'sprout', name: 'SPROUT', tagline: 'LITTLE AND SMART',
    blurb: 'TINY ENOUGH TO DUCK UNDER ANYTHING.\nTHINKS SO FAST TIME SLOWS DOWN.',
    speed: 2.8, accel: 0.42, jump: 8.4, airJumps: 0, float: false, power: 1,
    hitbox: { w: 13, h: 33 }, reach: 22, attackName: 'BOOK BONK',
    special: { kind: 'think', name: 'THINK FAST', desc: 'A BRIGHT IDEA! EVERYTHING ELSE SLOWS DOWN FOR A FEW SECONDS.', cooldown: 600 },
    voice: 'mew', pitch: 1.3, stats: { speed: 3, jump: 3, power: 1, smarts: 5 },
    fishBonus: 0, quiet: false, trips: false, pushback: 1, dragons: false,
  },
  sly: {
    id: 'sly', name: 'SLY', tagline: 'QUIET AND WISE',
    blurb: 'SMOOTH AS A SHADOW. BAD GUYS\nDO NOT NOTICE HIM SNEAKING BY.',
    speed: 3.2, accel: 0.62, jump: 8.6, airJumps: 0, float: false, power: 1,
    hitbox: { w: 15, h: 40 }, reach: 24, attackName: 'QUICK CLAWS',
    special: { kind: 'shadow', name: 'SHADOW STEP', desc: 'DASH THROUGH ANYTHING AS A SHADOW. NOTHING CAN TOUCH YOU.', cooldown: 360 },
    voice: 'meow', pitch: 0.9, stats: { speed: 4, jump: 3, power: 2, smarts: 5 },
    fishBonus: 0, quiet: true, trips: false, pushback: 1, dragons: false,
  },
  biscuit: {
    id: 'biscuit', name: 'BISCUIT', tagline: 'AGILE KARATE CAT',
    blurb: 'FASTEST PAWS IN TOWN. DOUBLE JUMP!\nALWAYS HUNGRY: FISH ARE WORTH MORE.',
    speed: 3.5, accel: 0.46, jump: 8.6, airJumps: 1, float: false, power: 1,
    hitbox: { w: 16, h: 40 }, reach: 30, attackName: 'KARATE KICK',
    special: { kind: 'kick', name: 'FLYING KICK', desc: 'HI-YAH! ZOOM FORWARD FEET FIRST, EVEN IN THE AIR.', cooldown: 210 },
    voice: 'meow', pitch: 1.05, stats: { speed: 5, jump: 4, power: 3, smarts: 2 },
    fishBonus: 5, quiet: false, trips: false, pushback: 1, dragons: false,
  },
  truffle: {
    id: 'truffle', name: 'TRUFFLE', tagline: 'BOUNCY JUMPER',
    blurb: 'JUMPS HIGHEST, AND FLOATS IF YOU\nHOLD JUMP. BUT... SHE TRIPS A LOT.',
    speed: 3.0, accel: 0.4, jump: 9.6, airJumps: 0, float: true, power: 1,
    hitbox: { w: 15, h: 38 }, reach: 26, attackName: 'SNEAKER KICK',
    special: { kind: 'spring', name: 'SUPER SPRING', desc: 'A GIANT SPINNING JUMP, HIGHER THAN ANY CAT CAN GO.', cooldown: 300 },
    voice: 'mew', pitch: 1.15, stats: { speed: 3, jump: 5, power: 2, smarts: 3 },
    fishBonus: 0, quiet: false, trips: true, pushback: 1, dragons: false,
  },
  pendragon: {
    id: 'pendragon', name: 'PENDRAGON', tagline: 'KNIGHT OF DRAGONS',
    blurb: 'HIS DRAGON FLOCK FOLLOWS HIM\nAND PUFFS FIRE AT BAD GUYS.',
    speed: 2.8, accel: 0.36, jump: 8.3, airJumps: 0, float: false, power: 1,
    hitbox: { w: 17, h: 42 }, reach: 34, attackName: 'SWORD SWISH',
    special: { kind: 'shield', name: 'DRAGON SHIELD', desc: 'THE DRAGONS CIRCLE HIM. WATER AND BAD GUYS BOUNCE OFF.', cooldown: 540 },
    voice: 'meow', pitch: 0.95, stats: { speed: 3, jump: 3, power: 4, smarts: 3 },
    fishBonus: 0, quiet: false, trips: false, pushback: 1, dragons: true,
  },
};
