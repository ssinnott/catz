// Screen construction by name: the one place that knows every screen, so screens send the player
// anywhere through `nav.*` without importing each other in a circle at module-evaluation time.
import type { Screen } from '../core/screens.ts';
import { save, CAT_IDS, LEVEL_IDS, type CatId, type LevelId } from '../core/save.ts';
import type { LevelDef } from '../world/level.ts';
import type { StageResult } from '../world/stage.ts';
import { LEVELS } from '../levels/index.ts';
import { LabScreen } from './lab.ts';
import { PlayScreen } from './play.ts';
import { ResultsScreen } from './results.ts';
import { TitleScreen } from './title.ts';
import { SelectScreen } from './select.ts';
import { MapScreen } from './map.ts';
import { HouseScreen } from './house.ts';
import { FishingScreen } from './fishing.ts';

export const nav = {
  title: (): Screen => new TitleScreen(),
  select: (): Screen => new SelectScreen(),
  house: (cat: CatId, from: 'select' | 'map' | 'fishing' = 'map'): Screen => new HouseScreen(cat, from),
  map: (cat: CatId, focus?: LevelId | 'house'): Screen => new MapScreen(cat, focus),
  play: (level: LevelId, cat: CatId): Screen => new PlayScreen(LEVELS[level], cat),
  results: (level: LevelDef, cat: CatId, r: StageResult): Screen => new ResultsScreen(level, cat, r),
  fishing: (cat: CatId): Screen => new FishingScreen(cat),
};

function catArg(arg: string | null): CatId {
  return arg && (CAT_IDS as readonly string[]).includes(arg) ? arg as CatId : save.data.cat;
}

/** Build a screen from its name and an optional argument, as the URL and the test hooks pass them. */
export function makeScreen(name: string, arg: string | null = null): Screen {
  switch (name) {
    case 'lab': return new LabScreen(arg);
    case 'select': return nav.select();
    case 'house': return nav.house(catArg(arg));
    case 'map': return nav.map(save.data.cat);
    case 'fishing': return nav.fishing(catArg(arg));
    case 'play': {
      const id = (LEVEL_IDS as readonly string[]).includes(arg ?? '') ? arg as LevelId : 'town';
      return nav.play(id, save.data.cat);
    }
    case 'results': {
      const lv = LEVELS.town;
      return nav.results(lv, save.data.cat, { level: 'town', score: 1234, fish: 40, fishTotal: 52, gold: 2, goldTotal: 3, bonks: 7, splashes: 1, seconds: 131, timeBonus: 95, happy: false, stars: 2 });
    }
    default: return nav.title();
  }
}
