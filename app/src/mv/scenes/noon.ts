// 06 · SIMULA NOON — A corridor of floating photographs, 2008 to now, one print per beat, each with the self at its edge.
//
// v1  the camera flies down a corridor of floating line prints, one a year from 2026 back to
//     2008, a print per beat; in each the self stands apart at the edge of the group and a
//     gold marker rings them as we reach it. On "simula" the years rush past; on "noon" the
//     word hangs before the last print, its first O over the ringed child, and the camera
//     flies through the O into the photograph until the ring fills the frame.
// v2  smash cuts on the downbeats between the corridor and LOOB's sky, where fireflies light
//     up the same sketch as a constellation over the sea; the last is 2008, the child's
//     chest flares on "noon" and the camera dives into it (the frames before the cut are gold).

import type { RT } from '../../engine/gl';
import { mono } from '../../engine/fonts';
import { Lyrics, type Word } from '../../engine/lyrics';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, hash, lerp, prog, smoothstep } from '../../engine/util';
import { basis, cam, handheld, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import type { WordShape } from '../../engine/3d/words';
import { beats, bars, decay, DIVE_COL, diveOut, impact, mergePost, towardDive } from './_fx';
import { INK } from './_labas';
import { GOLD, lightOf } from './_self';
import { chorusGrid, Flies, HERO, kit, PAPER, planeAxes, SELF_INK, smashIdx, tintUniforms, toFrame } from './_dami_chorus';
import { ageOf, BACK, FIG, FRAME, IMG, N_PRINTS, ringPts, SELF, sketch, YEAR0, type P2, type Sketch } from './_noon_prints';

// ---------------------------------------------------------------- the corridor

const GAP = 6, SIDE_X = 2.4, EYE = 1.7, TURN = 0.75;
const LAST = N_PRINTS - 1;
const Z_LAST = -4.5 - GAP * LAST;
const zOf = (k: number) => (k === LAST ? Z_LAST : -4.5 - GAP * k);
const sideOf = (k: number) => (k === LAST ? 0 : k % 2 ? 1 : -1);

interface Print {
  c: V3;
  u: V3;
  v: V3;
  sc: number;
  /** bob amplitude, metres */
  amp: number;
}

function printAt(k: number): Print {
  if (k === LAST) return { c: [0, EYE, Z_LAST], u: [1, 0, 0], v: [0, 1, 0], sc: 1.25, amp: 0 };
  const side = sideOf(k);
  let { u, v } = planeAxes([-side * Math.sin(TURN), 0, Math.cos(TURN)]);
  const r = (hash(k, 3, 61) - 0.5) * 0.08, cr = Math.cos(r), sr = Math.sin(r);
  [u, v] = [add(mul(u, cr), mul(v, sr)), add(mul(v, cr), mul(u, -sr))];
  return { c: [side * SIDE_X, EYE + (hash(k, 4, 61) - 0.5) * 0.12, zOf(k)], u, v, sc: 1, amp: 0.045 };
}

/** a print floating: the same bob as the BOB hook */
const bob = (P: Print, k: number, t: number) => P.amp * Math.sin(t * 0.8 + k * 1.9);
const onPrint = (P: Print, q: P2, dy = 0): V3 => add(madd(madd(P.c, P.u, q[0] * P.sc), P.v, q[1] * P.sc), [0, dy, 0]);

const BOB = /* glsl */ `
uniform float uT;
vec3 warp(vec3 p, vec4 d, float end) { p.y += d.y * sin(uT * .8 + d.x * 1.9); return p; }`;

const LOOK = [
  { col: mul(PAPER, 0.5), w: 1.5, a: 1 }, // FRAME
  { col: mul(INK.line, 0.6), w: 0.8, a: 1 }, // BACK
  { col: INK.line, w: 1.0, a: 1 }, // FIG
  { col: SELF_INK, w: 1.25, a: 1 }, // SELF
];
const CARD = mul(lin('slate'), 0.7);

let corr: { lines: LineBatch; cards: LineBatch; sk: Sketch[]; P: Print[] } | null = null;
function corridor() {
  if (corr) return corr;
  const sk = [...Array(N_PRINTS)].map((_, k) => sketch(k));
  const P = sk.map((_, k) => printAt(k));
  const lines = new LineBatch(12000, BOB);
  // each print's card, dark matte behind its lines: horizontal strips (they stay in the
  // print's plane seen obliquely), far prints first so the near ones cover them
  const cards = new LineBatch(N_PRINTS * 12, BOB, 'over');
  for (let k = LAST; k >= 0; k--) {
    const p = P[k], d = [k, p.amp, 0, 0], n = 12, hh = 2 / n;
    for (let i = 0; i < n; i++) {
      const y = -1 + (i + 0.5) * hh;
      cards.seg(onPrint(p, [-0.8, y]), onPrint(p, [0.8, y]), -hh * p.sc * 1.12, CARD, 0.92, d);
    }
  }
  for (let k = 0; k < N_PRINTS; k++) {
    const p = P[k], d = [k, p.amp, 0, 0];
    for (const s of sk[k].segs) {
      const L = LOOK[s.k];
      lines.seg(onPrint(p, s.a), onPrint(p, s.b), L.w, L.col, L.a, d);
    }
  }
  return (corr = { lines, cards, sk, P });
}

let marks: { rings: LineBatch; sparks: GlowPoints } | null = null;
const markers = () => (marks ??= { rings: new LineBatch(1600), sparks: new GlowPoints(64) });

// ---------------------------------------------------------------- the constellation

/**
 * LOOB's sky: the sketch without its print, centred on the group (`o`, print units) and
 * laid out `k` metres to the unit, facing the sea
 */
interface SkyMap {
  o: P2;
  k: number;
}
const CC: V3 = [0, 30, -125];
const CN = norm([0, -27.4, 130]);
const CA = planeAxes(CN);
const skyAt = (m: SkyMap, q: P2): V3 => madd(madd(CC, CA.u, (q[0] - m.o[0]) * m.k), CA.v, (q[1] - m.o[1]) * m.k);

/** stars ignite in order d.x as uK passes it; the self's (d.y) flare with uFlare; d.w picks the constellation */
const STARS = /* glsl */ `
uniform float uT, uK, uFlare, uWhich;
vec4 tint(vec4 c, vec3 p, vec4 d) {
  if (abs(d.w - uWhich) > .5) return vec4(0.);
  float on = smoothstep(d.x - .04, d.x, uK), age = max(uK - d.x, 0.);
  float tw = .75 + .25 * sin(uT * (1.5 + 3. * d.z) + d.z * 40.);
  float f = d.y > .5 ? uFlare : 1.;
  return vec4(c.rgb * f, c.a * on * tw * (1. + 2. * exp(-age * 30.)));
}`;
const STAR_LINES = /* glsl */ `
uniform float uK, uWhich;
vec4 tint(vec4 c, vec3 p, vec4 d) {
  if (abs(d.w - uWhich) > .5) return vec4(0.);
  return vec4(c.rgb, c.a * smoothstep(d.x, d.x + .08, uK));
}`;

const STAR_COL = [mul(GOLD, 0.3), mul(GOLD, 0.4), mul(GOLD, 0.85), mul(mix3(GOLD, PAPER, 0.35), 1.1)];

/** the group's bounding box centre, print units */
function groupCentre(s: Sketch): P2 {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const g of s.segs)
    if (g.k >= FIG) for (const q of [g.a, g.b]) (x0 = Math.min(x0, q[0])), (x1 = Math.max(x1, q[0])), (y0 = Math.min(y0, q[1])), (y1 = Math.max(y1, q[1]));
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

let sky: { stars: GlowPoints; lines: LineBatch; maps: SkyMap[] } | null = null;
/** the constellations of prints `ks` (d.w = their index in `ks`), grown so the group fills the sky */
function constellations(ks: number[]) {
  if (sky) return sky;
  const stars = new GlowPoints(6000, STARS), lines = new LineBatch(3000, STAR_LINES), maps: SkyMap[] = [];
  ks.forEach((k, which) => {
    const s = sketch(k), seen = new Set<string>(), m: SkyMap = { o: groupCentre(s), k: 46 / ageOf(k) };
    maps.push(m);
    let y0 = Infinity, y1 = -Infinity;
    for (const g of s.segs) if (g.k === SELF) (y0 = Math.min(y0, g.a[1], g.b[1])), (y1 = Math.max(y1, g.a[1], g.b[1]));
    const order = (q: P2, kind: number, i: number) =>
      kind === BACK ? 0.25 * ((q[1] - IMG.y0) / (IMG.y1 - IMG.y0)) * (0.7 + 0.3 * hash(i, k, 3))
        : kind === FIG ? 0.27 + 0.55 * ((q[0] + IMG.x) / (2 * IMG.x)) + 0.03 * hash(i, k, 4)
          : 0.88 + 0.08 * ((q[1] - y0) / Math.max(1e-3, y1 - y0));
    const star = (q: P2, kind: number, size: number, i: number) => {
      const key = `${Math.round(q[0] * 400)},${Math.round(q[1] * 400)}`;
      if (seen.has(key)) return;
      seen.add(key);
      stars.point(skyAt(m, q), size, STAR_COL[kind], 1, [order(q, kind, i), kind === SELF ? 1 : 0, hash(i, k, 5), which]);
    };
    let head: P2[] = [];
    s.segs.forEach((g, i) => {
      if (g.k === FRAME) return;
      const lc = g.k === SELF ? mul(GOLD, 0.4) : g.k === BACK ? mul(GOLD, 0.12) : mul(GOLD, 0.22);
      lines.seg(skyAt(m, g.a), skyAt(m, g.b), 1, lc, 0.8, [order(g.a, g.k, i), 0, 0, which]);
      if (g.head) {
        // a head is one bright star
        head.push(g.a);
        if (head.length === 12) {
          const c: P2 = [head.reduce((a, p) => a + p[0], 0) / 12, head.reduce((a, p) => a + p[1], 0) / 12];
          star(c, g.k, -0.55, i);
          head = [];
        }
        return;
      }
      const big = g.k === BACK ? -0.2 : -0.3;
      star(g.a, g.k, big, i);
      star(g.b, g.k, big, i + 7);
      // and fainter ones between
      const L = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]), n = Math.floor(L / (g.k === BACK ? 0.12 : 0.06));
      for (let j = 1; j < n; j++) {
        const u = j / n;
        star([lerp(g.a[0], g.b[0], u), lerp(g.a[1], g.b[1], u)], g.k, -0.14, i * 31 + j);
      }
    });
    // the marker ring round the self, drawn in fireflies last
    const rp = ringPts(s, k, 1);
    for (let i = 0; i < rp.length; i++) stars.point(skyAt(m, rp[i]), -0.22, mul(GOLD, 1.2), 1, [0.97 + 0.03 * (i / rp.length), 0, hash(i, k, 6), which]);
  });
  return (sky = { stars, lines, maps });
}

let chestStar: GlowPoints | null = null;

// ---------------------------------------------------------------- the scene

const YEAR = mono(100, 400, false, 2);

export default class Noon extends Scene {
  maxSamples = 108;
  private w!: Word;
  private S!: WordShape;
  private years!: WordShape[];
  private B!: number[];
  private flies?: Flies;
  /** v2: the print whose constellation the first LOOB shot shows */
  private kSky = 2;

  get v(): number {
    return this.params.v ?? 1;
  }

  async init() {
    const cut: number = this.params.cut, next: number = this.params.next;
    this.w = Lyrics.word(this.lyrics.find('Ganito na yata', cut - 1), 'noon');
    this.S = kit.words.shape('NOON', HERO);
    this.years = [...Array(N_PRINTS)].map((_, k) => kit.words.shape(String(YEAR0 - k), YEAR));
    this.B = beats(this.audio, cut - 0.1, next + 1);
    corridor();
    markers();
    chorusGrid();
    kit.sky;
    if (this.v === 2) {
      this.maxSamples = 36;
      kit.loob;
      kit.fill;
      this.kSky = Math.min(LAST - 1, Math.floor(this.q2(this.cuts()[1]) + 0.1));
      constellations([this.kSky, LAST]);
      chestStar = new GlowPoints(4);
      this.flies = new Flies(2000, 50, 31);
    }
  }

  render(f: Frame, out: RT): Post {
    return this.v === 2 ? this.v2(f, out) : this.v1(f, out);
  }

  // ---------------------------------------------------------------- shared

  /** the corridor looked at from `c`: sky, floor, prints, the rings drawn round the self as they come on (`ring(k)` 0..1) */
  private corridorDraw(out: RT, b: Basis, t: number, ring: (k: number) => number, spark = 1) {
    const { lines, cards, sk, P } = corridor(), { rings, sparks } = markers();
    kit.sky.draw(out, b, { band: 0.5 });
    chorusGrid().draw(out, b, { fog: [16, 0.02], uniforms: tintUniforms({}) });
    const fog: [number, number] = [18, 0.03], uniforms = { uT: t };
    cards.draw(out, b, { fog, uniforms });
    lines.draw(out, b, { fog, uniforms });

    rings.clear();
    sparks.clear();
    const W = kit.words.clear(), gold = mul(GOLD, 1.4);
    for (let k = 0; k < N_PRINTS; k++) {
      const p = P[k], dz = b.pos[2] - p.c[2];
      if (dz < -1 || dz > 90) continue;
      const dy = bob(p, k, t), s = sk[k], on = ring(k);
      if (on > 0) rings.poly(ringPts(s, k, on).map((q) => onPrint(p, q, dy)), 1.6, gold, 1);
      // the light in them: a spark in the self's chest, in every year
      sparks.point(onPrint(p, s.chest, dy), -0.007 * p.sc, mul(GOLD, 1.3), spark * (0.6 + 0.4 * on));
      W.word(this.years[k], { pos: onPrint(p, [0, -0.77], dy), right: p.u, up: p.v, height: 0.15 * p.sc, col: mul(PAPER, 0.55) });
    }
    rings.draw(out, b, { fog });
    sparks.draw(out, b, { fog });
    return W;
  }

  /** where the camera looks, and stands aside, for print k */
  private look(k: number, eye: number): { tgt: V3; x: number } {
    const p = corridor().P[k];
    return { tgt: mix3([0, eye, zOf(k) - 3], p.c, 0.85), x: -0.45 * sideOf(k) };
  }

  // ---------------------------------------------------------------- v1

  /** prints passed: a surge on each of the first 11 beats, a rush through the rest on "simula" */
  private q1(t: number): number {
    const B = this.B;
    let q = 0;
    for (let j = 1; j <= 12; j++) q += 0.14 * prog(t, B[j - 1], B[j]) + (j <= 11 ? 0.86 * ease.outCubic(prog(t, B[j] - 0.03, B[j] + 0.45)) : 0);
    return q + (LAST - 11.14) * ease.inOutCubic(prog(t, B[12], this.w.start));
  }

  private v1(f: Frame, out: RT): Post {
    const t = f.t, next: number = this.params.next, B = this.B, w = this.w;
    const { P, sk } = corridor();
    const tN = w.start, tP = tN + 0.62;
    const last = P[LAST], head = onPrint(last, sk[LAST].head);
    const Sp: V3 = [0, EYE, zOf(LAST - 1) - 2.1], E: V3 = add(head, [0, 0, 0.36]);

    // wide in the rush, settling for the last print
    const rw = smoothstep(B[12], B[12] + 0.35, t), settle = prog(t, tN - 0.4, tN + 0.3, ease.inOutSine);
    const fov = 40 + 16 * rw * (1 - settle) + 2 * settle;
    let c: Cam;
    if (t < tN) {
      const q = this.q1(t), k0 = Math.min(Math.floor(q), LAST - 1), wq = smoothstep(0.05, 0.6, q - k0);
      const a = this.look(k0, EYE), b1 = this.look(k0 + 1, EYE);
      // the rush: eyes front
      const tgt = mix3(mix3(a.tgt, b1.tgt, wq), last.c, rw);
      const x = lerp(a.x, b1.x, wq) * (1 - rw);
      // at rest a step closer than the print's own mark, so each one fills the frame
      c = cam([x, EYE, -GAP * q - 1.2 * (1 - prog(t, B[12], tN, ease.inOutSine))], tgt, fov);
    } else if (t < tP) {
      const k = prog(t, tN, tP, ease.outSine);
      c = cam([0, EYE, lerp(-GAP * LAST, Sp[2], k)], last.c, fov);
    } else {
      // through the O, into the photograph
      const k = prog(t, tP, next, ease.inQuad);
      c = cam(mix3(Sp, E, k), mix3(last.c, head, prog(t, tP - 0.2, next, ease.inOutSine)), fov);
    }
    const b = basis(handheld(c, t, 0.004 * (1 - prog(t, tP - 0.3, tP)), 0.7, 9), 0.02);

    const ring = (k: number) =>
      k === LAST ? prog(t, tN + 0.2, tN + 0.8, ease.inOutSine)
        : k <= 11 ? prog(t, B[k] + 0.1, B[k] + 0.45, ease.inOutSine)
          : prog(b.pos[2] - zOf(k), 14, 8);
    const W = this.corridorDraw(out, b, t, ring);

    // NOON before the last print, its first O on the line to the ringed child
    if (t >= tN - 0.05) {
      const h = 0.75, kk = h / 320, zW = zOf(LAST) + 1.7, g1 = this.S.glyphs[1];
      const Q = mix3(Sp, E, (zW - Sp[2]) / (E[2] - Sp[2]));
      const pos = sub(sub(Q, [(g1.cx - 0.5 * this.S.w) * kk, 0, 0]), [0, (g1.cy - 0.36 * 320) * kk, 0]);
      W.word(this.S, {
        // dimmed as the camera reaches it, so the pass through the O is a dark wipe
        pos, right: [1, 0, 0], up: [0, 1, 0], height: h, col: mul(PAPER, 1.1), alpha: 1 - 0.55 * prog(t, tP + 0.15, tP + 0.55),
        each: (i) => {
          const q = Lyrics.charProgress(w, i, t);
          return { alpha: smoothstep(0, 0.25, q), scale: lerp(1.5, 1, ease.outExpo(q)) };
        },
      });
    }
    W.draw(out, b, { fog: [18, 0.03], nearFade: 0.25 });

    const surge = decay(t, B.slice(1, 12), 0.2);
    return { bloom: 0.7, grain: 0.045, vignette: 0.42, ca: 0.25 * surge };
  }

  // ---------------------------------------------------------------- v2

  private cuts(): number[] {
    const cut: number = this.params.cut, next: number = this.params.next;
    return [cut, ...bars(this.audio, cut + 0.5, next - 0.5).filter((x) => x < next - 0.9)].map(toFrame);
  }

  /** prints passed: a surge every beat, on through the shots in the sky */
  private q2(t: number): number {
    const B = this.B;
    let q = 0;
    for (let j = 1; j < B.length && B[j] < this.params.next; j++) q += 0.2 * prog(t, B[j - 1], B[j]) + 0.8 * ease.outCubic(prog(t, B[j] - 0.03, B[j] + 0.4));
    return Math.min(q, LAST - 1.2);
  }

  private v2(f: Frame, out: RT): Post {
    const t = f.t, next: number = this.params.next, w = this.w, B = this.B;
    const cuts = this.cuts(), seg = smashIdx(t, cuts), inSky = seg % 2 === 1;
    const W = kit.words.clear();
    let post: Post, depth: RT | undefined, fillK = 0;

    if (!inSky) {
      // the corridor from lower down, rolling towards each print as it comes
      const eye = 1.3, q = this.q2(t), k0 = Math.floor(q), wq = smoothstep(0.05, 0.6, q - k0);
      const a = this.look(k0, eye), b1 = this.look(k0 + 1, eye);
      const roll = 0.05 * lerp(sideOf(k0), sideOf(k0 + 1), wq);
      const c = cam([lerp(a.x, b1.x, wq) * 1.3, eye, -GAP * q], mix3(a.tgt, b1.tgt, wq), 50, roll);
      const b = basis(handheld(c, t, 0.005, 0.8, 12));
      const ring = (k: number) => (k < B.length ? prog(t, B[k] + 0.1, B[k] + 0.45, ease.inOutSine) : 0);
      this.corridorDraw(out, b, t, ring).draw(out, b, { fog: [18, 0.03] });
      post = { bloom: 0.7, grain: 0.045, vignette: 0.42 };
    } else {
      // LOOB: the same sketch in fireflies over the sea
      const last = seg === 3, which = last ? 1 : 0, k = last ? LAST : this.kSky;
      const t0 = cuts[seg], t1 = seg + 1 < cuts.length ? cuts[seg + 1] : next;
      const { stars, lines, maps } = constellations([this.kSky, LAST]), m = maps[which];
      const s = sketch(k), chest = skyAt(m, s.chest);
      const flare = last ? prog(t, w.start, w.end, ease.outCubic) : 0;
      const dv = last ? prog(t, w.end - 0.36, next, ease.inCubic) : 0;
      const lift = sub(CC, [0, 4, 0]);
      let c: Cam;
      if (!last) {
        const kk = prog(t, t0, t1, ease.inOutSine);
        c = cam([lerp(-3, -1.5, kk), lerp(2.6, 3.2, kk), lerp(6, 2, kk)], lift, 36);
      } else {
        const kk = prog(t, t0, next, ease.inOutSine);
        const p0: V3 = [lerp(3, 1.2, kk), lerp(2.4, 3.5, kk), lerp(8, 0, kk)];
        // halfway to the flare while NOON is sung under their feet, then all the way in
        const aim = 0.35 * prog(t, w.start - 0.3, w.end, ease.inOutSine) + 0.65 * dv;
        c = cam(mix3(p0, chest, 0.3 * dv), mix3(lift, chest, aim), lerp(36, 16, dv));
      }
      const b = basis(handheld(c, t, 0.004, 0.7, 14));
      depth = this.rt(0);
      const light = lightOf(this.liwanag(t));
      kit.loob.draw(out, depth, b, t, {
        wave: 0.5, isles: 0.25, isleY: 12, haze: 0.004, lum: 0.3, stars: 0.8, sunI: 0,
        glow: chest, glowI: light * (0.15 + 2.5 * flare), glowR: 1.2, steps: 90,
      });
      const uK = prog(t, t0 + 0.05, last ? w.start - 0.25 : t0 + 1.9, ease.inOutSine);
      lines.draw(out, b, { depth, uniforms: { uK, uWhich: which } });
      stars.draw(out, b, { depth, uniforms: { uT: t, uK, uFlare: 1 + 1.5 * flare, uWhich: which } });
      if (last) {
        // the firefly in the child's chest
        chestStar!.clear().point(chest, -(0.5 + 2.5 * flare + 5 * dv), mul(GOLD, 1.5 + 5 * flare), smoothstep(0.85, 0.95, uK));
        chestStar!.draw(out, b, { depth });
      }
      this.flies!.draw(out, b, { t, centre: b.pos, density: 0.15, depth, fog: [20, 0.02], nearFade: 5 });

      // the caption under their feet
      const cap = skyAt(m, [m.o[0], -0.5]);
      if (!last) {
        W.word(this.years[k], { pos: cap, right: CA.u, up: CA.v, height: 0.07 * m.k, col: mul(GOLD, 1.2), alpha: smoothstep(0.2, 0.35, uK) });
      } else if (t >= w.start - 0.05) {
        W.word(this.S, {
          pos: cap, right: CA.u, up: CA.v, height: 0.15 * m.k, col: mul(GOLD, 1.6),
          each: (i) => {
            const q = Lyrics.charProgress(w, i, t);
            return { alpha: smoothstep(0, 0.3, q), scale: lerp(0.6, 1, ease.outCubic(q)) };
          },
        });
      }
      W.draw(out, b, { depth });
      if (last) fillK = Math.min(1, diveOut(t, next - 0.06, 0.44));
      post = { bloom: 0.95, grain: 0.04, vignette: 0.32 };
    }

    if (fillK > 0) kit.fill.draw(out, DIVE_COL, fillK, 'over');
    return towardDive(mergePost(post, impact(t, cuts.slice(1), { flash: 0.02, ca: 0.7, shake: 9, tau: 0.18, seed: 7 })), fillK);
  }
}

