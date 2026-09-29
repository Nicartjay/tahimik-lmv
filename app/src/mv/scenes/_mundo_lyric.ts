// Private helpers for MUNDO's lines: words written in fireflies. `row` lays the kept words
// of a line out in one centred row (em), so a swarm and the track can share the places;
// `starWord` samples a word's glyphs into one group of a swarm; `landing` is when a word's
// flies arrive (they leave just before it is sung and have landed soon after); `frontal`
// fades a word fixed in the world as the camera leaves it behind (turned away or rolled
// over); `toneAt` is the colour the kit gives a word at t, for scenes that recolour one;
// `shade` is a soft dark halo under a staging, so a line reads over the flies' glare.

import type { Line, Word } from '../../engine/lyrics';
import type { RGB } from '../../engine/palette';
import { ease, hash, prog, smoothstep } from '../../engine/util';
import type { Basis } from '../../engine/3d/camera';
import { dot, madd, mix3, mul } from '../../engine/3d/math';
import type { Words } from '../../engine/3d/words';
import type { LineOpts, Place, Tone, Voice } from './_lyric';
import { type Swarm, wordPoints } from './_mundo_fx';
import { EMBER, GOLD } from './_self';

const FLY = mul(GOLD, 2.2), FLY_E = mul(EMBER, 2.2);

/** the text a voice sets a word in */
export const cased = (v: Voice, s: string) => (v.caps ? s.toUpperCase() : s);

/** the kept words of a line in one row centred on 0: centre and width of each, em */
export function row(W: Words, line: Line, v: Voice, keep: (k: number) => boolean = () => true) {
  const wem = line.words.map((w) => W.shape(cased(v, w.w), v.font, v.raster).w / v.raster);
  const space = W.shape(' ', v.font, v.raster).w / v.raster;
  const ks = line.words.map((_, k) => keep(k));
  const n = ks.filter(Boolean).length;
  const w = wem.reduce((s, x, k) => s + (ks[k] ? x : 0), 0) + space * (n - 1);
  let x = -w / 2;
  const xs = wem.map((ww, k) => {
    if (!ks[k]) return 0;
    const c = x + ww / 2;
    x += ww + space;
    return c;
  });
  return { xs, wem, w };
}

/**
 * A word's fireflies as group `g` of a swarm, centred `x0` em along its row: `perEm`
 * points per em of width, `size` px.
 */
export function starWord(sw: Swarm, v: Voice, text: string, x0: number, wem: number, g: number, perEm: number, seed: number, size = 2) {
  const { pts } = wordPoints(cased(v, text), v.font, Math.round(perEm * wem), seed);
  pts.forEach((q, i) =>
    sw.add([q.p[0] + x0, q.p[1], 0], g, size * (0.75 + 0.6 * hash(i, seed, 5)), hash(i, seed, 6) < 0.2 ? FLY_E : FLY, 0.6 + 0.5 * hash(i, seed, 7), seed, i),
  );
}

/** a word's flies on their way, 0..1: out .3 s before it is sung (never before `from`), landing from just after */
export const landing = (w: Word, t: number, from = -Infinity) => prog(t, Math.max(from, w.start - 0.3), w.start + 0.45, ease.inOutSine);

/**
 * 1 while a place fixed in the world still reads from the camera, 0 once it has turned away
 * or rolled over (its axes' cosines with the camera's, faded between `a` and `c`)
 */
export const frontal = (P: Place, b: Basis, a = 0.2, c = 0.45) => smoothstep(a, c, Math.min(dot(P.right ?? [1, 0, 0], b.R), dot(P.up ?? [0, 1, 0], b.U)));

/** the colour the kit gives a word in `tone` at t: hot while sung, cooling after */
export function toneAt(tone: Tone, w: Word, t: number): RGB {
  const heat = t < w.start ? 0 : t <= w.end ? 1 : Math.exp(-(t - w.end) / 0.35);
  return mix3(tone.rest, tone.hot, heat);
}

const SHADE: RGB = [0.012, 0.009, 0.006];

/**
 * A soft dark halo for a staging over bright light, where bloom washes a thin stroke out:
 * `n` copies of it in `col` at `a`, nudged `r` em around each word. Add them before it.
 */
export function shade(o: LineOpts, r = 0.045, n = 8, a = 0.3, col: RGB = SHADE): LineOpts[] {
  return [...Array(n)].map((_, j) => {
    const th = (2 * Math.PI * j) / n, dx = Math.cos(th) * r, dy = Math.sin(th) * r;
    const nudge = (P: Place): Place => {
      const s = P.size ?? o.size;
      return { ...P, pos: madd(madd(P.pos, P.right ?? [1, 0, 0], dx * s), P.up ?? [0, 1, 0], dy * s) };
    };
    const at = o.at;
    return {
      ...o,
      at: typeof at === 'function' ? (t, b) => nudge(at(t, b)) : nudge(at),
      wordAt: o.wordAt && ((k, t, b) => nudge(o.wordAt!(k, t, b))),
      each: (k, i, u, t) => {
        const g = o.each?.(k, i, u, t) || {};
        return { ...g, col, alpha: a * (g.alpha ?? 1) };
      },
    };
  });
}
