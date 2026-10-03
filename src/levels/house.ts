// Home: the cat playhouse room. Each 's' in the map is a station, numbered in the order the map is
// read -- row by row from the top, left to right along each row -- so the toy mouse up at the top of
// the cat tree comes first, then along the floor: the front door, the food bowl, the water bowl, the
// apple-fishing tub, the scratching post at the foot of the cat tree, and the little cardboard
// playhouse. The yarn balls and their basket live in src/screens/house.ts.
import type { LevelDef } from '../world/level.ts';

export const HOUSE: LevelDef = {
  id: 'house',
  name: 'CAT PLAYHOUSE',
  theme: 'house',
  music: 'house',
  par: 0,
  silver: 0,
  intro: '',
  stations: ['toy', 'door', 'food', 'water', 'apples', 'scratch', 'playhouse'],
  rows: [
  '########################################################',
  '#......................................................#',
  '#......................................................#',
  '#......................................................#',
  '#.......................s..............................#',
  '#......................====............................#',
  '#......................................................#',
  '#..........................===.........................#',
  '#......................................................#',
  '#......................===.............................#',
  '#......................................................#',
  '#..........................===.........................#',
  '#..s..P..s...s.....s.....s........................s....#',
  '########################################################',
  '########################################################',
  ],
};
