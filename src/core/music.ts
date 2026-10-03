// The soundtrack, as data for the engine's pattern sequencer (src/lib/audio/sequencer.ts).
//
// Tokens are 16th-note steps: `E5:2` is an eighth note, `-:4` a quarter rest, `r` the chord's bass,
// `cK` chord tone K, `chord` the whole chord. Drum patterns are one character per step (K kick,
// S snare, H/h hats, x shaker, w woodblock). Every channel is a whole number of 16-step bars, which
// tools/gametest.ts checks, because a channel one step short drifts against the others forever.
import type { Track } from '../lib/audio/sequencer.ts';

const title: Track = {
  name: 'title', bpm: 126, key: 'C',
  chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
  channels: [
    { inst: 'marimba', vol: 0.9, pat:
      'E5:2 G5:2 C6:2 G5:2 E5:2 G5:2 A5:4 | A5:2 G5:2 E5:2 C5:2 E5:4 -:4 | ' +
      'F5:2 A5:2 C6:2 A5:2 F5:2 A5:2 C6:4 | B5:2 A5:2 G5:2 F5:2 D5:4 G4:4 | ' +
      'E5:2 G5:2 C6:2 E6:2 D6:2 C6:2 G5:4 | A5:2 C6:2 E6:2 C6:2 A5:4 -:4 | ' +
      'F5:2 E5:2 F5:2 A5:2 G5:2 F5:2 E5:2 D5:2 | D5:4 B4:4 C5:6 -:2' },
    { inst: 'bass_pluck', oct: 2, pat: 'r:3 r:1 c2:4 r:2 c1:2 c2:4' },
    { inst: 'pad', oct: 4, vol: 0.7, harmony: true, pat: 'chord:16' },
    { inst: 'drums', vol: 0.8, pat: 'K.h.S.h.K.K.S.hh' },
  ],
};

const house: Track = {
  name: 'house', bpm: 100, key: 'F',
  chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C'],
  channels: [
    { inst: 'flute', vol: 0.85, pat:
      'A5:4 C6:2 A5:2 G5:4 F5:4 | D5:4 F5:2 A5:2 D6:6 -:2 | Bb5:4 A5:2 G5:2 F5:4 D5:4 | E5:4 G5:4 C6:6 -:2 | ' +
      'A5:2 Bb5:2 C6:4 A5:2 F5:2 C5:4 | D5:2 F5:2 A5:4 G5:2 F5:2 D5:4 | G5:4 Bb5:4 A5:2 G5:2 F5:4 | E5:4 G5:4 F5:6 -:2' },
    { inst: 'bass_tri', oct: 2, pat: 'r:6 c2:2 r:4 c1:4' },
    { inst: 'accordion', oct: 4, vol: 0.55, harmony: true, pat: '-:2 chord:2 -:2 chord:2 -:2 chord:2 -:2 chord:2' },
    { inst: 'drums', vol: 0.7, pat: 'h...x...h...x.w.' },
  ],
};

const town: Track = {
  name: 'town', bpm: 144, key: 'G',
  chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'C', 'D'],
  channels: [
    { inst: 'lead_pulse', vol: 0.85, pat:
      'B4:2 D5:2 G5:3 F#5:1 G5:2 A5:2 B5:4 | G5:2 E5:2 B4:2 E5:2 G5:4 -:4 | C5:2 E5:2 G5:2 A5:2 G5:2 E5:2 C6:4 | B5:2 A5:2 F#5:2 D5:2 A5:4 -:4 | ' +
      'D6:2 B5:2 G5:2 B5:2 D6:2 E6:2 D6:4 | B5:2 G5:2 E5:2 G5:2 B5:4 A5:4 | G5:2 A5:2 B5:2 C6:2 E6:4 C6:4 | A5:2 B5:2 A5:2 F#5:2 G5:6 -:2' },
    { inst: 'bass_square', oct: 2, pat: 'r:2 r:2 c2:2 r:2 c1:2 r:2 c2:2 r:2' },
    { inst: 'pluck', oct: 4, vol: 0.55, harmony: true, pat: 'c0:2 c1:2 c2:2 c1:2 c0:2 c1:2 c2:2 c1:2' },
    { inst: 'drums', vol: 0.85, pat: 'K.H.S.H.K.KHS.HH' },
  ],
};

const tubes: Track = {
  name: 'tubes', bpm: 124, key: 'D',
  chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A'],
  channels: [
    { inst: 'marimba', vol: 0.9, pat:
      'D5:2 F5:2 A5:2 F5:2 D5:2 E5:2 F5:4 | Bb4:2 D5:2 F5:2 D5:2 Bb4:4 -:4 | C5:2 E5:2 G5:2 E5:2 C6:4 G5:4 | A4:2 C#5:2 E5:2 G5:2 A5:4 -:4 | ' +
      'F5:2 E5:2 D5:2 E5:2 F5:2 G5:2 A5:4 | Bb5:2 A5:2 F5:2 D5:2 F5:4 -:4 | G5:2 F5:2 E5:2 D5:2 Bb4:4 D5:4 | E5:2 C#5:2 A4:2 C#5:2 E5:2 G5:2 A5:2 -:2' },
    { inst: 'bass_square', oct: 2, pat: 'r:2 -:2 r:2 c2:2 r:2 -:2 c1:2 c2:2' },
    { inst: 'organ', oct: 4, vol: 0.4, harmony: true, pat: 'chord:16' },
    { inst: 'drums', vol: 0.8, pat: 'K.w.S.wwK.w.S.w.' },
  ],
};

const flume: Track = {
  name: 'flume', bpm: 136, key: 'A',
  chords: ['A', 'F#m', 'D', 'E', 'A', 'F#m', 'D', 'E'],
  channels: [
    { inst: 'flute', vol: 0.9, pat:
      'C#5:2 E5:2 A5:4 G#5:2 A5:2 B5:4 | A5:2 F#5:2 C#5:2 F#5:2 A5:6 -:2 | D5:2 F#5:2 A5:2 D6:2 C#6:2 B5:2 A5:4 | B5:2 G#5:2 E5:2 G#5:2 B5:4 E5:4 | ' +
      'E6:2 C#6:2 A5:2 C#6:2 E6:4 D6:4 | C#6:2 A5:2 F#5:2 A5:2 C#6:4 B5:4 | A5:2 B5:2 C#6:2 D6:2 F#6:4 D6:4 | E6:2 D6:2 C#6:2 B5:2 A5:6 -:2' },
    { inst: 'bass_pluck', oct: 2, pat: 'r:3 r:1 c2:2 r:2 c1:3 c1:1 c2:4' },
    { inst: 'pluck', oct: 4, vol: 0.5, harmony: true, pat: 'c0 c1 c2 c1 c0 c1 c2 c1 c0 c1 c2 c1 c0 c1 c2 c1' },
    { inst: 'drums', vol: 0.85, pat: 'K.x.S.x.KKx.S.xx' },
  ],
};

const fishing: Track = {
  name: 'fishing', bpm: 92, key: 'C',
  chords: ['C', 'F', 'C', 'G', 'Am', 'F', 'G', 'C'],
  channels: [
    { inst: 'bell', vol: 0.8, pat: 'E5:4 G5:4 C6:8 | A5:4 F5:4 C5:8 | G5:4 E5:4 C5:4 E5:4 | D5:8 B4:8 | C5:4 E5:4 A5:8 | F5:4 A5:4 C6:8 | B5:4 G5:4 D5:8 | C5:8 -:8' },
    { inst: 'bass_tri', oct: 2, pat: 'r:8 c2:8' },
    { inst: 'pad', oct: 4, vol: 0.6, harmony: true, pat: 'chord:16' },
    { inst: 'drums', vol: 0.6, pat: 'h.......x.......' },
  ],
};

const results: Track = {
  name: 'results', bpm: 120, key: 'C', bars: 4,
  chords: ['C', 'G', 'Am', 'F'],
  channels: [
    { inst: 'marimba', vol: 0.9, pat: 'C6:2 G5:2 E5:2 G5:2 C6:4 E6:4 | D6:2 B5:2 G5:2 B5:2 D6:8 | C6:2 A5:2 E5:2 A5:2 C6:4 E6:4 | F5:2 A5:2 C6:2 F6:2 E6:4 D6:4' },
    { inst: 'bass_pluck', oct: 2, pat: 'r:4 c2:4 r:4 c1:4' },
    { inst: 'pad', oct: 4, vol: 0.6, harmony: true, pat: 'chord:16' },
    { inst: 'drums', vol: 0.8, pat: 'K.h.S.h.K.h.S.hh' },
  ],
};

export const TRACKS: Record<string, Track> = { title, house, town, tubes, flume, fishing, results };
