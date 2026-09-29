// Every sung word, set into the world. A scene hands a `LyricTrack` the lines in its window,
// each with a voice, a size and a place (fixed, moving with t, or one per word), and the
// track adds their glyphs to the scene's own `Words` batch, so they are lit, fogged,
// occluded and motion-blurred with everything else. The rules are p(doom)'s:
//   · a word appears exactly as it is sung and is set by the time it ends (its letters
//     follow the syllables, `spread` s at most);
//   · while sung it is hot, then it cools to its rest colour;
//   · a line holds until `out` (by default `hold` s after it ends), then leaves.
// Layouts: `flow` (rows up to `wrap` em), `stack` (one word a row) and `slam` (every word
// in the same place, each replacing the last). Hero words a scene draws itself are
// `skip`ped here and `mark`ed there, so the coverage record (the `lyrics` render mode)
// sees every word of the song.

import { H, W as SW } from '../../engine/config';
import { measure, mono, sans, serif, type FontSpec } from '../../engine/fonts';
import type { Line, Lyrics, Word } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import { clamp, ease, hash, lerp, prog, smoothstep } from '../../engine/util';
import { project, type Basis } from '../../engine/3d/camera';
import { add, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import type { GlyphXf, Words, WordShape } from '../../engine/3d/words';

// ---------------------------------------------------------------- voices and tones

export interface Voice {
  font: FontSpec;
  /** raster px per em in the glyph atlas */
  raster: number;
  /** set in capitals */
  caps?: boolean;
}

export const VOICE = {
  /** the world outside: crowds, choruses, the loud */
  loud: { font: sans(100, 800, 'extra-condensed', 4), raster: 200, caps: true },
  /** the self's inner voice */
  quiet: { font: serif(100, 380, true, 1), raster: 200 },
  /** the self, roman: longer lines that must read at a glance */
  soft: { font: serif(100, 440, false, 0), raster: 200 },
  /** meters and captions */
  mono: { font: mono(100, 400, false, 8), raster: 160, caps: true },
} satisfies Record<string, Voice>;

/** a word's colour at rest and while sung (linear, pre-alpha) */
export interface Tone {
  rest: RGB;
  hot: RGB;
}

const PAPER = lin('paper'), GLOW = lin('glow');
export const TONE = {
  /** the outside: paper, the sung word just short of blooming */
  labas: { rest: mul(PAPER, 0.62), hot: mul(PAPER, 1.18) },
  /** others' voices, dimmer */
  ash: { rest: mul(lin('ash'), 0.45), hot: mul(PAPER, 0.95) },
  /** the inside: warm paper, the sung word in firefly gold */
  loob: { rest: mul(mix3(PAPER, GLOW, 0.35), 0.62), hot: mul(GLOW, 1.7) },
  /** lit (from the last chorus on): gold at rest, blooming while sung */
  lit: { rest: mul(GLOW, 0.8), hot: mul(GLOW, 2.2) },
} satisfies Record<string, Tone>;

// ---------------------------------------------------------------- stagings

/** where text sits: its centre, and its reading axes (default: world x, y) */
export interface Place {
  pos: V3;
  right?: V3;
  up?: V3;
  /** overrides the staging's em size */
  size?: number;
}

export type Enter = 'rise' | 'drop' | 'slam' | 'fly' | 'type' | 'fade';
export type Exit = 'fade' | 'fall' | 'fly' | 'scatter' | 'burst' | 'none';

export interface LineOpts {
  voice: Voice;
  /** world size of the em */
  size: number;
  /** the line's place: fixed, or moving with t (b is the camera now) */
  at: Place | ((t: number, b: Basis) => Place);
  /** a place per word instead (k = word index); the layout is then ignored */
  wordAt?: (k: number, t: number, b: Basis) => Place;
  layout?: 'flow' | 'stack' | 'slam';
  /** flow: row width, em */
  wrap?: number;
  /** 0 = left, .5 = centred, 1 = right */
  align?: number;
  /** row pitch, em */
  lead?: number;
  enter?: Enter;
  /** how far a glyph travels on its way in, em (rise, drop, fly) */
  travel?: number;
  /** seconds a glyph takes to arrive */
  settle?: number;
  exit?: Exit;
  /** when the line starts to leave; default its end + hold */
  out?: number;
  hold?: number;
  /** seconds its exit takes */
  exitDur?: number;
  /** the most time a word takes to set (its letters follow the syllables within it) */
  spread?: number;
  tone?: Tone;
  alpha?: number;
  /** words not yet sung, shown at this alpha (0 = hidden until sung) */
  ghost?: number;
  /** slam: overshoot of the arriving word, and its creep towards the viewer per second */
  punch?: number;
  creep?: number;
  /** words left to the scene's own hero treatment (whole words, case and punctuation aside) */
  skip?: string[];
  /** extra motion per glyph (k word, i char, u across the word 0..1); off is in world units */
  each?: (k: number, i: number, u: number, t: number) => GlyphXf | void;
}

interface Item {
  line: Line;
  o: LineOpts;
  shapes: (WordShape | null)[];
  /** word centres in em: across (x) and up (y) from the line's place */
  xy: [number, number][];
  /** word widths, em */
  wem: number[];
  out: number;
}

const normWord = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- coverage

/** best visibility (0..1) of each word since the last take, keyed "line:word" */
const seen = new Map<string, number>();
(globalThis as { __lyricSeen?: () => Record<string, number> }).__lyricSeen = () => {
  const o = Object.fromEntries(seen);
  seen.clear();
  return o;
};

/** cap height, logical px, a word needs to count as read */
const MIN_PX = 18;
const inFrame = (p: [number, number, number] | null) =>
  !!p && p[0] > SW * 0.01 && p[0] < SW * 0.99 && p[1] > H * 0.02 && p[1] < H * 0.98;

/**
 * Record how well a word is seen now: `alpha`, its centre `pos`, reading axes `right` and
 * `up`, em `size` and width `wem` (em). Fully in frame, the right way round, not edge on
 * and at least MIN_PX of cap height → alpha.
 */
export function see(line: Line, k: number, b: Basis, pos: V3, right: V3, up: V3, size: number, wem: number, alpha: number) {
  if (alpha <= 0.01) return;
  const c = project(b, pos);
  if (!c) return;
  const hw = (wem * size) / 2, hh = 0.36 * size;
  const [l, r, top, bot] = [madd(pos, right, -hw), madd(pos, right, hw), madd(pos, up, hh), madd(pos, up, -hh)].map((p) => project(b, p));
  if (![l, r, top, bot].every(inFrame)) return;
  const px = b.focal / c[2];
  // mirrored, upside down or seen edge on doesn't read
  const across = (r![0] - l![0]) / (2 * hw * px), upright = (bot![1] - top![1]) / (2 * hh * px);
  const cap = 0.7 * size * px;
  const s = clamp(alpha) * clamp(cap / MIN_PX) * clamp(across / 0.45) * clamp(upright / 0.45);
  const key = `${line.i}:${k}`;
  if (s > (seen.get(key) ?? 0)) seen.set(key, s);
}

// ---------------------------------------------------------------- the track

export class LyricTrack {
  private items: Item[] = [];
  constructor(private W: Words) {}

  /** stage a line */
  add(line: Line, o: LineOpts): this {
    const v = o.voice, f = v.font;
    const skip = new Set((o.skip ?? []).map(normWord));
    const shapes = line.words.map((w) => (skip.has(normWord(w.w)) ? null : this.W.shape(v.caps ? w.w.toUpperCase() : w.w, f, v.raster)));
    const wem = line.words.map((w, k) => (shapes[k] ? shapes[k]!.w / v.raster : measure(v.caps ? w.w.toUpperCase() : w.w, f) / f.size));
    const space = measure(' ', f) / f.size;
    // skipped words take no room: a line can be staged in parts, one staging per part
    const xy = layoutLine(o.layout ?? 'flow', wem, shapes.map(Boolean), space, o.wrap ?? 9, o.align ?? 0.5, o.lead ?? 1.05);
    this.items.push({ line, o, shapes, xy, wem, out: o.out ?? line.end + (o.hold ?? 0.9) });
    return this;
  }

  /**
   * The words of a line still being sung at the scene's opening cut, which the last shot
   * can no longer show. Held where that shot left them on screen (a `lens` place), their
   * letters still arriving with the syllables, they read as the line going on under the
   * cut, and leave just after they end.
   */
  tail(lyrics: Lyrics, cut: number, o: Omit<LineOpts, 'skip'>): this {
    const line = lyrics.lines.find((l) => l.words[0].start < cut && l.words[l.words.length - 1].end > cut);
    if (!line) return this;
    return this.add(line, { hold: 0.1, exitDur: 0.2, ...o, skip: line.words.filter((w) => w.end <= cut).map((w) => w.w) });
  }

  /** add every staged line's glyphs at t to the batch */
  draw(t: number, b: Basis) {
    for (const it of this.items) this.drawLine(it, t, b);
  }

  private drawLine(it: Item, t: number, b: Basis) {
    const { line, o } = it;
    const slam = o.layout === 'slam' && !o.wordAt;
    const exitDur = o.exitDur ?? (slam ? 0.08 : 0.32);
    const ghost = o.ghost ?? 0;
    if (t < line.words[0].start - 0.05 && ghost <= 0) return;
    if (o.exit !== 'none' && t > it.out + exitDur + 0.15) return;
    const tone = o.tone ?? TONE.labas;
    const enter = o.enter ?? (slam ? 'slam' : 'rise');
    const spread = o.spread ?? (slam ? 0 : 0.3);
    const settle = o.settle ?? (enter === 'type' ? 0.001 : enter === 'slam' ? 0.16 : 0.2);
    const travel = o.travel ?? (enter === 'drop' ? 0.45 : enter === 'fly' ? 3 : 0.7);
    const lp = o.wordAt ? null : place(o.at, t, b);

    line.words.forEach((w, k) => {
      const s = it.shapes[k];
      if (!s) return;
      const P = o.wordAt ? o.wordAt(k, t, b) : lp!;
      const size = P.size ?? o.size;
      const R = norm(P.right ?? [1, 0, 0]), U = norm(P.up ?? [0, 1, 0]);
      const [ex, ey] = o.wordAt ? [0, 0] : it.xy[k];
      const pos = madd(madd(P.pos, R, ex * size), U, ey * size);
      // leaving: the whole line at `out`; in a slam, each word when the next one lands
      const next = line.words[k + 1];
      const tOut = slam && next ? next.start : it.out;
      const x = o.exit === 'none' ? 0 : prog(t, tOut, tOut + exitDur);
      if (x >= 1) return;
      const toCam = norm(sub(b.pos, pos));
      const heat = heatOf(w, t);
      const col = mix3(tone.rest, tone.hot, heat);
      const scale0 = slam ? 1 + (o.creep ?? 0.035) * Math.max(0, t - w.start) : 1;
      let aSum = 0, aN = 0;
      this.W.word(s, {
        pos, right: R, up: U, height: size, col, alpha: o.alpha ?? 1,
        each: (i, u) => {
          // this glyph's arrival: the syllable timing, squeezed into `spread`
          const ci = w.start + ((w.c[i] ?? w.start) - w.start) * Math.min(1, spread / Math.max(1e-3, w.end - w.start));
          const e = clamp((t - ci) / settle);
          const g = arrive(enter, e, travel * size, U, toCam, o.punch ?? 0.55, i);
          if (t < ci) g.alpha = ghost;
          g.scale = (g.scale ?? 1) * scale0;
          if (x > 0) leave(o.exit ?? (slam ? 'burst' : 'fade'), x, u, i, k, size, U, toCam, g);
          const extra = o.each?.(k, i, u, t);
          if (extra) merge(g, extra);
          if (t < ci && ghost > 0) g.col = mul(tone.rest, 0.8);
          aSum += g.alpha ?? 1;
          aN++;
          return g;
        },
      });
      see(line, k, b, pos, R, U, size * scale0, it.wem[k], ((o.alpha ?? 1) * aSum) / Math.max(1, aN));
    });
  }

  /**
   * A hero word the scene draws itself (skipped here): record it for the audit. `pos` is
   * its centre, `size` its em height, `shape` the shape it is drawn with.
   */
  static mark(line: Line, w: Word, b: Basis, pos: V3, right: V3, size: number, shape: WordShape, alpha: number, up: V3 = [0, 1, 0]) {
    const k = line.words.indexOf(w);
    if (k >= 0) see(line, k, b, pos, right, up, size, shape.w / shape.r, alpha);
  }
}

const place = (at: LineOpts['at'], t: number, b: Basis): Place => (typeof at === 'function' ? at(t, b) : at);

/** word centres (em) for a layout, the block centred on the place */
function layoutLine(mode: 'flow' | 'stack' | 'slam', wem: number[], keep: boolean[], space: number, wrap: number, align: number, lead: number): [number, number][] {
  if (mode === 'slam') return wem.map(() => [0, 0]);
  const rows: number[][] = [];
  let row: number[] = [], w = 0;
  const out: [number, number][] = wem.map(() => [0, 0]);
  wem.forEach((ww, i) => {
    if (!keep[i]) return;
    if (row.length && (mode === 'stack' || w + space + ww > wrap)) {
      rows.push(row);
      row = [];
      w = 0;
    }
    w += (row.length ? space : 0) + ww;
    row.push(i);
  });
  if (row.length) rows.push(row);
  const widths = rows.map((r) => r.reduce((s, i) => s + wem[i], 0) + space * (r.length - 1));
  const blockW = Math.max(...widths);
  rows.forEach((r, j) => {
    // rows share the block's alignment edge; the block itself centres on the place
    let x = (align - 0.5) * blockW - align * widths[j];
    const y = ((rows.length - 1) / 2 - j) * lead;
    for (const i of r) {
      out[i] = [x + wem[i] / 2, y];
      x += wem[i] + space;
    }
  });
  return out;
}

/** 1 while sung, cooling over .35 s after */
function heatOf(w: Word, t: number) {
  if (t < w.start) return 0;
  if (t <= w.end) return 1;
  return Math.exp(-(t - w.end) / 0.35);
}

/** a glyph arriving, e = 0..1 of its settle time */
function arrive(enter: Enter, e: number, travel: number, U: V3, toCam: V3, punch: number, i: number): GlyphXf {
  switch (enter) {
    case 'rise': {
      const r = ease.outBack(e);
      return { off: mul(U, (r - 1) * travel), alpha: smoothstep(0, 0.35, e), tilt: (1 - r) * 0.5 };
    }
    case 'drop':
      return { off: mul(U, (1 - ease.outCubic(e)) * travel), alpha: smoothstep(0, 0.3, e) };
    case 'slam':
      return { scale: 1 + punch * (1 - ease.outExpo(e)), alpha: smoothstep(0, 0.12, e) };
    case 'fly': {
      const r = ease.outCubic(e);
      return { off: mul(toCam, (1 - r) * travel), alpha: smoothstep(0, 0.25, e), spin: (1 - r) * (i % 2 ? 0.6 : -0.6) };
    }
    case 'type':
      return { alpha: e > 0 ? 1 : 0 };
    case 'fade':
      return { alpha: ease.outCubic(e) };
  }
}

/** a glyph leaving, x = 0..1 of the exit (glyphs go left to right) */
function leave(exit: Exit, x: number, u: number, i: number, k: number, size: number, U: V3, toCam: V3, g: GlyphXf) {
  const xs = clamp((x - u * 0.3) / 0.7);
  const a = 1 - smoothstep(0.2, 1, xs);
  const off = (d: V3) => (g.off = g.off ? add(g.off, d) : d);
  switch (exit) {
    case 'fade':
      g.alpha = (g.alpha ?? 1) * (1 - xs);
      return;
    case 'fall':
      off(mul(U, -xs * xs * 2.5 * size));
      g.spin = (g.spin ?? 0) + (hash(i, k, 3) - 0.5) * 1.6 * xs;
      break;
    case 'fly':
      off(mul(toCam, xs * xs * 8 * size));
      break;
    case 'scatter': {
      const d: V3 = [hash(i, k, 1) - 0.5, hash(i, k, 2) - 0.2, hash(i, k, 4) - 0.5];
      off(mul(d, xs * 3 * size));
      g.spin = (g.spin ?? 0) + (hash(i, k, 5) - 0.5) * 3 * xs;
      break;
    }
    case 'burst':
      g.scale = (g.scale ?? 1) * (1 + 0.6 * x);
      g.alpha = (g.alpha ?? 1) * (1 - x);
      return;
    case 'none':
      return;
  }
  g.alpha = (g.alpha ?? 1) * a;
}

function merge(g: GlyphXf, x: GlyphXf) {
  if (x.off) g.off = g.off ? add(g.off, x.off) : x.off;
  if (x.spin) g.spin = (g.spin ?? 0) + x.spin;
  if (x.tilt) g.tilt = (g.tilt ?? 0) + x.tilt;
  if (x.scale !== undefined) g.scale = (g.scale ?? 1) * x.scale;
  if (x.alpha !== undefined) g.alpha = (g.alpha ?? 1) * x.alpha;
  if (x.col) g.col = x.col;
}

// ---------------------------------------------------------------- places

/** facing the camera from `pos` (horizontal reading axis, world up) */
export function facing(b: Basis | V3, pos: V3, size?: number): Place {
  const eye = Array.isArray(b) ? b : b.pos;
  const d = sub(eye, pos);
  return { pos, right: norm([d[2], 0, -d[0]]), up: [0, 1, 0], size };
}

/**
 * Fixed to the lens: screen position x (−1 left … 1 right) and y (−1 bottom … 1 top) at
 * view depth z, with the em `frac` of the frame height, turned `roll` radians
 * anticlockwise. Re-placed every sub-frame, so it stays sharp through a whip.
 */
export function lens(b: Basis, x: number, y: number, z: number, frac: number, roll = 0): Place {
  const k = z / b.focal, c = Math.cos(roll), s = Math.sin(roll);
  const pos = add(add(madd(b.pos, b.F, z), mul(b.R, x * (SW / 2) * k)), mul(b.U, y * (H / 2) * k));
  return { pos, right: madd(mul(b.R, c), b.U, s), up: madd(mul(b.U, c), b.R, -s), size: frac * H * k };
}

/** a place between two, blended by k (axes renormalised) */
export function mixPlace(a: Place, c: Place, k: number): Place {
  return {
    pos: mix3(a.pos, c.pos, k),
    right: norm(mix3(a.right ?? [1, 0, 0], c.right ?? [1, 0, 0], k)),
    up: norm(mix3(a.up ?? [0, 1, 0], c.up ?? [0, 1, 0], k)),
    size: a.size !== undefined && c.size !== undefined ? lerp(a.size, c.size, k) : c.size ?? a.size,
  };
}
