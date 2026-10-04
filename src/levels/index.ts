// Every level, by id.
import type { LevelId } from '../core/save.ts';
import type { LevelDef } from '../world/level.ts';
import { TOWN } from './town.ts';
import { TUBES } from './tubes.ts';
import { FLUME } from './flume.ts';

export const LEVELS: Readonly<Record<LevelId, LevelDef>> = { town: TOWN, tubes: TUBES, flume: FLUME };
