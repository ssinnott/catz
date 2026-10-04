// The game's sound effects: every one synthesized, none sampled. Each entry is an engine `SfxDef`
// -- `(ctx, dest, when, { v, p })` schedules its voices at `when` and returns when it ends -- so the
// same code plays in the game and renders in the audio self-test (src/lib/audio/facade.ts).
//
// A meow is two sweeps through a soft nasal filter: "mi" rising, "ow" falling with a wobble. Pitch
// `p` scales every frequency, which is how a big cat and a kitten share one meow.
import { osc, noise, ring, am, echo, glass } from '../lib/audio/synth.ts';
import type { SfxDef } from '../lib/audio/sfx.ts';

/** Two notes a fifth apart, as a quick bright arpeggio. */
function arp(ctx: BaseAudioContext, dest: AudioNode, when: number, notes: number[], step: number, vol: number, type: OscillatorType = 'square'): number {
  let t = when;
  for (const f of notes) { osc(ctx, dest, t, { type, f0: f, dur: step * 1.6, vol, attack: 0.003, lp: 3800 }); t += step; }
  return t + step;
}

function meow(ctx: BaseAudioContext, dest: AudioNode, when: number, p: number, v: number, len = 1): number {
  // The filters ride on each voice (osc's own lp/hp) rather than on a shared bus: a bus has no source
  // of its own to release it, and a session of meows would leave one dangling per meow.
  const nasal = { lp: 2600, q: 2.2, hp: 380 };
  osc(ctx, dest, when, { type: 'sawtooth', f0: 520 * p, f1: 820 * p, dur: 0.11 * len, vol: 0.16 * v, attack: 0.02, ...nasal });
  osc(ctx, dest, when + 0.1 * len, { type: 'sawtooth', f0: 820 * p, f1: 430 * p, dur: 0.3 * len, vol: 0.17 * v, attack: 0.01, vib: { rate: 7, depth: 30 }, ...nasal });
  osc(ctx, dest, when, { type: 'triangle', f0: 1040 * p, f1: 1600 * p, dur: 0.11 * len, vol: 0.04 * v, attack: 0.02 });
  return when + 0.42 * len;
}

export const SFX: Record<string, SfxDef> = {
  meow: (c, d, t, { v, p }) => meow(c, d, t, p, v),
  mew: (c, d, t, { v, p }) => meow(c, d, t, 1.45 * p, v * 0.9, 0.7),
  growl: (c, d, t, { v, p }) => meow(c, d, t, 0.62 * p, v, 1.25),
  purr: (c, d, t, { v, p }) => {
    am(c, d, t, { type: 'sawtooth', f0: 64 * p, dur: 0.9, rate: 23, depth: 0.95, vol: 0.18 * v, lp: 420, attack: 0.08 });
    return noise(c, d, t, { dur: 0.9, vol: 0.05 * v, type: 'lowpass', f0: 300, attack: 0.1 });
  },
  jump: (c, d, t, { v, p }) => osc(c, d, t, { type: 'square', f0: 260 * p, f1: 620 * p, dur: 0.13, vol: 0.09 * v, lp: 2200, attack: 0.004 }),
  land: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'sine', f0: 140 * p, f1: 60 * p, dur: 0.08, vol: 0.22 * v, attack: 0.002 });
    return noise(c, d, t, { dur: 0.05, vol: 0.08 * v, type: 'lowpass', f0: 600, attack: 0.001 });
  },
  step: (c, d, t, { v, p }) => noise(c, d, t, { dur: 0.025, vol: 0.035 * v, type: 'bandpass', f0: 900 * p, q: 1.5, attack: 0.001 }),
  splash: (c, d, t, { v, p }) => {
    const wet = echo(c, d, { taps: 3, time: 0.09, wet: 0.3, when: t, life: 0.8 });
    noise(c, wet, t, { dur: 0.7, vol: 0.42 * v, type: 'bandpass', f0: 1800 * p, f1: 260 * p, q: 0.9, attack: 0.004 });
    noise(c, wet, t + 0.02, { dur: 0.45, vol: 0.16 * v, type: 'highpass', f0: 3500, attack: 0.01 });
    osc(c, wet, t, { type: 'sine', f0: 420 * p, f1: 110 * p, dur: 0.22, vol: 0.28 * v, attack: 0.002 });
    return t + 0.8;
  },
  plip: (c, d, t, { v, p }) => osc(c, d, t, { type: 'sine', f0: 1500 * p, f1: 500 * p, dur: 0.06, vol: 0.1 * v, attack: 0.001 }),
  bubbles: (c, d, t, { v, p }) => {
    for (let i = 0; i < 5; i++) osc(c, d, t + i * 0.07, { type: 'sine', f0: (300 + i * 90) * p, f1: (700 + i * 120) * p, dur: 0.05, vol: 0.08 * v, attack: 0.002 });
    return t + 0.4;
  },
  fish: (c, d, t, { v, p }) => arp(c, d, t, [988 * p, 1319 * p], 0.055, 0.07 * v),
  goldfish: (c, d, t, { v, p }) => {
    arp(c, d, t, [784 * p, 988 * p, 1175 * p, 1568 * p], 0.07, 0.07 * v);
    return glass(c, d, t + 0.28, { freqs: [1568 * p, 2349 * p], dur: 0.7, vol: 0.08 * v });
  },
  bonk: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'square', f0: 640 * p, f1: 180 * p, dur: 0.14, vol: 0.12 * v, lp: 1800, attack: 0.002 });
    return noise(c, d, t, { dur: 0.04, vol: 0.12 * v, type: 'bandpass', f0: 2400, q: 2, attack: 0.001 });
  },
  hurt: (c, d, t, { v, p }) => {
    meow(c, d, t, 1.1 * p, v * 0.8, 0.55);
    return noise(c, d, t, { dur: 0.08, vol: 0.1 * v, type: 'lowpass', f0: 900, attack: 0.002 });
  },
  swipe: (c, d, t, { v, p }) => noise(c, d, t, { dur: 0.13, vol: 0.14 * v, type: 'bandpass', f0: 700 * p, f1: 2600 * p, q: 1.4, attack: 0.01 }),
  hiya: (c, d, t, { v, p }) => {
    noise(c, d, t, { dur: 0.12, vol: 0.14 * v, type: 'bandpass', f0: 900 * p, f1: 3200 * p, q: 1.2, attack: 0.005 });
    return osc(c, d, t + 0.02, { type: 'sawtooth', f0: 520 * p, f1: 760 * p, dur: 0.16, vol: 0.07 * v, lp: 1700, attack: 0.01 });
  },
  sword: (c, d, t, { v, p }) => {
    ring(c, d, t, { type: 'square', f0: 1900 * p, modF: 2760 * p, dur: 0.32, vol: 0.06 * v, attack: 0.002 });
    return noise(c, d, t, { dur: 0.1, vol: 0.1 * v, type: 'highpass', f0: 3000, attack: 0.003 });
  },
  punch: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'sine', f0: 180 * p, f1: 60 * p, dur: 0.12, vol: 0.3 * v, attack: 0.002 });
    return noise(c, d, t, { dur: 0.07, vol: 0.14 * v, type: 'lowpass', f0: 1200, attack: 0.001 });
  },
  book: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'triangle', f0: 420 * p, f1: 300 * p, dur: 0.06, vol: 0.2 * v, attack: 0.001 });
    return noise(c, d, t, { dur: 0.05, vol: 0.12 * v, type: 'bandpass', f0: 1600, q: 1.5, attack: 0.001 });
  },
  fire: (c, d, t, { v, p }) => noise(c, d, t, { dur: 0.32, vol: 0.18 * v, type: 'lowpass', f0: 1400 * p, f1: 300 * p, attack: 0.02 }),
  jet: (c, d, t, { v }) => noise(c, d, t, { dur: 0.4, vol: 0.09 * v, type: 'highpass', f0: 1800, f1: 2600, attack: 0.03 }),
  gurgle: (c, d, t, { v, p }) => {
    for (let i = 0; i < 4; i++) osc(c, d, t + i * 0.09, { type: 'sine', f0: (140 + (i % 2) * 70) * p, f1: (260 + i * 30) * p, dur: 0.07, vol: 0.12 * v, attack: 0.004 });
    return t + 0.4;
  },
  geyser: (c, d, t, { v, p }) => {
    noise(c, d, t, { dur: 0.6, vol: 0.3 * v, type: 'bandpass', f0: 300 * p, f1: 2200 * p, q: 0.8, attack: 0.05 });
    return noise(c, d, t + 0.1, { dur: 0.5, vol: 0.1 * v, type: 'highpass', f0: 4000, attack: 0.02 });
  },
  trip: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'square', f0: 520 * p, f1: 230 * p, dur: 0.28, vol: 0.06 * v, lp: 1500, vib: { rate: 14, depth: 70 } });
    osc(c, d, t + 0.3, { type: 'sine', f0: 130, f1: 55, dur: 0.12, vol: 0.28 * v, attack: 0.002 });
    return noise(c, d, t + 0.3, { dur: 0.08, vol: 0.1 * v, type: 'lowpass', f0: 700, attack: 0.001 });
  },
  checkpoint: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'sine', f0: 1568 * p, dur: 0.9, vol: 0.12 * v, attack: 0.002 });
    osc(c, d, t, { type: 'sine', f0: 1568 * 2.76 * p, dur: 0.3, vol: 0.03 * v, attack: 0.001 });
    return osc(c, d, t + 0.12, { type: 'sine', f0: 2093 * p, dur: 0.9, vol: 0.1 * v, attack: 0.002 });
  },
  eat: (c, d, t, { v, p }) => {
    for (let i = 0; i < 3; i++) noise(c, d, t + i * 0.11, { dur: 0.05, vol: 0.13 * v, type: 'bandpass', f0: (1500 + i * 300) * p, q: 1.6, attack: 0.002 });
    return t + 0.35;
  },
  drink: (c, d, t, { v, p }) => {
    for (let i = 0; i < 3; i++) osc(c, d, t + i * 0.13, { type: 'sine', f0: 650 * p, f1: 980 * p, dur: 0.05, vol: 0.09 * v, attack: 0.002 });
    return t + 0.42;
  },
  pop: (c, d, t, { v, p }) => osc(c, d, t, { type: 'sine', f0: 520 * p, f1: 980 * p, dur: 0.07, vol: 0.12 * v, attack: 0.002 }),
  tick: (c, d, t, { v, p }) => osc(c, d, t, { type: 'square', f0: 1300 * p, dur: 0.025, vol: 0.05 * v, attack: 0.001, lp: 4000 }),
  select: (c, d, t, { v, p }) => arp(c, d, t, [660 * p, 990 * p], 0.07, 0.07 * v),
  back: (c, d, t, { v, p }) => arp(c, d, t, [700 * p, 470 * p], 0.07, 0.06 * v),
  win: (c, d, t, { v, p }) => {
    const n = [523, 659, 784, 1047, 784, 1047, 1319];
    let u = t;
    for (let i = 0; i < n.length; i++) { osc(c, d, u, { type: 'square', f0: n[i] * p, dur: i === n.length - 1 ? 0.5 : 0.12, vol: 0.07 * v, lp: 3000 }); u += i < 4 ? 0.09 : 0.13; }
    return glass(c, d, u, { freqs: [1047 * p, 1568 * p], dur: 0.9, vol: 0.06 * v });
  },
  fanfare: (c, d, t, { v, p }) => {
    const n = [392, 523, 659, 784];
    n.forEach((f, i) => osc(c, d, t + i * 0.1, { type: 'square', f0: f * p, dur: 0.35, vol: 0.06 * v, lp: 2400, attack: 0.01 }));
    return osc(c, d, t + 0.42, { type: 'square', f0: 1047 * p, dur: 0.6, vol: 0.07 * v, lp: 2600, vib: { rate: 6, depth: 14 } });
  },
  ball: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'sine', f0: 230 * p, f1: 150 * p, dur: 0.1, vol: 0.18 * v, attack: 0.002 });
    return osc(c, d, t, { type: 'triangle', f0: 900 * p, f1: 700 * p, dur: 0.03, vol: 0.05 * v, attack: 0.001 });
  },
  dash: (c, d, t, { v, p }) => noise(c, d, t, { dur: 0.22, vol: 0.16 * v, type: 'bandpass', f0: 500 * p, f1: 3500 * p, q: 1, attack: 0.01 }),
  pound: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'sine', f0: 120 * p, f1: 38 * p, dur: 0.38, vol: 0.4 * v, attack: 0.002 });
    return noise(c, d, t, { dur: 0.3, vol: 0.2 * v, type: 'lowpass', f0: 500, f1: 120, attack: 0.002 });
  },
  spring: (c, d, t, { v, p }) => osc(c, d, t, { type: 'square', f0: 180 * p, f1: 1300 * p, dur: 0.36, vol: 0.08 * v, lp: 2600, vib: { rate: 18, depth: 50 } }),
  slowmo: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'sine', f0: 880 * p, f1: 220 * p, dur: 0.6, vol: 0.12 * v, attack: 0.01 });
    return glass(c, d, t, { freqs: [660 * p, 990 * p], dur: 0.8, vol: 0.05 * v });
  },
  shadow: (c, d, t, { v, p }) => {
    noise(c, d, t, { dur: 0.3, vol: 0.1 * v, type: 'bandpass', f0: 3000 * p, f1: 600 * p, q: 2, attack: 0.02 });
    return osc(c, d, t, { type: 'sine', f0: 700 * p, f1: 300 * p, dur: 0.3, vol: 0.06 * v, attack: 0.01 });
  },
  shield: (c, d, t, { v, p }) => glass(c, d, t, { freqs: [988 * p, 1319 * p, 1976 * p], dur: 0.8, vol: 0.06 * v, trem: 9 }),
  hiss: (c, d, t, { v }) => noise(c, d, t, { dur: 0.3, vol: 0.12 * v, type: 'highpass', f0: 5000, attack: 0.01 }),
  bark: (c, d, t, { v, p }) => {
    for (let i = 0; i < 2; i++) {
      osc(c, d, t + i * 0.17, { type: 'sawtooth', f0: 340 * p, f1: 170 * p, dur: 0.11, vol: 0.12 * v, lp: 1200, attack: 0.004 });
      noise(c, d, t + i * 0.17, { dur: 0.08, vol: 0.12 * v, type: 'bandpass', f0: 900, q: 1.3, attack: 0.002 });
    }
    return t + 0.32;
  },
  squeak: (c, d, t, { v, p }) => osc(c, d, t, { type: 'sine', f0: 2300 * p, f1: 3300 * p, dur: 0.08, vol: 0.07 * v, attack: 0.003, vib: { rate: 30, depth: 60 } }),
  coo: (c, d, t, { v, p }) => osc(c, d, t, { type: 'sine', f0: 520 * p, f1: 430 * p, dur: 0.28, vol: 0.1 * v, attack: 0.03, vib: { rate: 9, depth: 40 } }),
  cheer: (c, d, t, { v, p }) => {
    noise(c, d, t, { dur: 0.6, vol: 0.06 * v, type: 'bandpass', f0: 2200, q: 0.7, attack: 0.08 });
    return arp(c, d, t, [784 * p, 988 * p, 1175 * p], 0.08, 0.05 * v, 'triangle');
  },
  snore: (c, d, t, { v, p }) => noise(c, d, t, { dur: 0.9, vol: 0.08 * v, type: 'bandpass', f0: 280 * p, f1: 520 * p, q: 3, attack: 0.3 }),
  cast: (c, d, t, { v, p }) => {
    noise(c, d, t, { dur: 0.25, vol: 0.1 * v, type: 'bandpass', f0: 2600 * p, f1: 800 * p, q: 1.4, attack: 0.01 });
    return osc(c, d, t + 0.28, { type: 'sine', f0: 900 * p, f1: 300 * p, dur: 0.08, vol: 0.1 * v, attack: 0.001 });
  },
  reel: (c, d, t, { v }) => {
    for (let i = 0; i < 6; i++) osc(c, d, t + i * 0.045, { type: 'square', f0: 1800, dur: 0.012, vol: 0.04 * v, attack: 0.001 });
    return t + 0.3;
  },
  apple: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'sine', f0: 300 * p, f1: 700 * p, dur: 0.08, vol: 0.14 * v, attack: 0.002 });
    return arp(c, d, t + 0.08, [1047 * p, 1319 * p, 1568 * p], 0.05, 0.05 * v);
  },
  worm: (c, d, t, { v, p }) => osc(c, d, t, { type: 'square', f0: 300 * p, f1: 120 * p, dur: 0.35, vol: 0.07 * v, lp: 1000, vib: { rate: 10, depth: 80 } }),
  door: (c, d, t, { v, p }) => {
    osc(c, d, t, { type: 'triangle', f0: 260 * p, f1: 180 * p, dur: 0.12, vol: 0.14 * v });
    return noise(c, d, t, { dur: 0.06, vol: 0.06 * v, type: 'lowpass', f0: 800, attack: 0.002 });
  },
  scratch: (c, d, t, { v, p }) => {
    for (let i = 0; i < 4; i++) noise(c, d, t + i * 0.08, { dur: 0.06, vol: 0.09 * v, type: 'bandpass', f0: 2600 * p, f1: 1400 * p, q: 2, attack: 0.004 });
    return t + 0.35;
  },
  sparkle: (c, d, t, { v, p }) => glass(c, d, t, { freqs: [2093 * p, 2637 * p], dur: 0.5, vol: 0.05 * v, trem: 12 }),
  whoosh: (c, d, t, { v, p }) => noise(c, d, t, { dur: 0.35, vol: 0.12 * v, type: 'bandpass', f0: 400 * p, f1: 1800 * p, q: 0.9, attack: 0.05 }),
  wheee: (c, d, t, { v, p }) => osc(c, d, t, { type: 'sawtooth', f0: 600 * p, f1: 1500 * p, dur: 0.7, vol: 0.06 * v, lp: 2200, vib: { rate: 6, depth: 30 } }),
  shake: (c, d, t, { v }) => {
    for (let i = 0; i < 6; i++) noise(c, d, t + i * 0.05, { dur: 0.04, vol: 0.06 * v, type: 'highpass', f0: 2500 + i * 300, attack: 0.002 });
    return t + 0.35;
  },
  tummy: (c, d, t, { v, p }) => osc(c, d, t, { type: 'sawtooth', f0: 90 * p, f1: 60 * p, dur: 0.5, vol: 0.1 * v, lp: 300, vib: { rate: 12, depth: 120 } }),
  roar: (c, d, t, { v, p }) => {
    noise(c, d, t, { dur: 0.5, vol: 0.12 * v, type: 'bandpass', f0: 600 * p, f1: 300 * p, q: 1.2, attack: 0.03 });
    return osc(c, d, t, { type: 'sawtooth', f0: 240 * p, f1: 160 * p, dur: 0.45, vol: 0.06 * v, lp: 900, vib: { rate: 22, depth: 90 } });
  },
};

/** Sounds that get a little random pitch per play, so repeats do not sound mechanical. */
export const JITTERED = ['meow', 'mew', 'jump', 'land', 'step', 'fish', 'bonk', 'swipe', 'plip', 'ball', 'eat', 'drink', 'squeak', 'coo', 'bark', 'scratch'];
