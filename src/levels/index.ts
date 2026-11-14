// Every level, by id. The order they are played in is LEVEL_IDS in src/core/save.ts: three in town,
// three in the tube maze, three on the flume, each area going from gentle to its hardest.
import type { LevelId } from '../core/save.ts';
import type { LevelDef } from '../world/level.ts';
import { STREET } from './street.ts';
import { MARKET } from './market.ts';
import { TOWN } from './town.ts';
import { SQUISHY } from './squishy.ts';
import { TUBES } from './tubes.ts';
import { TOWER } from './tower.ts';
import { LAZY } from './lazy.ts';
import { FLUME } from './flume.ts';
import { FALLS } from './falls.ts';

export const LEVELS: Readonly<Record<LevelId, LevelDef>> = {
  street: STREET, market: MARKET, town: TOWN,
  squishy: SQUISHY, tubes: TUBES, tower: TOWER,
  lazy: LAZY, flume: FLUME, falls: FALLS,
};
