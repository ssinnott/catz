// Stage 4, the first of the water park: the squishy tubes, a gentle way into the tube maze.
//
// Two padded corridors, one drop hole between them, and the pipes take it slow (pace 1.6: long quiet
// spells between gushes). One new thing at a time, each with room: a long stretch of floor with a
// jet firing LOW shots to jump (a step by the start keeps them off a cat still reading the intro),
// a pipe in the ceiling that pours (wait for it), the first golden fish on a high ledge, HIGH shots
// from the far wall to duck under on the way to the drop hole; then, back the other way, a frog, a
// little sewer pit, a bounce cushion up into a notch for the second golden fish, another pour,
// another pit, a box with the third golden fish over it, and low shots to jump at the very end.
// See src/world/level.ts for each character.
import type { LevelDef } from '../world/level.ts';

export const SQUISHY: LevelDef = {
  id: 'squishy',
  name: 'SQUISHY TUBES',
  theme: 'tubes',
  music: 'tubes',
  par: 110,
  silver: 900,
  intro: 'LOW SHOT? JUMP!\nHIGH SHOT? DUCK!',
  outro: 'THAT WAS SQUISHY!',
  pace: 1.6,
  rows: [
  '########################################################################',
  '########################################v###############################',
  '#......................................................................#',
  '#........fff..................................fFf......................#',
  '#.............ff...ff...ff...................====......................#',
  '#.......f...f..............#...........................................<',
  '#.P.ffff..#..f..f.f..f.f..f<...C.ffff..fff........ffff..fffffff........#',
  '################################################################..######',
  '###################################.F.##########################ff######',
  '########################v##########...##########################..######',
  '#..........F...........................................................#',
  '#................ff.................f......ff..........................#',
  '#...............f..f................f.....f..f.........................#',
  '#..........#...f....f....................f....f........................#',
  '>..E.nffff.#...........fff.fff.C....O...........fff..g...fff.C.........#',
  '#################~~########################~~###########################',
  '#################~~########################~~###########################',
  '########################################################################',
  ],
};
