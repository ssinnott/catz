// The game's audio singleton, built from the engine facade (src/lib/audio/facade.ts) with this
// game's own SFX table and tracks. The buses, the compressor, the look-ahead music scheduler and the
// offline self-test all come from the engine; only the sounds are the game's.
import { createAudio } from '../lib/audio/facade.ts';
import { SFX, JITTERED } from './sfx.ts';
import { TRACKS } from './music.ts';

export const audio = createAudio({ sfx: SFX, jittered: JITTERED, tracks: TRACKS });

/** Play a sound effect by name. A no-op until the first key or tap unlocks audio. */
export function sfx(name: string, volume = 1, pitch = 1): void {
  audio.play(name, { volume, pitch });
}
