// Progress, kept in localStorage: which cat was picked, each challenge's best score and stars, and
// how fed, watered and played-with every cat is. Storage can be missing or throw (a private window,
// blocked site data), so every read and write is guarded and the game plays the same without it --
// it just forgets on reload. Test mode never touches storage at all, so headless runs are hermetic.

export type CatId = 'crush' | 'sprout' | 'sly' | 'biscuit' | 'truffle' | 'pendragon';
export const CAT_IDS: readonly CatId[] = ['crush', 'sprout', 'sly', 'biscuit', 'truffle', 'pendragon'];

export type LevelId = 'town' | 'tubes' | 'flume';
export const LEVEL_IDS: readonly LevelId[] = ['town', 'tubes', 'flume'];

/** Each need runs 0..NEED_MAX. A cat with every need full is happy, and happy cats score double. */
export interface Needs {
  food: number;
  drink: number;
  play: number;
}
export const NEED_MAX = 3;

export interface SaveData {
  v: 1;
  cat: CatId;
  best: Partial<Record<LevelId, number>>;
  stars: Partial<Record<LevelId, number>>;
  done: Partial<Record<LevelId, boolean>>;
  needs: Partial<Record<CatId, Needs>>;
  fishingBest: number;
  /** Every point ever scored, by every cat: the "purr points" on the map. */
  purrs: number;
}

const KEY = 'catz.save.v1';

function fresh(): SaveData {
  return { v: 1, cat: 'biscuit', best: {}, stars: {}, done: {}, needs: {}, fishingBest: 0, purrs: 0 };
}

let persist = true;
let data: SaveData = fresh();

/** Load once at startup. `persistToStorage` false (test mode) keeps everything in memory. */
export function loadSave(persistToStorage: boolean, wipe = false): void {
  persist = persistToStorage;
  data = fresh();
  if (!persist) return;
  try {
    if (wipe) localStorage.removeItem(KEY);
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed && parsed.v === 1) {
      data = { ...fresh(), ...parsed } as SaveData;
      if (!CAT_IDS.includes(data.cat)) data.cat = 'biscuit';
    }
  } catch { /* unreadable storage: start fresh */ }
}

function write(): void {
  if (!persist) return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full or blocked: keep playing */ }
}

export const save = {
  get data(): Readonly<SaveData> { return data; },
  setCat(cat: CatId): void { data.cat = cat; write(); },
  needs(cat: CatId): Needs {
    let n = data.needs[cat];
    if (!n) { n = { food: 2, drink: 2, play: 1 }; data.needs[cat] = n; }
    return n;
  },
  /** Fill (positive) or use up (negative) one need, clamped to 0..NEED_MAX. */
  addNeed(cat: CatId, need: keyof Needs, amount: number): void {
    const n = save.needs(cat);
    n[need] = Math.max(0, Math.min(NEED_MAX, n[need] + amount));
    write();
  },
  isHappy(cat: CatId): boolean {
    const n = save.needs(cat);
    return n.food >= NEED_MAX && n.drink >= NEED_MAX && n.play >= NEED_MAX;
  },
  /** Record a finished challenge. Returns true when the score is a new best. */
  finishLevel(level: LevelId, score: number, stars: number): boolean {
    const isBest = score > (data.best[level] ?? -1);
    if (isBest) data.best[level] = score;
    data.stars[level] = Math.max(data.stars[level] ?? 0, stars);
    data.done[level] = true;
    data.purrs += Math.max(0, score);
    write();
    return isBest;
  },
  /** Record an apple-fishing round. Returns true when it is a new best. */
  finishFishing(score: number): boolean {
    data.purrs += Math.max(0, score);
    const isBest = score > data.fishingBest;
    if (isBest) data.fishingBest = score;
    write();
    return isBest;
  },
  unlocked(level: LevelId): boolean {
    // The water park is past the town: run the town once and both rides open.
    return level === 'town' || !!data.done.town;
  },
};
