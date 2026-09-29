// Places for the chorus lines (DAMI, SULOK): pinned in the world where a lens saw them,
// turned to the camera, laid on the ground or on a wall, carried across a cut to another
// camera, moved between a local frame and its LOOB twin; and a tone per world for lines
// that smash-cut between LABAS and LOOB.

import type { Line, Word } from '../../engine/lyrics';
import type { Basis } from '../../engine/3d/camera';
import { add, cross, dot, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import type { GlyphXf } from '../../engine/3d/words';
import { lens, TONE, type Place, type Tone } from './_lyric';
import type { Local } from './_dami_chorus';

/** fixed in the world where the lens `b` sees screen x, y (−1…1) at depth z, the em `frac` of the frame, square to that lens */
export const pin = (b: Basis, x: number, y: number, z: number, frac: number): Place => lens(b, x, y, z, frac);

/** view depth of a point */
export const depthOf = (b: Basis, p: V3) => dot(sub(p, b.pos), b.F);

/** the point on the level y = h under screen x, y (−1…1) */
export function ground(b: Basis, x: number, y: number, h = 0): V3 {
  const d = add(add(mul(b.F, b.focal), mul(b.R, x * 960)), mul(b.U, y * 540));
  return madd(b.pos, d, (h - b.pos[1]) / d[1]);
}

/** turned to the camera about its vertical, and leaning back square to the line of sight */
export function face(b: Basis | V3, pos: V3, size?: number): Place {
  const eye = Array.isArray(b) ? b : b.pos;
  const d = sub(eye, pos), right = norm([d[2], 0, -d[0]]);
  return { pos, right, up: norm(cross(norm(d), right)), size };
}

/** flat on the ground at `pos`, reading from where `eye` is */
export function flat(b: Basis | V3, pos: V3, size?: number): Place {
  const eye = Array.isArray(b) ? b : b.pos;
  const d = norm([eye[0] - pos[0], 0, eye[2] - pos[2]]);
  return { pos, right: [d[2], 0, -d[0]], up: [-d[0], 0, -d[2]], size };
}

/** the place that looks under `b` as `P` looks under `b0` (held on screen through a cut to another camera) */
export function carry(P: Place, b0: Basis, b: Basis): Place {
  const k = b0.focal / b.focal;
  const v = (d: V3, s: number): V3 => {
    const x = dot(d, b0.R) * s, y = dot(d, b0.U) * s, z = dot(d, b0.F);
    return add(add(mul(b.R, x), mul(b.U, y)), mul(b.F, z));
  };
  return {
    pos: add(b.pos, v(sub(P.pos, b0.pos), k)),
    right: norm(v(P.right ?? [1, 0, 0], k)), up: norm(v(P.up ?? [0, 1, 0], k)),
    size: P.size !== undefined ? P.size * k : undefined,
  };
}

/** a place in a local frame, and back: the same place relative to the corner and to the house */
export function toLocal(L: Local, P: Place): Place {
  const p = (q: V3): V3 => [dot(q, L.X), q[1], dot(q, L.F)];
  return { pos: p(sub(P.pos, L.a)), right: p(P.right ?? [1, 0, 0]), up: p(P.up ?? [0, 1, 0]), size: P.size };
}
export function fromLocal(L: Local, P: Place): Place {
  const p = (q: V3): V3 => add(madd(mul(L.X, q[0]), L.F, q[2]), [0, q[1], 0]);
  return { pos: add(L.a, p(P.pos)), right: p(P.right ?? [1, 0, 0]), up: p(P.up ?? [0, 1, 0]), size: P.size };
}

/** 1 while sung, cooling over .35 s after (as the track heats its words) */
export function heat(w: Word, t: number) {
  if (t < w.start) return 0;
  if (t <= w.end) return 1;
  return Math.exp(-(t - w.end) / 0.35);
}

/** per-glyph colour for a line that smash-cuts: its LOOB tone on the inside, LABAS outside */
export const worlds = (line: Line, inner: (t: number) => boolean, out: Tone = TONE.labas, inn: Tone = TONE.loob) =>
  (k: number, _i: number, _u: number, t: number): GlyphXf => {
    const T = inner(t) ? inn : out;
    return { col: mix3(T.rest, T.hot, heat(line.words[k], t)) };
  };

/** every word of a line but the ones named (to stage a line a word at a time) */
export const others = (line: Line, ...keep: string[]) => {
  const n = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const K = new Set(keep.map(n));
  return line.words.map((w) => w.w).filter((w) => !K.has(n(w)));
};
