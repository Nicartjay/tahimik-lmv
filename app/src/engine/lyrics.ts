import { clamp } from './util';

export interface Word {
  w: string;
  start: number;
  /** end of the sung word, extended through held notes */
  end: number;
  /** per display-char start times (seconds); char i spans [c[i], c[i+1] ?? end] */
  c: number[];
}

export interface Line {
  i: number;
  text: string;
  start: number;
  end: number;
  /** original LRC stamp window */
  lrc: [number, number];
  /** backing / echo vocal, e.g. "(dahan-dahan lang)" */
  echo: boolean;
  words: Word[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export class Lyrics {
  lines: Line[];
  constructor(data: { lines: Line[] }) {
    this.lines = data.lines;
  }

  /** every line whose text contains `q` (case / punctuation insensitive) */
  all(q: string): Line[] {
    const n = norm(q);
    return this.lines.filter((l) => norm(l.text).includes(n));
  }

  /** first line containing `q` that starts at or after t0 (with 1 s slack) — for repeated choruses */
  find(q: string, t0 = -Infinity): Line {
    const hit = this.all(q).find((l) => l.start >= t0 - 1);
    if (!hit) throw new Error(`lyric not found: "${q}" after ${t0}`);
    return hit;
  }

  /** lines overlapping [t0, t1] */
  between(t0: number, t1: number): Line[] {
    return this.lines.filter((l) => l.end >= t0 && l.start <= t1);
  }

  /** the line being sung at t (or the last one started) */
  at(t: number): Line | undefined {
    let cur: Line | undefined;
    for (const l of this.lines) if (l.start <= t) cur = l;
    return cur;
  }

  /** find a word in a line by its text (punctuation insensitive) */
  static word(line: Line, q: string, n = 0): Word {
    const k = norm(q);
    const hits = line.words.filter((w) => norm(w.w) === k || norm(w.w).includes(k));
    if (!hits[n]) throw new Error(`word "${q}" not in "${line.text}"`);
    return hits[n];
  }

  /** 0..1 sung progress through a word */
  static wordProgress(w: Word, t: number): number {
    return clamp((t - w.start) / Math.max(0.05, w.end - w.start));
  }

  /** 0..1 sung progress of display char i of a word */
  static charProgress(w: Word, i: number, t: number): number {
    const s = w.c[i] ?? w.start;
    const e = i + 1 < w.c.length ? w.c[i + 1] : w.end;
    return clamp((t - s) / Math.max(0.03, e - s));
  }

  /** 0..1 progress through the whole line */
  static lineProgress(l: Line, t: number): number {
    return clamp((t - l.start) / Math.max(0.05, l.end - l.start));
  }

  /** number of chars (of `text` joined with single spaces) sung so far, fractional */
  static charsSung(l: Line, t: number): number {
    let n = 0;
    for (let k = 0; k < l.words.length; k++) {
      const w = l.words[k];
      if (t < w.start) return n;
      for (let i = 0; i < w.w.length; i++) {
        const p = Lyrics.charProgress(w, i, t);
        if (p <= 0) return n;
        n += p;
        if (p < 1) return n;
      }
      n += k + 1 < l.words.length ? 1 : 0; // the space
    }
    return n;
  }
}
