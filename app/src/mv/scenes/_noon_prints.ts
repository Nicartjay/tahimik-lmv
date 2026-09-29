// The photographs of SIMULA NOON, one a year from 2026 back to 2008: each a flat line sketch
// (a stage, a party, a group, a class) in print units (the print is 1.6 × 2, centred), with
// the self apart at the edge of the group. Laid into the corridor as line prints, or into
// LOOB's sky as fireflies.

import { hash, lerp, TAU } from '../../engine/util';
import type { V3 } from '../../engine/3d/math';
import { figure, HEAD_R, lerpPose, POSE, type Pose } from './_labas';

export type P2 = [number, number];
/** what a sketch line is: the print's frame, the scene behind, a figure, the self */
export const FRAME = 0, BACK = 1, FIG = 2, SELF = 3;

export interface Sketch {
  /** `head`: a segment of a head's ring (the constellation lights a head as one star) */
  segs: { a: P2; b: P2; k: number; head?: boolean }[];
  /** the self's head and chest, and the marker ring drawn round the head */
  head: P2;
  chest: P2;
  /** head radius, print units */
  headR: number;
  ring: { c: P2; rx: number; ry: number; a0: number };
}

export const N_PRINTS = 19;
export const YEAR0 = 2026;
/** the image inside the print's border; the caption strip is below it */
export const IMG = { x: 0.68, y0: -0.52, y1: 0.88 };
const GY = -0.42;
const FS = 0.4;

const KINDS = ['stage', 'party', 'row', 'party', 'row', 'party', 'row', 'stage', 'class', 'party', 'class', 'row', 'class', 'party', 'class', 'row', 'class', 'party', 'class'] as const;

class Sk {
  segs: Sketch['segs'] = [];
  s(a: P2, b: P2, k: number, head = false) {
    this.segs.push({ a, b, k, head });
  }
  poly(p: P2[], k: number, closed = false, head = false) {
    for (let i = 0; i + 1 < p.length; i++) this.s(p[i], p[i + 1], k, head);
    if (closed) this.s(p[p.length - 1], p[0], k, head);
  }
  rect(x0: number, y0: number, x1: number, y1: number, k: number) {
    this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], k, true);
  }
  /** a posed figure pressed flat, feet at (x, y), `s` print units per metre, turned by `yaw` */
  fig(p: Pose, x: number, y: number, s: number, yaw: number, k: number): { head: P2; chest: P2; r: number } {
    const f = figure(p), c = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (q: V3): P2 => {
      const qx = c * q[0] + sn * q[2], qz = -sn * q[0] + c * q[2];
      return [x + (qx + qz * 0.35) * s, y + q[1] * s];
    };
    for (const [a, b] of f.segs) this.s(P(a), P(b), k);
    const h = P(f.head), r = HEAD_R * s, ring: P2[] = [];
    for (let i = 0; i <= 12; i++) ring.push([h[0] + r * Math.cos((i * TAU) / 12), h[1] + r * Math.sin((i * TAU) / 12)]);
    this.poly(ring, k, false, true);
    return { head: h, chest: P(f.chest), r };
  }
}

/** the self's age in print k, as a figure scale: grown now, a child in 2008 */
export const ageOf = (k: number) => (k === N_PRINTS - 1 ? 0.58 : lerp(1, 0.66, (k / 17) ** 1.3));

export function sketch(k: number): Sketch {
  const S = new Sk(), h = (i: number) => hash(k, i, 41);
  const fs = FS * ageOf(k);
  // the edge the self is on (the child in 2008 is on the right, where the camera ends)
  const sd = k === N_PRINTS - 1 ? 1 : h(0) < 0.5 ? -1 : 1;
  S.rect(-0.8, -1, 0.8, 1, FRAME);
  S.rect(-IMG.x, IMG.y0, IMG.x, IMG.y1, FRAME);
  let me: { head: P2; chest: P2; r: number };

  switch (KINDS[k]) {
    case 'row': {
      // a group photo, shoulder to shoulder; the self a step apart at the end
      const n = h(1) < 0.5 ? 4 : 5, sp = 0.17 * ageOf(k) + 0.01, x0 = -sd * 0.06 - ((n - 1) / 2) * sp;
      for (let i = 0; i < n; i++)
        S.fig(lerpPose(POSE.stand, i % 2 ? POSE.talk : POSE.laugh, 0.3 * h(10 + i)), x0 + i * sp, GY + 0.03 * h(20 + i), fs * (0.94 + 0.12 * h(30 + i)), 0.25 * (h(40 + i) - 0.5), FIG);
      me = S.fig(POSE.shy, (sd > 0 ? x0 + (n - 1) * sp : x0) + sd * (sp + 0.07), GY, fs * 0.97, sd * 0.3, SELF);
      S.s([-IMG.x, 0.34], [IMG.x, 0.34], BACK);
      const wx = (h(2) - 0.5) * 0.7;
      S.rect(wx - 0.14, 0.44, wx + 0.14, 0.74, BACK);
      S.s([wx, 0.44], [wx, 0.74], BACK);
      break;
    }
    case 'party': {
      // everyone turned to each other, laughing; the self turned half away
      const P = [POSE.laugh, POSE.talk, POSE.cheer, POSE.laugh, POSE.talk];
      const n = h(1) < 0.5 ? 4 : 5, sp = 0.15 * ageOf(k) + 0.01, cx = -sd * 0.1;
      for (let i = 0; i < n; i++) {
        const x = cx + (i - (n - 1) / 2) * sp + (h(50 + i) - 0.5) * 0.04;
        S.fig(P[(i + k) % 5], x, GY + 0.02 * h(20 + i), fs * (0.94 + 0.12 * h(30 + i)), (x < cx ? 0.6 : -0.6) * (0.4 + 0.6 * h(60 + i)), FIG);
      }
      me = S.fig(POSE.shy, cx + sd * (((n - 1) / 2) * sp + sp + 0.1), GY, fs * 0.97, sd * 0.5, SELF);
      // bunting
      const bp: P2[] = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        bp.push([lerp(-IMG.x, IMG.x, u), 0.8 - 0.1 * (1 - (2 * u - 1) ** 2)]);
      }
      S.poly(bp, BACK);
      for (let i = 0; i < 10; i++) {
        const [x0, y0] = bp[i], [x1, y1] = bp[i + 1];
        S.poly([[x0 + 0.015, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - 0.07], [x1 - 0.015, y1]], BACK);
      }
      break;
    }
    case 'class': {
      // a class photo: a row standing on a step, a row sitting on a bench, a board behind
      const nb = 5, nf = 4, sp = 0.18 * ageOf(k) + 0.015, sh = -sd * 0.05;
      const by = GY + 0.1, seat = GY - 0.02 + 0.48 * fs;
      S.rect(-0.42, 0.44, 0.42, 0.8, BACK);
      for (let i = 0; i < nb; i++)
        S.fig(lerpPose(POSE.stand, POSE.shy, 0.5 * h(70 + i)), sh + (i - (nb - 1) / 2) * sp, by, fs * (0.95 + 0.1 * h(80 + i)), 0.2 * (h(90 + i) - 0.5), FIG);
      S.s([sh - ((nf - 1) / 2) * sp - 0.1, seat], [sh + ((nf - 1) / 2) * sp + 0.1, seat], BACK);
      for (let i = 0; i < nf; i++) S.fig(POSE.sit, sh + (i - (nf - 1) / 2) * sp, GY - 0.02, fs * (0.95 + 0.1 * h(100 + i)), 0, FIG);
      me = S.fig(POSE.shy, sh + sd * (((nb - 1) / 2) * sp + sp + 0.05), by, fs * 0.96, sd * 0.25, SELF);
      break;
    }
    default: {
      // a stage and the backs of a crowd; the self apart at the edge, head down
      const st = GY + 0.26;
      S.rect(-0.4, GY + 0.14, 0.4, st, BACK);
      S.fig(h(3) < 0.5 ? POSE.cheer : POSE.talk, (h(4) - 0.5) * 0.2, st, fs * 0.9, 0, FIG);
      S.s([-0.3, IMG.y1], [-0.06, st], BACK);
      S.s([0.3, IMG.y1], [0.06, st], BACK);
      const n = 6;
      for (let i = 0; i < n; i++)
        S.fig(h(110 + i) < 0.5 ? POSE.cheer : POSE.stand, lerp(-sd * 0.5, sd * 0.28, i / (n - 1)) + (h(120 + i) - 0.5) * 0.05, GY - 0.07 + 0.03 * h(130 + i), fs * 1.08, Math.PI, FIG);
      me = S.fig(POSE.shy, sd * 0.56, GY - 0.05, fs * 1.04, Math.PI + sd * 0.4, SELF);
    }
  }
  const r = HEAD_R * fs * 2.6 + 0.02;
  return { segs: S.segs, head: me.head, chest: me.chest, headR: me.r, ring: { c: me.head, rx: r * 1.1, ry: r * 0.95, a0: h(5) * TAU } };
}

/** the marker ring round the self, drawn on 0..1: a loop that overshoots where it closes */
export function ringPts(s: Sketch, k: number, on: number): P2[] {
  const { c, rx, ry, a0 } = s.ring, sweep = TAU + 0.55, n = Math.max(2, Math.ceil(40 * on)), out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * on * i) / n, w = 1 + 0.07 * Math.sin(3 * a + k) + 0.05 * (a - a0) / sweep;
    out.push([c[0] + Math.cos(a) * rx * w, c[1] + Math.sin(a) * ry * w]);
  }
  return out;
}
