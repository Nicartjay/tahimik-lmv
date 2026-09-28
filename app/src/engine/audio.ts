export type EnvName = 'rms' | 'low' | 'mid' | 'high' | 'vocals' | 'drums' | 'bass' | 'other';
export type EventKind = 'kick' | 'snare' | 'hat' | 'vocal';

export interface AudioJSON {
  file: string;
  duration: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
  events: Record<EventKind, number[]>;
  envFps: number;
  env: Record<EnvName, number[]>;
}

/** first index i with a[i] > x */
function upper(a: number[], x: number) {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m] <= x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Beats follow the song's tempo drift (≈92.4 BPM, ≈90 after the bridge), so beat
 * positions are interpolated from the tracked list rather than a constant grid.
 */
export class AudioData {
  duration: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
  private ev: Record<EventKind, number[]>;
  private envs: Record<EnvName, Float32Array>;
  private fps: number;
  private firstDown: number;

  constructor(d: AudioJSON) {
    this.duration = d.duration;
    this.bpm = d.bpm;
    this.beats = d.beats;
    this.downbeats = d.downbeats;
    this.ev = d.events;
    this.fps = d.envFps;
    this.envs = {} as Record<EnvName, Float32Array>;
    for (const [k, v] of Object.entries(d.env)) this.envs[k as EnvName] = Float32Array.from(v, (x) => x / 255);
    this.firstDown = this.beats.indexOf(this.downbeats[0]);
  }

  /** 0..1 envelope, linearly interpolated */
  env(name: EnvName, t: number): number {
    const v = this.envs[name];
    const x = Math.max(0, t * this.fps);
    const i = Math.min(v.length - 2, Math.floor(x));
    const f = Math.min(1, x - i);
    return v[i] + (v[i + 1] - v[i]) * f;
  }

  /** continuous beat index at t (beat k happens at beats[k]) */
  beatAt(t: number): number {
    const b = this.beats;
    const i = upper(b, t) - 1;
    if (i < 0) return (t - b[0]) / (b[1] - b[0]);
    if (i >= b.length - 1) return b.length - 1 + (t - b[b.length - 1]) / (b[b.length - 1] - b[b.length - 2]);
    return i + (t - b[i]) / (b[i + 1] - b[i]);
  }

  /** time of (fractional) beat index */
  timeOfBeat(k: number): number {
    const b = this.beats;
    const i = Math.max(0, Math.min(b.length - 2, Math.floor(k)));
    return b[i] + (b[i + 1] - b[i]) * (k - i);
  }

  /** continuous bar index (bar 0 starts at the first downbeat) */
  barAt(t: number): number {
    return (this.beatAt(t) - this.firstDown) / 4;
  }
  timeOfBar(k: number): number {
    return this.timeOfBeat(this.firstDown + k * 4);
  }

  beatPhase(t: number) {
    const b = this.beatAt(t);
    return b - Math.floor(b);
  }
  barPhase(t: number) {
    const b = this.barAt(t);
    return b - Math.floor(b);
  }

  /** local beat period at t, seconds */
  period(t: number): number {
    const k = Math.floor(this.beatAt(t));
    return this.timeOfBeat(k + 1) - this.timeOfBeat(k);
  }

  /** snap a time to the nearest beat (div = 2 → nearest half beat, 0.25 → nearest bar) */
  snap(t: number, div = 1): number {
    const k = Math.round(this.beatAt(t) * div) / div;
    return this.timeOfBeat(k);
  }
  snapBar(t: number): number {
    return this.timeOfBar(Math.round(this.barAt(t)));
  }

  events(kind: EventKind, t0: number, t1: number): number[] {
    const a = this.ev[kind];
    return a.slice(upper(a, t0 - 1e-9), upper(a, t1));
  }

  lastEvent(kind: EventKind, t: number): number {
    const a = this.ev[kind];
    const i = upper(a, t) - 1;
    return i >= 0 ? a[i] : -Infinity;
  }

  /** decaying pulse from recent events of `kind` (1 at the hit, halves every `halfLife` s) */
  hit(kind: EventKind, t: number, halfLife = 0.12): number {
    let s = 0;
    for (const e of this.events(kind, t - halfLife * 6, t)) s += Math.pow(0.5, (t - e) / halfLife);
    return Math.min(1.5, s);
  }

  /** decaying pulse on each beat (beat grid, not onsets) */
  beatPulse(t: number, halfLife = 0.12, every = 1): number {
    const b = this.beatAt(t);
    const k = Math.floor(b / every) * every;
    return Math.pow(0.5, (t - this.timeOfBeat(k)) / halfLife);
  }
}
