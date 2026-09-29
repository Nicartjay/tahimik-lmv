// 05 · SULOK — The self retreats to a corner; the noise drains away; walls recede to a vast quiet.
//
// v1  one unbroken move out of the crowd behind the self as they walk off the rim into a
//     corner of two walls, turn, sit and hug their knees; a push-in that breathes on
//     "huminga" (breathed out in their own quiet italic) while the crowd drains away figure
//     by figure; on "sulok" a plain cut to the corner, SULOK folded across both walls, which
//     then recede into a vast quiet as the camera cranes back.
// v2  smash cuts on the downbeats between the corner and its LOOB twin, a line house on an
//     island over the firefly sea, the same camera move carried across each cut.
// v3  dawn: the corner fills with the light leaking out of them, the walls go warm and
//     recede into fireflies; the first orbit is round them, and they stand up in it.

import type { RT } from '../../engine/gl';
import { measure } from '../../engine/fonts';
import type { Line, Word } from '../../engine/lyrics';
import { Lyrics } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, lerp, prog, smoothstep, TAU, window01 } from '../../engine/util';
import { basis, handheld, orbit, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, dot, len, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import type { WordOpts, WordShape } from '../../engine/3d/words';
import { bars, impact, mergePost } from './_fx';
import { INK, lerpPose, POSE, walk, type Pose } from './_labas';
import { carry, fromLocal, others, toLocal, worlds } from './_dami_lyric';
import { lens, LyricTrack, TONE, VOICE, type Place } from './_lyric';
import { EMBER, GOLD, lightOf } from './_self';
import {
  at, bigCrowd, camAt, chorusGrid, drawCrowd, faceR, Flies, HERO, kit, Leak, local, OUTW, PAPER, QUIET, RIM, RIM_A, SELF_INK,
  smashIdx, TANG, TINT_GLSL, tintUniforms, toFrame, type Local, type SpotLight,
} from './_dami_chorus';

const H2 = Math.SQRT1_2;

/** the corner: two walls meeting just outside the crowd's rim, opening inward; the self sits 1.3 m out of it facing the crowd */
const CORNER = madd(madd(RIM, OUTW, 3.6), TANG, 2.4);
const SEAT = madd(CORNER, OUTW, -1.3);
const LF = local(SEAT, RIM_A + Math.PI);
const WALL_L = 8, WALL_H = 4.2, CZ = -1.3;
/** the walls as local directions out of the corner (+X side, −X side) */
const WALLS: V3[] = [[H2, 0, H2], [-H2, 0, H2]];
const dirOf = (L: Local, d: V3): V3 => madd(mul(L.X, d[0]), L.F, d[2]);

/** LOOB's twin of the corner: a house on a hero island, the self's light on its doorstep */
const ISLE: [number, number, number, number] = [0, 20, 0, 7];
const LL = local([0, 21.05, 1.8], 0);

/** walls scale away from the seat (xz by s[0], height by s[1]): the corner receding */
const RECEDE = /* glsl */ `
uniform vec3 uRecC;
uniform vec2 uRec;
vec3 warp(vec3 p, vec4 d, float end) {
  return vec3(uRecC.x + (p.x - uRecC.x) * uRec.x, p.y * uRec.y, uRecC.z + (p.z - uRecC.z) * uRec.x);
}`;
const rec = (p: V3, s: [number, number]): V3 => [SEAT[0] + (p[0] - SEAT[0]) * s[0], p[1] * s[1], SEAT[2] + (p[2] - SEAT[2]) * s[0]];
/** 1 → (sx, sy) geometrically as k goes 0 → 1 */
const recede = (k: number, sx: number, sy: number): [number, number] => [sx ** k, sy ** k];
/** how much the words written on the walls grow as the walls recede */
const grow = (rs: [number, number]) => rs[0] ** 0.6 * rs[1] ** 0.4;

/** a line's place when its words are placed one by one (wordAt) */
const PER_WORD: Place = { pos: [0, 0, 0] };

/** where the self walks in from, in v1 */
const WALK0: V3 = [0.8, 0, 2.3];

// ---------------------------------------------------------------- lyric places

/**
 * A place on a wall, in a corner's frame: side 1 the wall on the right seen from the front,
 * −1 the one on the left; `along` m out of the corner and `y` up, reading left to right from
 * the front, the walls receded by `rs`.
 */
function wallAt(side: number, along: number, y: number, rs: [number, number] = [1, 1], size?: number): Place {
  const d: V3 = [-side * H2, 0, H2], n: V3 = [side * H2, 0, H2];
  const p = madd(madd([0, y, CZ], d, along), n, 0.03);
  return { pos: [p[0] * rs[0], p[1] * rs[1], p[2] * rs[0]], right: side > 0 ? d : mul(d, -1), up: [0, 1, 0], size };
}

/** screen x, y (−1…1) of p under b, and its view depth */
function screenOf(b: Basis, p: V3): V3 {
  const v = sub(p, b.pos), z = dot(v, b.F);
  return [(dot(v, b.R) * b.focal) / z / 960, (dot(v, b.U) * b.focal) / z / 540, z];
}

/** the spot on a wall of the corner the lens `b` sees at screen x, y (−1…1): along, up, and its view depth */
function onWall(b: Basis, side: number, x: number, y: number, rs: [number, number] = [1, 1]) {
  const ray = add(add(mul(b.F, b.focal), mul(b.R, x * 960)), mul(b.U, y * 540));
  const { pos: o, right: r } = toLocal(LF, { pos: b.pos, right: ray });
  const d: V3 = [-side * H2, 0, H2], n: V3 = [side * H2, 0, H2];
  const p0: V3 = [n[0] * 0.03 * rs[0], 0, (CZ + n[2] * 0.03) * rs[0]];
  const s = dot(sub(p0, o), n) / dot(r!, n), hit = madd(o, r!, s);
  return { along: dot(sub(hit, p0), d) / rs[0], y: hit[1] / rs[1], depth: s * b.focal };
}

/** the spot on a wall under b1 where a word at p, em `size`, under b0 looks the same: held on screen through a cut */
function rewall(p: V3, size: number, b0: Basis, b1: Basis, side: number, rs: [number, number] = [1, 1]) {
  const [x, y, z] = screenOf(b0, p), h = onWall(b1, side, x, y, rs);
  return { along: h.along, y: h.y, size: (size * h.depth * b0.focal) / (z * b1.focal) };
}

let walls: LineBatch | null = null;
function cornerWalls(): LineBatch {
  if (walls) return walls;
  walls = new LineBatch(1400, RECEDE + TINT_GLSL);
  const edge = mul(lin('paper'), 0.55), OUT = [-1, 0, 0, 0], c0 = at(LF, [0, 0, CZ]);
  let id = 1;
  for (const wd of WALLS) {
    const d = norm(dirOf(LF, wd));
    const P = (s: number, y: number): V3 => add(madd(c0, d, s), [0, y, 0]);
    walls.seg(P(0, 0), P(WALL_L, 0), 1.2, edge, 0.9, OUT);
    walls.seg(P(0, WALL_H), P(WALL_L, WALL_H), 1.2, edge, 0.9, OUT);
    walls.seg(P(WALL_L, 0), P(WALL_L, WALL_H), 1.2, edge, 0.9, OUT);
    // courses and staggered joints, in pieces that drain away one by one (the lines thinning)
    for (let j = 0; j < 14; j++) {
      const y0 = j * 0.3, y1 = y0 + 0.3;
      if (j > 0) for (let s = 0; s < WALL_L - 1e-6; s += 1.2) walls.seg(P(s, y0), P(Math.min(s + 1.2, WALL_L), y0), 0.8, INK.line, 0.55, [id++, 0, 0, 0]);
      for (let s = 0.6 - (j % 2) * 0.3; s < WALL_L - 0.05; s += 0.6) walls.seg(P(s, y0), P(s, y1), 0.8, INK.line, 0.55, [id++, 0, 0, 0]);
    }
  }
  walls.seg(c0, add(c0, [0, WALL_H, 0]), 1.4, edge, 1, OUT);
  return walls;
}

let house: LineBatch | null = null, windows: GlowPoints | null = null;
function islandHouse(): { house: LineBatch; windows: GlowPoints } {
  if (house && windows) return { house, windows };
  const L = (house = new LineBatch(900)), col = mul(lin('paper'), 0.5);
  const S = (a: V3, b: V3, k = 1) => L.seg(at(LL, a), at(LL, b), 1.2 * k, col, 0.9);
  const X = 1.7, Z0 = -1.0, Z1 = -4.0, H = 2.3, R = 3.45, E = 2.0, ey = 2.15, ez0 = Z0 + 0.3, ez1 = Z1 - 0.3;
  for (const y of [0, H]) {
    S([-X, y, Z0], [X, y, Z0]); S([X, y, Z0], [X, y, Z1]); S([X, y, Z1], [-X, y, Z1]); S([-X, y, Z1], [-X, y, Z0]);
  }
  // corner posts run on down into the rock, so the house sits in it whatever the ground does
  for (const x of [-X, X]) for (const z of [Z0, Z1]) S([x, -0.8, z], [x, H, z]);
  S([0, R, ez0], [0, R, ez1]);
  for (const z of [ez0, ez1]) { S([-E, ey, z], [0, R, z]); S([0, R, z], [E, ey, z]); }
  for (const x of [-E, E]) S([x, ey, ez0], [x, ey, ez1]);
  for (const f of [0.25, 0.5, 0.75]) for (const s of [-1, 1]) S([s * E * f, lerp(R, ey, f), ez0], [s * E * f, lerp(R, ey, f), ez1], 0.6);
  // the door, open, and two windows
  S([-0.45, 0, Z0], [-0.45, 1.95, Z0]); S([-0.45, 1.95, Z0], [0.45, 1.95, Z0]); S([0.45, 1.95, Z0], [0.45, 0, Z0]);
  S([0.45, 0, Z0], [0.95, 0, Z0 + 0.62]); S([0.95, 0, Z0 + 0.62], [0.95, 1.95, Z0 + 0.62]); S([0.95, 1.95, Z0 + 0.62], [0.45, 1.95, Z0]);
  for (const cx of [-1.15, 1.15]) {
    S([cx - 0.3, 1, Z0], [cx + 0.3, 1, Z0]); S([cx + 0.3, 1, Z0], [cx + 0.3, 1.65, Z0]);
    S([cx + 0.3, 1.65, Z0], [cx - 0.3, 1.65, Z0]); S([cx - 0.3, 1.65, Z0], [cx - 0.3, 1, Z0]);
    S([cx, 1, Z0], [cx, 1.65, Z0], 0.6); S([cx - 0.3, 1.325, Z0], [cx + 0.3, 1.325, Z0], 0.6);
  }
  // planks, round the openings
  for (let y = 0.38; y < H - 0.05; y += 0.38) {
    S([X, y, Z0], [X, y, Z1], 0.55); S([-X, y, Z0], [-X, y, Z1], 0.55);
    const runs = y > 1 && y < 1.65 ? [[-X, -1.45], [-0.85, -0.45], [0.45, 0.85], [1.45, X]] : y < 1.95 ? [[-X, -0.45], [0.45, X]] : [[-X, X]];
    for (const [a, b] of runs) S([a, y, Z0], [b, y, Z0], 0.55);
  }
  S([-0.7, 0.03, Z0], [-0.7, 0.03, Z0 + 0.45], 0.8); S([-0.7, 0.03, Z0 + 0.45], [0.7, 0.03, Z0 + 0.45], 0.8); S([0.7, 0.03, Z0 + 0.45], [0.7, 0.03, Z0], 0.8);
  // warm light in the windows and the doorway
  windows = new GlowPoints(4);
  for (const cx of [-1.15, 1.15]) windows.point(at(LL, [cx, 1.32, Z0 - 0.3]), -0.3, mul(EMBER, 0.9));
  windows.point(at(LL, [0, 1.0, Z0 - 0.5]), -0.5, mul(GOLD, 0.45));
  return { house, windows };
}

export default class Sulok extends Scene {
  maxSamples = 72;
  private w!: Record<'huminga' | 'sulok', Word>;
  private S!: Record<'huminga' | 'sulok', WordShape>;
  private l!: { l1: Line; l2: Line };
  private track!: LyricTrack;
  private cuts: number[] = [];
  private bb: number[] = [];
  private leak?: Leak;
  private flies?: Flies;

  get v(): number {
    return this.params.v ?? 1;
  }

  async init() {
    if (this.v === 2) this.maxSamples = 20;
    chorusGrid();
    bigCrowd();
    cornerWalls();
    const L = this.lyrics, c = this.params.cut;
    const l1 = L.find('Gusto ko lang huminga', c - 1), l2 = L.find('Sa sulok na ako', c - 1);
    this.l = { l1, l2 };
    this.w = { huminga: Lyrics.word(l1, 'huminga'), sulok: Lyrics.word(l2, 'sulok') };
    this.S = { huminga: kit.words.shape('huminga', QUIET), sulok: kit.words.shape('SULOK', HERO) };
    kit.sky; kit.self; kit.spot;
    if (this.v === 2) {
      kit.loob;
      islandHouse();
      this.flies = new Flies(2600, 50, 29);
      this.cuts = [c, ...bars(this.audio, c + 0.5, this.params.next - 0.5)].map(toFrame);
    }
    if (this.v === 3) {
      this.leak = new Leak(900, 11, 0.55);
      this.flies = new Flies(2600, 50, 23);
      this.bb = bars(this.audio, c + 0.5, this.params.next).map(toFrame);
    }
    this.track = new LyricTrack(kit.words);
    // v3: EKSENA, still being sung over the cut, where the clearing left it
    if (this.v === 3) this.track.tail(L, c, { voice: VOICE.loud, size: 1, tone: TONE.lit, at: (_t, b) => lens(b, -0.11, 0.2, 3, 0.17) });
    if (this.v === 1) this.stage1();
    else if (this.v === 2) this.stage2();
    else this.stage3();
  }

  render(f: Frame, out: RT): Post {
    return this.v === 2 ? this.v2(f, out) : this.v === 3 ? this.v3(f, out) : this.v1(f, out);
  }

  // ---------------------------------------------------------------- shared

  /** hugging the knees, breathing: `br` is −1..1 */
  private hug(br: number): Pose {
    return { ...POSE.hug, lean: POSE.hug.lean + 0.045 * br, nod: POSE.hug.nod - 0.05 * br };
  }

  private labas(out: RT, b: Basis, f: Frame, o: {
    drain: number; brick: number; rs: [number, number]; spot?: SpotLight | null; leak?: { at: V3; k: number };
    sky?: Parameters<typeof kit.sky.draw>[2]; beam?: number; pool?: number; nearFade?: number; fog?: [number, number];
  }) {
    kit.sky.draw(out, b, o.sky);
    const leak = o.leak && { ...o.leak, t: f.t }, spot = o.spot ?? null;
    chorusGrid().draw(out, b, { fog: [20, 0.012], uniforms: tintUniforms({ leak, spot: spot && { ...spot, col: mul(spot.col, 0.5) } }) });
    const calm = 1 - Math.min(1, Math.max(0, o.drain));
    drawCrowd(bigCrowd(), out, b, f.beat, { drain: o.drain, leak, spot, sway: 0.045 * calm, bob: 0.025 * calm, nearFade: o.nearFade ?? 2.5, fog: o.fog });
    cornerWalls().draw(out, b, { fog: [24, 0.01], uniforms: { ...tintUniforms({ drain: o.brick, leak, spot }), uRecC: SEAT, uRec: o.rs } });
    if (spot) kit.spot.draw(out, b, f.t, spot, { beam: o.beam ?? 0.06, pool: o.pool ?? 0.25 });
  }

  /**
   * A hero word folded into the corner: its left half on the left wall reading in, the
   * right half on the right wall reading out, carried by the walls as they recede.
   */
  private fold(s: WordShape, wd: Word, t: number, b: Basis, o: {
    y: number; h: number; col: RGB; alpha?: number; rs: [number, number]; gap?: number;
    mode: 'rise' | 'slide' | 'glow';
  }) {
    const width = (s.w * o.h) / 320, c0 = at(LF, [0, o.y, CZ]);
    const R = mul(LF.X, -1), U: V3 = [0, 1, 0], N = cross(R, U);
    let a = 0, m = 0;
    kit.words.word(s, {
      pos: c0, right: R, up: U, height: o.h, col: o.col, alpha: o.alpha ?? 1,
      each: (i, u) => {
        m++;
        if (t < (wd.c[i] ?? wd.start) - 0.02) return { alpha: 0 };
        const p = Lyrics.charProgress(wd, i, t), e = ease.outExpo(p);
        const x = (u - 0.5) * width, side = x >= 0 ? 1 : -1;
        const d = norm(dirOf(LF, [-side * H2, 0, H2]));
        const n = norm(sub(LF.F, mul(d, dot(LF.F, d))));
        let along = Math.abs(x) + (o.gap ?? 0.1), lift = 0, scale = 1;
        if (o.mode === 'rise') lift = (e - 1) * 0.35;
        if (o.mode === 'slide') along += (1 - e) * 3.5;
        if (o.mode === 'glow') scale = lerp(1.25, 1, e);
        const q = rec(add(madd(madd(c0, d, along), n, 0.03), [0, lift, 0]), o.rs);
        const r = side > 0 ? d : mul(d, -1), al = smoothstep(0, o.mode === 'slide' ? 0.12 : 0.3, p);
        a += al;
        return { off: sub(q, madd(c0, R, x)), tilt: Math.atan2(dot(r, N), dot(r, R)), scale, alpha: al };
      },
    });
    // for the lyric audit: seen as the chord across the corner
    LyricTrack.mark(this.l.l2, wd, b, rec(c0, o.rs), R, o.h, s, ((o.alpha ?? 1) * a) / Math.max(1, m));
  }

  /** "huminga", the scene's own (the track skips it), recorded for the lyric audit */
  private hum(b: Basis, o: WordOpts) {
    let a = 0, n = 0;
    kit.words.word(this.S.huminga, {
      ...o,
      each: (i, u) => {
        const g = o.each?.(i, u) || {};
        a += g.alpha ?? 1;
        n++;
        return g;
      },
    });
    LyricTrack.mark(this.l.l1, this.w.huminga, b, o.pos, o.right ?? [1, 0, 0], o.height, this.S.huminga, ((o.alpha ?? 1) * a) / Math.max(1, n));
  }

  /** word centres across a run of a line's words (em from the run's centre, in reading order), and its width */
  private run(line: Line, ws: string[]) {
    const q = VOICE.quiet, sp = measure(' ', q.font) / q.font.size;
    const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const ks = ws.map((s) => line.words.findIndex((w) => n(w.w) === n(s)));
    const wem = ks.map((k) => kit.words.shape(line.words[k].w, q.font, q.raster).w / q.raster);
    const w = wem.reduce((s, x) => s + x, 0) + sp * (ks.length - 1), off: number[] = [];
    let x = -w / 2;
    ks.forEach((k, j) => {
      off[k] = x + wem[j] / 2;
      x += wem[j] + sp;
    });
    return { off, w };
  }

  /**
   * A run of a line's words written along a wall: centred `ac` m out of the corner, `y` up, em
   * `size`; riding the walls as they recede (growing, and kept close together), in the corner
   * or (L) in its LOOB twin. Grown at least `G` times as the lens backs off, out along the wall
   * and up from where it stands, so it stays legible.
   */
  private wallRow(line: Line, ws: string[], side: number, ac: number, y: number, size: number,
    rs: (t: number) => [number, number] = () => [1, 1], L: (t: number) => Local = () => LF, G: (t: number) => number = () => 1) {
    const { off, w } = this.run(line, ws);
    return (k: number, t: number): Place => {
      const r = rs(t), s0 = size * grow(r), g = Math.max(1, G(t) / grow(r)), s = s0 * g;
      const along = ac + (w * s0 * (g - 1)) / (2 * r[0]) + (side * off[k] * s) / r[0];
      return fromLocal(L(t), wallAt(side, along, y + (0.36 * s0 * (g - 1)) / r[1], r, s));
    };
  }

  // ---------------------------------------------------------------- v1

  private selfL1(t: number): V3 {
    return mix3(WALK0, [0, 0, 0], prog(t, this.params.cut, 53.25, ease.outSine));
  }

  private breath1(t: number) {
    const tH = this.w.huminga.start;
    return Math.sin((TAU * (t - tH)) / 2.6) * smoothstep(tH - 0.2, tH + 0.6, t);
  }

  private cam1(t: number): Basis {
    const cut: number = this.params.cut, next: number = this.params.next, tC = toFrame(this.w.sulok.start);
    const camFn = shots(t, [
      // out of the crowd behind them, round onto them in the corner, and a push-in that breathes
      { t: cut, cam: (t) => {
        const k = prog(t, cut - 0.2, 53.9, ease.inOutSine), p = prog(t, 53.6, tC, ease.outSine);
        const z = lerp(7.6, 4.4, k) - 1.9 * p + 0.16 * this.breath1(t - 0.25);
        return camAt(LF, [lerp(1.7, 1.9, k) - 0.65 * p, lerp(2.3, 1.0, k) - 0.2 * p, z], mix3(add(this.selfL1(t), [0, 1.0, 0]), [0, 0.5, 0], k), lerp(38, 34, p));
      } },
      // "sulok": the corner, then back and up as the walls recede
      { t: tC, cam: (t) => {
        const k = prog(t, 57.6, next, ease.inOutSine);
        return camAt(LF, [lerp(0, 3, k), lerp(1.7, 22, k ** 1.3), lerp(8.2, 34, k)], [0, lerp(1.9, -1, k), lerp(-1, -4, k)], lerp(44, 42, k));
      } },
    ]);
    return basis(handheld(camFn, t, t < tC ? 0.004 : 0.003, 0.6, 14));
  }

  /** v1 lines, quiet on the walls: L10 either side of them as they come in, L11 run out of the corner under SULOK */
  private stage1() {
    const { l1, l2 } = this.l, next: number = this.params.next, tC = toFrame(this.w.sulok.start), T = this.track;
    const voice = VOICE.quiet, tone = TONE.labas;
    const rs = (t: number) => recede(prog(t, 57.6, next + 0.3, ease.inOutSine), 12, 2.2);
    // "Gusto ko lang" along the right wall as they walk into the corner
    const gkl = ['Gusto', 'ko', 'lang'];
    T.add(l1, { voice, tone, size: 0.3, skip: others(l1, ...gkl), at: PER_WORD, wordAt: this.wallRow(l1, gkl, 1, 2.4, 1.6, 0.3), out: 53.62 });
    // "nang tahimik" low on the left wall by their head, under "huminga"
    const nt = ['nang', 'tahimik'];
    T.add(l1, { voice, tone, size: 0.22, skip: others(l1, ...nt), at: PER_WORD, wordAt: this.wallRow(l1, nt, -1, 1.0, 0.95, 0.22), out: tC - 0.14, exitDur: 0.12 });
    // "Sa" under it, held where it was through the cut, on the corner's left wall
    const b0 = this.cam1(56.75), h0 = onWall(b0, -1, -0.56, 0.24), s0 = (110 * h0.depth) / b0.focal;
    const P0 = fromLocal(LF, wallAt(-1, h0.along, h0.y, [1, 1], s0));
    const h1 = rewall(P0.pos, s0, this.cam1(tC - 1 / 60), this.cam1(tC), -1);
    T.add(l2, {
      voice, tone, size: s0, skip: others(l2, 'Sa'), out: 57.3, at: PER_WORD,
      wordAt: (_k, t) => (t < tC ? P0 : fromLocal(LF, wallAt(-1, h1.along, h1.y, rs(t), h1.size * grow(rs(t))))),
    });
    // the rest under SULOK, out of the corner along both walls as they recede
    const na = ['na', 'ako', 'lang'], ak = ['ang', 'kilala'], s = 0.6;
    T.add(l2, { voice, tone, size: s, skip: others(l2, ...na), at: PER_WORD, wordAt: this.wallRow(l2, na, -1, 0.35 + (this.run(l2, na).w * s) / 2, 1.45, s, rs), out: next + 1 });
    T.add(l2, { voice, tone, size: s, skip: others(l2, ...ak), at: PER_WORD, wordAt: this.wallRow(l2, ak, 1, 0.35 + (this.run(l2, ak).w * s) / 2, 1.45, s, rs), out: next + 1 });
  }

  private v1(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next, w = this.w;
    const tH = w.huminga.start, tC = toFrame(w.sulok.start);

    // off the rim into the corner, turn round, sit, hug the knees and breathe
    const pos = at(LF, this.selfL1(t));
    const dir = dirOf(LF, [-WALK0[0], 0, -WALK0[2]]), yawWalk = Math.atan2(dir[0], dir[2]);
    const dy = Math.atan2(Math.sin(LF.yaw - yawWalk), Math.cos(LF.yaw - yawWalk));
    const yaw = yawWalk + dy * prog(t, 52.95, 53.6, ease.inOutSine);
    const br = this.breath1(t);
    const pose = lerpPose(walk((t - cut) * 1.9, 1 - prog(t, 52.9, 53.3)), this.hug(br), prog(t, 53.3, 54.2, ease.inOutCubic));
    const b = this.cam1(t);

    const rk = prog(t, 57.6, next + 0.3, ease.inOutSine), rs = recede(rk, 12, 2.2);
    this.labas(out, b, f, {
      rs, nearFade: 4,
      drain: lerp(-0.08, 1.0, prog(t, 54.0, 58.2, ease.inOutSine)),
      brick: lerp(-0.08, 0.75, prog(t, 55.2, next, ease.inSine)),
    });
    kit.self.draw(out, b, t, { pos, yaw, pose, col: SELF_INK, w: 1.4, light: lightOf(this.liwanag(t)) }, { fog: [30, 0.006] });

    const W = kit.words.clear();
    this.track.draw(t, b);
    // "huminga", breathed out over their head and drifting off
    if (t >= tH - 0.05 && t < tC) {
      const p = at(LF, [0.1, 1.08 + 0.05 * Math.max(0, t - w.huminga.end), 0.2]);
      this.hum(b, {
        pos: p, right: faceR(b, p), up: [0, 1, 0], height: 0.26 * (1 + 0.05 * br), col: mul(PAPER, 0.8), alpha: 1 - prog(t, 56.1, 56.85),
        each: (i) => {
          const q = Lyrics.charProgress(w.huminga, i, t);
          return { alpha: smoothstep(0, 0.5, q), off: [0, (1 - ease.outCubic(q)) * -0.06, 0] };
        },
      });
    }
    if (t >= tC) this.fold(this.S.sulok, w.sulok, t, b, { y: 2.55, h: 1.25, col: mul(PAPER, 0.95), rs, mode: 'rise', alpha: 1 - prog(t, 59.6, 61.2) });
    W.draw(out, b);

    return { bloom: 0.75, grain: 0.045, vignette: lerp(0.4, 0.46, rk) };
  }

  // ---------------------------------------------------------------- v2

  /** one move per pair of shots, the same relative to the corner and to the house (`inner`) */
  private cam2(t: number, inner = smashIdx(t, this.cuts) % 2 === 1): Basis {
    const cut: number = this.params.cut, next: number = this.params.next, cuts = this.cuts;
    const seg = smashIdx(t, cuts), L = inner ? LL : LF;
    let c: Cam;
    if (seg <= 1) {
      // over their head from right in the corner / from just inside the door, looking out;
      // outside the horizon is kept at the top edge, where the far crowd piles into a wall
      const k = prog(t, cut, cuts[2], ease.inOutSine);
      c = camAt(L, [lerp(0.08, -0.06, k), lerp(1.62, 1.5, k), -1.15], [lerp(-0.4, 0.3, k), inner ? lerp(-0.7, -0.25, k) : lerp(-1.75, -1.35, k), 6], 50);
    } else if (seg === 2) {
      const k = prog(t, cuts[2], cuts[3], ease.outSine);
      c = camAt(L, [lerp(-0.3, 0.35, k), lerp(1.4, 1.65, k), lerp(7.4, 6.2, k)], [0, 1.35, -1.5], 42);
    } else {
      // back and up, off the island / out of the corner
      const k = prog(t, cuts[3], next + 0.2, ease.inOutSine);
      c = camAt(L, this.back2(t), [0, lerp(1.35, 0.2, k), -1.5], lerp(42, 40, k));
    }
    return basis(handheld(c, t, 0.005, 0.8, 21));
  }

  /** where the v2 lens backs off to, off the island / out of the corner (local) */
  private back2(t: number): V3 {
    const k = prog(t, this.cuts[3], this.params.next + 0.2, ease.inOutSine);
    return [lerp(0.35, 3.5, k), lerp(1.65, 8, k ** 1.3), lerp(6.2, 30, k)];
  }

  /** v2 lines, the same on both sides of every smash cut: L26 hung before the lens, L27 on the walls */
  private stage2() {
    const { l1, l2 } = this.l, next: number = this.params.next, cuts = this.cuts, T = this.track, voice = VOICE.quiet;
    const inner = (t: number) => smashIdx(t, cuts) % 2 === 1;
    const outer = (t: number) => this.cam2(t, false);
    // hung in the corner where the lens saw it, and carried into LOOB at the same place on screen
    const held = (P: Place) => (t: number, b: Basis) => (inner(t) ? carry(P, outer(t), b) : P);
    const gkl = ['Gusto', 'ko', 'lang'], P1 = lens(outer(116.2), 0, 0.3, 3.4, 0.075);
    T.add(l1, { voice, size: 1, skip: others(l1, ...gkl), at: held(P1), out: 117.6, each: worlds(l1, inner) });
    // "nang tahimik" held on screen through the cut back out, then left in the corner
    const nt = ['nang', 'tahimik'], tc = cuts[2], P2 = lens(outer(118.8), 0.36, -0.12, 3.4, 0.075);
    const Q2 = carry(P2, outer(tc - 1 / 60), outer(tc));
    T.add(l1, { voice, size: 1, skip: others(l1, ...nt), at: (t, b) => (t >= tc ? Q2 : held(P2)(t, b)), out: 120.42, each: worlds(l1, inner) });
    // L27 on the walls of the corner, and just the same before the house
    const rs = (t: number): [number, number] => (inner(t) ? [1, 1] : recede(prog(t, cuts[4] - 0.3, next + 0.3, ease.inSine), 3, 1.3));
    const L = (t: number) => (inner(t) ? LL : LF);
    // grown as the lens backs off (screen size falling only as its distance^.3)
    const far = (t: number) => len(sub(this.back2(t), [0, 1.3, CZ])), G = (t: number) => Math.max(1, far(t) / far(cuts[3])) ** 0.7;
    T.add(l2, { voice, size: 0.55, skip: others(l2, 'Sa'), at: PER_WORD, wordAt: this.wallRow(l2, ['Sa'], -1, 2.6, 2.45, 0.55, rs, L), out: cuts[3] - 0.12, exitDur: 0.1, each: worlds(l2, inner) });
    const na = ['na', 'ako', 'lang'], ak = ['ang', 'kilala'], sN = 0.42, sK = 0.9;
    T.add(l2, { voice, size: sN, skip: others(l2, ...na), at: PER_WORD, wordAt: this.wallRow(l2, na, -1, 1.2, 1.45, sN, rs, L, G), out: next + 1, each: worlds(l2, inner) });
    T.add(l2, { voice, size: sK, skip: others(l2, ...ak), at: PER_WORD, wordAt: this.wallRow(l2, ak, 1, 0.35 + (this.run(l2, ak).w * sK) / 2, 1.3, sK, rs, L, G), out: next + 1, each: worlds(l2, inner) });
  }

  private v2(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next, w = this.w, cuts = this.cuts;
    const seg = smashIdx(t, cuts), inner = seg % 2 === 1;
    const light = lightOf(this.liwanag(t));
    const b = this.cam2(t, inner);
    const br = Math.sin((TAU * (t - cut)) / 2.6);
    const pose = this.hug(br);

    const W = kit.words.clear();
    this.track.draw(t, b);
    let depth: RT | undefined;
    if (!inner) {
      const rs = recede(prog(t, cuts[4] - 0.3, next + 0.3, ease.inSine), 3, 1.3);
      this.labas(out, b, f, {
        drain: lerp(-0.05, 0.9, prog(t, cut, next, ease.inOutSine)), brick: lerp(-0.08, 0.5, prog(t, cuts[2], next)), rs,
        // looking in over the whole crowd: thicker fog, or its far side piles up into a bright wall
        fog: seg === 0 ? [6, 0.075] : undefined,
      });
      kit.self.draw(out, b, t, { pos: SEAT, yaw: LF.yaw, pose, col: SELF_INK, w: 1.4, light }, { fog: [30, 0.006] });
      if (seg === 2) this.fold(this.S.sulok, w.sulok, t, b, { y: 2.45, h: 1.35, col: PAPER, rs, mode: 'slide' });
    } else {
      depth = this.rt(0);
      const { house, windows } = islandHouse();
      const self = { pos: at(LL, [0, 0, 0]), yaw: LL.yaw, pose };
      const chest = kit.self.chest(self);
      // the light is close to the lens here: kept low, or its glow and the lit rock wash the frame
      kit.loob.draw(out, depth, b, t, { hero: ISLE, isles: 0.35, isleY: 16, wave: 0.5, lum: seg === 1 ? 0.035 : 0.09, haze: 0.005, sunI: 0, glow: chest, glowI: light * (seg === 1 ? 0.12 : 0.45), glowR: 0.06, steps: 50 });
      house.draw(out, b, { depth, fog: [40, 0.01] });
      windows.draw(out, b, { depth });
      this.flies!.draw(out, b, { t, centre: b.pos, density: 0.25, depth, fog: [20, 0.02], nearFade: seg === 1 ? 4 : 10 });
      kit.self.draw(out, b, t, { ...self, noBody: true, light: light * 2 }, { depth });
      if (seg === 1 && t >= w.huminga.start - 0.05) {
        // "huminga" out over the sea, in gold
        const p = at(LL, [-0.3, 2.0 + 0.06 * (t - w.huminga.start), 5]);
        this.hum(b, {
          pos: p, right: faceR(b, p), up: [0, 1, 0], height: 0.9 * (1 + 0.04 * br), col: mul(GOLD, 1.5), alpha: 1 - prog(t, cuts[2] - 0.5, cuts[2]),
          each: (i) => ({ alpha: smoothstep(0, 0.5, Lyrics.charProgress(w.huminga, i, t)) }),
        });
      }
    }
    W.draw(out, b, { depth });

    return mergePost(
      { bloom: inner ? 0.95 : 0.75, grain: 0.04, vignette: inner ? 0.32 : 0.4 },
      impact(t, cuts.slice(1), { flash: 0.03, ca: 0.7, shake: 9, tau: 0.18, seed: 5 }),
    );
  }

  // ---------------------------------------------------------------- v3

  private orbitYaw(t: number) {
    const bb = this.bb;
    return LF.yaw + 0.25 + (t - bb[2]) * 0.5 + 0.06 * (t - bb[2]) ** 2;
  }

  private cam3(t: number): Basis {
    const cut: number = this.params.cut, next: number = this.params.next, bb = this.bb, tH = this.w.huminga.start;
    const camFn = shots(t, [
      { t: cut, cam: (t) => {
        const k = prog(t, cut, bb[1], ease.outSine), br = 0.12 * Math.sin((TAU * (t - tH - 0.25)) / 2.6) * smoothstep(tH, tH + 0.6, t);
        return camAt(LF, [lerp(0.7, 0.3, k), lerp(1.05, 0.88, k), lerp(4.6, 3.0, k) + br], [0, lerp(0.6, 0.68, k), 0], lerp(38, 34, k));
      } },
      { t: bb[1], cam: (t) => {
        const k = prog(t, bb[1], bb[2], ease.inOutSine);
        return camAt(LF, [lerp(-0.4, 0.6, k), lerp(1.5, 2.6, k), lerp(7.2, 10.5, k)], [0, lerp(1.6, 2.2, k), -1], 46);
      } },
      // the first orbit, round them
      { t: bb[2], snap: 0.45, kick: 0.05, cam: (t) =>
        orbit(add(SEAT, [0, lerp(0.9, 1.3, prog(t, bb[2] + 0.2, bb[2] + 1.9, ease.inOutCubic)), 0]), this.orbitYaw(t), -0.1 + 0.03 * Math.sin(t * 0.7),
          lerp(4.4, 3.3, prog(t, bb[2], next, ease.outSine)), 40) },
    ]);
    return basis(handheld(camFn, t, 0.004, 0.6, 16));
  }

  /** a place turning with the orbit round them: x across the view and z into it from the seat, y up, facing the lens */
  private orbitAt(x: number, y: number, z: number, t: number, size: number): Place {
    const a = this.orbitYaw(t), R: V3 = [Math.cos(a), 0, -Math.sin(a)], F: V3 = [-Math.sin(a), 0, -Math.cos(a)];
    return { pos: add(madd(madd(SEAT, R, x), F, z), [0, y, 0]), right: R, up: [0, 1, 0], size };
  }

  /** v3 lines, warm on the walls round them; the end of L40 beside them in the orbit as they stand */
  private stage3() {
    const { l1, l2 } = this.l, bb = this.bb, next: number = this.params.next, T = this.track, voice = VOICE.quiet, tone = TONE.lit;
    const rs = (t: number) => recede(prog(t, bb[1], 187.8, ease.inOutSine), 14, 2.2);
    const eps = 1 / 60;
    // L39 either side of them: "Gusto ko lang" up the left wall, "nang tahimik" low on the right, "huminga" between
    const gkl = ['Gusto', 'ko', 'lang'];
    T.add(l1, { voice, tone, size: 0.28, skip: others(l1, ...gkl), at: PER_WORD, wordAt: this.wallRow(l1, gkl, -1, 1.5, 1.45, 0.28), out: 181.05 });
    // "nang tahimik" crosses the cut to the wide shot: held on screen, onto that shot's right wall,
    // and left where it was put as the walls go (sliding in toward the corner, not out of frame)
    const nt = ['nang', 'tahimik'], t1 = bb[1], sT = 0.19, rT = this.run(l1, nt), A = this.wallRow(l1, nt, 1, 1.5, 0.75, sT);
    const h = rewall(fromLocal(LF, wallAt(1, 1.5, 0.75)).pos, sT, this.cam3(t1 - eps), this.cam3(t1), 1);
    const B = (k: number, t: number) => {
      const r = rs(t);
      return fromLocal(LF, wallAt(1, (h.along + rT.off[k] * h.size) / r[0], h.y / r[1], r, h.size));
    };
    T.add(l1, { voice, tone, size: sT, skip: others(l1, ...nt), at: PER_WORD, wordAt: (k, t) => (t < t1 ? A(k, t) : B(k, t)), out: 184.25, exitDur: 0.2 });
    // L40: "Sa" high on the left wall by SULOK, "na ako lang" under it, riding the walls out
    T.add(l2, { voice, tone, size: 0.5, skip: others(l2, 'Sa'), at: PER_WORD, wordAt: this.wallRow(l2, ['Sa'], -1, 2.7, 2.5, 0.5, rs), out: bb[2] - 0.12, exitDur: 0.1 });
    // in the orbit, as they stand: "na ako lang" at their left, "ang kilala" at their right, turning with it
    const na = ['na', 'ako', 'lang'], ak = ['ang', 'kilala'], t2 = bb[2], sN = 0.42, sO = 0.26;
    const rN = this.run(l2, na), rK = this.run(l2, ak), wall = this.wallRow(l2, na, -1, 1.2, 1.45, sN, rs);
    const nx = -(0.5 + (rN.w * sO) / 2), kx = 0.5 + (rK.w * sO) / 2;
    T.add(l2, { voice, tone, size: sN, skip: others(l2, ...na), at: PER_WORD, wordAt: (k, t) => (t < t2 ? wall(k, t) : this.orbitAt(nx + rN.off[k] * sO, 1.2, 0, t, sO)), out: next + 1 });
    T.add(l2, { voice, tone, size: sO, skip: others(l2, ...ak), at: PER_WORD, wordAt: (k, t) => this.orbitAt(kx + rK.off[k] * sO, 1.2, 0, t, sO), out: next + 1 });
  }

  private v3(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next, w = this.w, bb = this.bb;
    const tH = w.huminga.start, tS = w.sulok.start;
    const liw = this.liwanag(t), light = lightOf(liw);

    // hugging the knees in the light, then (in the orbit) standing up in it
    const breath = Math.sin((TAU * (t - tH)) / 2.6) * smoothstep(tH - 0.3, tH + 0.5, t);
    const up = prog(t, bb[2] + 0.2, bb[2] + 1.9, ease.inOutCubic);
    const pose = lerpPose(this.hug(breath), POSE.stand, up);
    const self = { pos: SEAT, yaw: LF.yaw, pose };
    const chest = kit.self.chest(self);
    const b = this.cam3(t);

    const rk = prog(t, bb[1], 187.8, ease.inOutSine), rs = recede(rk, 14, 2.2);
    const sky = {
      top: mul(lin('slate'), 0.2), hor: mix3(mul(lin('slate'), 0.3), mul(lin('dawn'), 0.28), 0.5), ground: mul(lin('ink'), 1.2),
      band: 0.45, warm: 0.15 + 0.2 * liw, warmDir: [0.5, 0.06, -1] as V3, warmCol: lin('dawn'),
    };
    // the camera is close: a narrow spot, a faint beam, no pool (from here it reads as a floor)
    const spot: SpotLight = { apex: add(SEAT, [-8, 62, -12]), tgt: SEAT, r: 1.5, col: mul(GOLD, 1.1) };
    this.labas(out, b, f, {
      spot, sky, beam: 0.025, pool: 0, rs,
      leak: { at: chest, k: lerp(0.6, 1.2, prog(t, cut, next)) },
      drain: lerp(-0.08, 0.85, prog(t, bb[1] - 0.3, next - 0.6, ease.inOutSine)),
      brick: lerp(-0.08, 0.5, prog(t, bb[1], next)),
    });
    this.flies!.draw(out, b, { t, centre: b.pos, density: lerp(0, 0.14, prog(t, bb[1], next, ease.inSine)), rise: 0.35, fog: [25, 0.02], nearFade: 7 });
    kit.self.draw(out, b, t, { ...self, col: mix3(SELF_INK, mul(GOLD, 0.8), 0.3 + 0.3 * up), w: 2, light: light * (1 + 0.2 * up) }, { fog: [30, 0.006] });
    // a few at a time, and none near the lens (close up they are fists of bokeh)
    this.leak!.draw(out, b, t, { src: chest, k: lerp(0.07, 0.3, prog(t, cut, next, ease.inSine)), life: 7, spread: lerp(2.5, 7, prog(t, cut + 1, next)), nearFade: 3 });

    const W = kit.words.clear();
    this.track.draw(t, b);
    const gold = mul(GOLD, 1.6);
    // "huminga": each letter breathed out of the chest into its place over their head
    if (t >= tH - 0.05 && t < bb[1]) {
      const p = at(LF, [0, 1.02 + 0.06 * Math.max(0, t - w.huminga.end), 0.25]), R = faceR(b, p);
      const h = 0.32 * (1 + 0.05 * breath), width = (this.S.huminga.w * h) / 320;
      this.hum(b, {
        pos: p, right: R, up: [0, 1, 0], height: h, col: gold, alpha: 1 - prog(t, bb[1] - 0.6, bb[1] - 0.05),
        each: (i, u) => {
          const q = Lyrics.charProgress(w.huminga, i, t), e = ease.outCubic(q);
          return { alpha: smoothstep(0, 0.3, q), off: mul(sub(chest, madd(p, R, (u - 0.5) * width)), 1 - e), scale: lerp(0.3, 1, e) };
        },
      });
    }
    // SULOK gilded on the walls as they go
    if (t >= tS - 0.05) this.fold(this.S.sulok, w.sulok, t, b, { y: 2.5, h: 1.2, col: mix3(PAPER, mul(GOLD, 1.4), 0.55), rs, mode: 'glow', alpha: 1 - prog(t, 187.0, 188.2) });
    W.draw(out, b);

    return { bloom: 0.85, grain: 0.04, vignette: 0.34 };
  }
}
