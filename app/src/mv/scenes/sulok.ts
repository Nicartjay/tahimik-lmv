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
import type { Word } from '../../engine/lyrics';
import { Lyrics } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, lerp, prog, smoothstep, TAU, window01 } from '../../engine/util';
import { basis, handheld, orbit, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, dot, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import type { WordShape } from '../../engine/3d/words';
import { bars, impact, mergePost } from './_fx';
import { INK, lerpPose, POSE, walk, type Pose } from './_labas';
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
    this.w = {
      huminga: Lyrics.word(L.find('Gusto ko lang huminga', c - 1), 'huminga'),
      sulok: Lyrics.word(L.find('Sa sulok na ako', c - 1), 'sulok'),
    };
    this.S = { huminga: kit.words.shape('huminga', QUIET), sulok: kit.words.shape('SULOK', HERO) };
    kit.sky; kit.self; kit.spot;
    if (this.v === 2) {
      kit.loob;
      islandHouse();
      this.flies = new Flies(2600, 50, 29);
    }
    if (this.v === 3) {
      this.leak = new Leak(900, 11, 0.55);
      this.flies = new Flies(2600, 50, 23);
    }
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
  private fold(s: WordShape, wd: Word, t: number, o: {
    y: number; h: number; col: RGB; alpha?: number; rs: [number, number]; gap?: number;
    mode: 'rise' | 'slide' | 'glow';
  }) {
    const width = (s.w * o.h) / 320, c0 = at(LF, [0, o.y, CZ]);
    const R = mul(LF.X, -1), U: V3 = [0, 1, 0], N = cross(R, U);
    kit.words.word(s, {
      pos: c0, right: R, up: U, height: o.h, col: o.col, alpha: o.alpha ?? 1,
      each: (i, u) => {
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
        const r = side > 0 ? d : mul(d, -1);
        return { off: sub(q, madd(c0, R, x)), tilt: Math.atan2(dot(r, N), dot(r, R)), scale, alpha: smoothstep(0, o.mode === 'slide' ? 0.12 : 0.3, p) };
      },
    });
  }

  // ---------------------------------------------------------------- v1

  private v1(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next, w = this.w;
    const tH = w.huminga.start, tC = toFrame(w.sulok.start);

    // off the rim into the corner, turn round, sit, hug the knees and breathe
    const P0: V3 = [0.8, 0, 2.3];
    const selfL = (t: number): V3 => mix3(P0, [0, 0, 0], prog(t, cut, 53.25, ease.outSine));
    const pos = at(LF, selfL(t));
    const dir = dirOf(LF, [-P0[0], 0, -P0[2]]), yawWalk = Math.atan2(dir[0], dir[2]);
    const dy = Math.atan2(Math.sin(LF.yaw - yawWalk), Math.cos(LF.yaw - yawWalk));
    const yaw = yawWalk + dy * prog(t, 52.95, 53.6, ease.inOutSine);
    const breath = (t: number) => Math.sin((TAU * (t - tH)) / 2.6) * smoothstep(tH - 0.2, tH + 0.6, t);
    const br = breath(t);
    const pose = lerpPose(walk((t - cut) * 1.9, 1 - prog(t, 52.9, 53.3)), this.hug(br), prog(t, 53.3, 54.2, ease.inOutCubic));

    const camFn = shots(t, [
      // out of the crowd behind them, round onto them in the corner, and a push-in that breathes
      { t: cut, cam: (t) => {
        const k = prog(t, cut - 0.2, 53.9, ease.inOutSine), p = prog(t, 53.6, tC, ease.outSine);
        const z = lerp(7.6, 4.4, k) - 1.9 * p + 0.16 * breath(t - 0.25);
        return camAt(LF, [lerp(1.7, 1.9, k) - 0.65 * p, lerp(2.3, 1.0, k) - 0.2 * p, z], mix3(add(selfL(t), [0, 1.0, 0]), [0, 0.5, 0], k), lerp(38, 34, p));
      } },
      // "sulok": the corner, then back and up as the walls recede
      { t: tC, cam: (t) => {
        const k = prog(t, 57.6, next, ease.inOutSine);
        return camAt(LF, [lerp(0, 3, k), lerp(1.7, 22, k ** 1.3), lerp(8.2, 34, k)], [0, lerp(1.9, -1, k), lerp(-1, -4, k)], lerp(44, 42, k));
      } },
    ]);
    const b = basis(handheld(camFn, t, t < tC ? 0.004 : 0.003, 0.6, 14));

    const rk = prog(t, 57.6, next + 0.3, ease.inOutSine), rs = recede(rk, 12, 2.2);
    this.labas(out, b, f, {
      rs, nearFade: 4,
      drain: lerp(-0.08, 1.0, prog(t, 54.0, 58.2, ease.inOutSine)),
      brick: lerp(-0.08, 0.75, prog(t, 55.2, next, ease.inSine)),
    });
    kit.self.draw(out, b, t, { pos, yaw, pose, col: SELF_INK, w: 1.4, light: lightOf(this.liwanag(t)) }, { fog: [30, 0.006] });

    const W = kit.words.clear();
    // "huminga", breathed out over their head and drifting off
    if (t >= tH - 0.05 && t < tC) {
      const p = at(LF, [0.1, 1.08 + 0.05 * Math.max(0, t - w.huminga.end), 0.2]);
      W.word(this.S.huminga, {
        pos: p, right: faceR(b, p), up: [0, 1, 0], height: 0.26 * (1 + 0.05 * br), col: mul(PAPER, 0.8), alpha: 1 - prog(t, 56.1, 56.85),
        each: (i) => {
          const q = Lyrics.charProgress(w.huminga, i, t);
          return { alpha: smoothstep(0, 0.5, q), off: [0, (1 - ease.outCubic(q)) * -0.06, 0] };
        },
      });
    }
    if (t >= tC) this.fold(this.S.sulok, w.sulok, t, { y: 2.55, h: 1.25, col: mul(PAPER, 0.95), rs, mode: 'rise', alpha: 1 - prog(t, 59.6, 61.2) });
    W.draw(out, b);

    return { bloom: 0.75, grain: 0.045, vignette: lerp(0.4, 0.46, rk) };
  }

  // ---------------------------------------------------------------- v2

  private v2(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next, w = this.w;
    const cuts = [cut, ...bars(this.audio, cut + 0.5, next - 0.5)].map(toFrame);
    const seg = smashIdx(t, cuts), inner = seg % 2 === 1;
    const light = lightOf(this.liwanag(t));
    const L = inner ? LL : LF;

    // one move per pair of shots, the same relative to the corner and to the house
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
      c = camAt(L, [lerp(0.35, 3.5, k), lerp(1.65, 8, k ** 1.3), lerp(6.2, 30, k)], [0, lerp(1.35, 0.2, k), -1.5], lerp(42, 40, k));
    }
    const b = basis(handheld(c, t, 0.005, 0.8, 21));
    const br = Math.sin((TAU * (t - cut)) / 2.6);
    const pose = this.hug(br);

    const W = kit.words.clear();
    let depth: RT | undefined;
    if (!inner) {
      const rs = recede(prog(t, cuts[4] - 0.3, next + 0.3, ease.inSine), 3, 1.3);
      this.labas(out, b, f, {
        drain: lerp(-0.05, 0.9, prog(t, cut, next, ease.inOutSine)), brick: lerp(-0.08, 0.5, prog(t, cuts[2], next)), rs,
        // looking in over the whole crowd: thicker fog, or its far side piles up into a bright wall
        fog: seg === 0 ? [6, 0.075] : undefined,
      });
      kit.self.draw(out, b, t, { pos: SEAT, yaw: LF.yaw, pose, col: SELF_INK, w: 1.4, light }, { fog: [30, 0.006] });
      if (seg === 2) this.fold(this.S.sulok, w.sulok, t, { y: 2.45, h: 1.35, col: PAPER, rs, mode: 'slide' });
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
        W.word(this.S.huminga, {
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

  private v3(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next, w = this.w;
    const tH = w.huminga.start, tS = w.sulok.start;
    const bb = bars(this.audio, cut + 0.5, next).map(toFrame);
    const liw = this.liwanag(t), light = lightOf(liw);

    // hugging the knees in the light, then (in the orbit) standing up in it
    const breath = Math.sin((TAU * (t - tH)) / 2.6) * smoothstep(tH - 0.3, tH + 0.5, t);
    const up = prog(t, bb[2] + 0.2, bb[2] + 1.9, ease.inOutCubic);
    const pose = lerpPose(this.hug(breath), POSE.stand, up);
    const self = { pos: SEAT, yaw: LF.yaw, pose };
    const chest = kit.self.chest(self);

    const orbitYaw = (t: number) => LF.yaw + 0.25 + (t - bb[2]) * 0.5 + 0.06 * (t - bb[2]) ** 2;
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
        orbit(add(SEAT, [0, lerp(0.9, 1.3, prog(t, bb[2] + 0.2, bb[2] + 1.9, ease.inOutCubic)), 0]), orbitYaw(t), -0.1 + 0.03 * Math.sin(t * 0.7),
          lerp(4.4, 3.3, prog(t, bb[2], next, ease.outSine)), 40) },
    ]);
    const b = basis(handheld(camFn, t, 0.004, 0.6, 16));

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
    const gold = mul(GOLD, 1.6);
    // "huminga": each letter breathed out of the chest into its place over their head
    if (t >= tH - 0.05 && t < bb[1]) {
      const p = at(LF, [0, 1.02 + 0.06 * Math.max(0, t - w.huminga.end), 0.25]), R = faceR(b, p);
      const h = 0.32 * (1 + 0.05 * breath), width = (this.S.huminga.w * h) / 320;
      W.word(this.S.huminga, {
        pos: p, right: R, up: [0, 1, 0], height: h, col: gold, alpha: 1 - prog(t, bb[1] - 0.6, bb[1] - 0.05),
        each: (i, u) => {
          const q = Lyrics.charProgress(w.huminga, i, t), e = ease.outCubic(q);
          return { alpha: smoothstep(0, 0.3, q), off: mul(sub(chest, madd(p, R, (u - 0.5) * width)), 1 - e), scale: lerp(0.3, 1, e) };
        },
      });
    }
    // SULOK gilded on the walls as they go
    if (t >= tS - 0.05) this.fold(this.S.sulok, w.sulok, t, { y: 2.5, h: 1.2, col: mix3(PAPER, mul(GOLD, 1.4), 0.55), rs, mode: 'glow', alpha: 1 - prog(t, 187.0, 188.2) });
    W.draw(out, b);

    return { bloom: 0.85, grain: 0.04, vignette: 0.34 };
  }
}
