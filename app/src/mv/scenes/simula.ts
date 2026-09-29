// 00 · SIMULA (0 → 10.700, before the first sung word). One spark in the dark, chased: a
// long corkscrew through volumetric dust that thickens and speeds with the build, whipping
// round in front of it on the second bar and back behind it on the third, where the
// letters of TAHIMIK flash past one per half-beat. It brakes and lands; on the downbeat at
// 9.397 the camera crashes out ×50 and it was the chest light of the quiet one all along,
// standing at the edge of LABAS: a grid to the horizon drawing itself outward from them,
// the school, a crowd far off, and TAHIMIK dropping in over it. A plain cut to GILID.

import { sans } from '../../engine/fonts';
import { clearRT, type RT } from '../../engine/gl';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, keys, lerp, prog, smoothstep, window01 } from '../../engine/util';
import { basis, cam, handheld, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, dist, len, madd, mul, norm, slerpDir, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { Words, type WordShape } from '../../engine/3d/words';
import { impact, mergePost } from './_fx';
import { addFigure, building, figure, FIGURE_GLSL, groundGrid, INK, POSE, scatter, Sky, wireBox } from './_labas';
import { EMBER, lightOf, Self } from './_self';
import { drawVoid, Dust, REVEAL_TINT, revealUniforms } from './_simula_fx';

let sky: Sky | null = null, self: Self | null = null;

/** the light lands in the chest, then the downbeat */
const T_LAND = 9.33, T_OUT = 9.397;
const SELF = { pos: [0, 0, 0] as V3, yaw: Math.PI, pose: POSE.shy };
/** the schoolyard the self stands at the edge of */
const YARD: V3 = [-2, 0, -46];
const WORLD_FOG: [number, number] = [22, 0.011];

// ---------------------------------------------------------------- the flight

// speed (m/s) and corkscrew rate (rad/s) through the build
const SPEED: [number, number, ((x: number) => number)?][] = [
  [0, 0.22], [1.546, 0.3], [2.7, 1.25], [4.166, 1.55], [4.9, 2.45], [6.783, 2.7], [7.3, 3.9], [8.95, 4.1],
  [T_LAND, 0, ease.inQuad],
];
const SPIN: [number, number, ((x: number) => number)?][] = [
  [0, 0.12], [1.546, 0.18], [4.166, 0.9], [6.783, 1.3], [7.6, 2.8], [T_OUT, 3.3], [T_OUT + 0.6, 0.6],
];

/** distance flown and corkscrew angle at t: Simpson over [0, t], pure in t */
function flight(t: number): { s: number; phi: number; v: number } {
  const n = 160, tt = Math.max(t, 0), h = tt / n;
  let s = 0, phi = 0;
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2, u = i * h;
    s += w * keys(u, SPEED);
    phi += w * keys(u, SPIN);
  }
  return { s: (s * h) / 3, phi: (phi * h) / 3, v: keys(tt, SPEED) };
}
const S_END = flight(T_LAND + 0.01).s;

// the path in a frame whose forward axis points from the final wide camera to the chest,
// so the chase ends heading into the reveal
let C: V3 = [0, 1.33, 0];
let FW: V3 = [0, 0, -1], RT_: V3 = [1, 0, 0], UP_: V3 = [0, 1, 0];
const wig = (s: number): [number, number] => [
  1.15 * Math.sin(0.33 * s + 1) + 0.45 * Math.sin(0.87 * s + 0.3),
  0.7 * Math.sin(0.26 * s + 2) + 0.3 * Math.sin(1.07 * s + 0.5),
];
const W_END = wig(S_END);
function path(s: number): V3 {
  s = Math.min(s, S_END);
  const [x, y] = wig(s);
  return madd(madd(madd(C, RT_, x - W_END[0]), UP_, y - W_END[1]), FW, s - S_END);
}
function tangent(s: number): V3 {
  const a = Math.min(s, S_END - 0.02);
  return norm(sub(path(a + 0.02), path(a - 0.02)));
}

/** the chase: behind (or ahead of) the light, orbiting its path as it corkscrews */
function chase(t: number, back: number, r: number, spin: number, lead: number, rollK: number): Cam {
  const { s, phi } = flight(t);
  const P = path(s), T = tangent(s);
  let B = cross(T, [0, 1, 0]);
  B = len(B) < 1e-4 ? [1, 0, 0] : norm(B);
  const N = cross(B, T), a = phi * spin;
  const off = add(mul(T, -back), add(mul(N, Math.cos(a) * r), mul(B, Math.sin(a) * r)));
  const pos = add(P, off);
  return { pos, tgt: madd(P, T, lead * Math.sign(back)), roll: rollK * Math.sin(a), fov: 50 };
}

const WIDE_POS: V3 = [10.5, 4.6, 23], WIDE_TGT: V3 = [1, 3.6, -30];
function wide(t: number): Cam {
  const u = t - T_OUT;
  // after the crash, the slow settle: a little further out, rising
  const pos = add(WIDE_POS, [0.12 * u, 0.1 * u, 0.3 * u]);
  return handheld(cam(pos, WIDE_TGT, 34), t, 0.0025, 0.5, 3);
}

/** the crash out from the chest: distance in log space, the look lags so the light stays held */
function crash(a: Cam, b: Cam, k: number, look: number): Cam {
  const da = sub(a.pos, C), db = sub(b.pos, C);
  const d = Math.exp(lerp(Math.log(len(da)), Math.log(len(db)), k));
  const pos = madd(C, slerpDir(da, db, k), d);
  const F0 = slerpDir(sub(a.tgt, a.pos), sub(C, pos), smoothstep(0, 0.1, k));
  const F = slerpDir(F0, sub(b.tgt, b.pos), look);
  const tan = (f: number) => Math.log(Math.tan((f * Math.PI) / 360));
  const fov = (Math.atan(Math.exp(lerp(tan(a.fov), tan(b.fov), k))) * 360) / Math.PI;
  return { pos, tgt: madd(pos, F, 10), roll: lerp(a.roll, b.roll, k), fov };
}

function camAt(t: number): Cam {
  const c = shots(t, [
    { t: 0, cam: (u) => chase(u, 0.5 - 0.14 * prog(u, 1.5, 4.1), 0.2, 1, 0.25, 0.18) },
    { t: 4.166, cam: (u) => chase(u, -0.62, 0.17, 1.4, 0.12, 0.3), snap: 0.55, kick: 0.07 },
    { t: 6.783, cam: (u) => chase(u, 0.4 - 0.05 * prog(u, 6.8, 9), 0.13, 1, 0.3, 0.4), snap: 0.5, kick: -0.09 },
  ]);
  if (t < T_OUT) return c;
  const k = prog(t, T_OUT, T_OUT + 1.05, ease.outQuart);
  return crash(c, wide(t), k, prog(t, T_OUT + 0.1, T_OUT + 1.2, ease.inOutCubic));
}

// ---------------------------------------------------------------- the scene

export default class Simula extends Scene {
  maxSamples = 108;
  private dust = new Dust(16000, 3.2, 3);
  private trail = new GlowPoints(64);
  private grid = new LineBatch(16000, REVEAL_TINT);
  private world = new LineBatch(6000, REVEAL_TINT);
  private crowd!: LineBatch;
  private W = new Words();
  private title!: WordShape;
  private letters: WordShape[] = [];

  async init() {
    sky ??= new Sky();
    self ??= new Self();
    C = self.chest(SELF);
    FW = norm(sub(C, WIDE_POS));
    RT_ = norm(cross(FW, [0, 1, 0]));
    UP_ = cross(RT_, FW);

    groundGrid(this.grid, { extent: 170, step: 2, major: 5, centre: [YARD[0], YARD[2] + 10], seg: 40, alpha: 0.5 });
    const L = this.world, col = INK.line;
    building(L, add(YARD, [-4, 0, -16]), { size: [36, 12, 10], yaw: 0.04, floors: 3, bays: 12, col, alpha: 0.75 });
    building(L, add(YARD, [-27, 0, -2]), { size: [24, 9, 9], yaw: Math.PI / 2 + 0.04, floors: 2, bays: 7, col, alpha: 0.7 });
    building(L, add(YARD, [22, 0, -6]), { size: [22, 9, 9], yaw: -0.55, floors: 2, bays: 7, col, alpha: 0.7 });
    // a covered court and the flagpole
    wireBox(L, add(YARD, [10, 5.5, 14]), [9, 0.15, 6], 0.1, 1, INK.dim, 0.6);
    for (const [x, z] of [[-8.6, -5.6], [8.6, -5.6], [-8.6, 5.6], [8.6, 5.6]] as const)
      L.seg(add(YARD, [10 + x, 0, 14 + z]), add(YARD, [10 + x, 5.4, 14 + z]), 1, INK.dim, 0.6);
    const pole = add(YARD, [3, 0, 2]);
    L.seg(pole, add(pole, [0, 12, 0]), 1, col, 0.8);
    L.poly([add(pole, [0, 11.8, 0]), add(pole, [2.2, 11.5, 0.2]), add(pole, [0, 10.4, 0])], 1, col, 0.6, true);
    // the edge the self stands at: a line of low posts and a rail
    for (let x = -40; x <= 40; x += 2.4) {
      const p: V3 = [x, 0, -2.2 + 0.02 * x];
      L.seg(p, add(p, [0, 0.9, 0]), 1, INK.dim, 0.7);
    }
    L.seg([-40, 0.9, -3], [40, 0.9, -1.4], 1, INK.dim, 0.7);
    L.seg([-40, 0.45, -3], [40, 0.45, -1.4], 1, INK.dim, 0.45);

    const members = scatter(460, { centre: add(YARD, [2, 0, 6]), r0: 2.5, r1: 21, face: 'random', seed: 17 });
    this.crowd = new LineBatch(members.length * 27, FIGURE_GLSL + REVEAL_TINT);
    members.forEach((m, i) => addFigure(this.crowd, figure(m.pose ?? POSE.stand), m, i + 1, 1, INK.line, 0.5));

    this.title = this.W.shape('TAHIMIK', sans(100, 800, 'extra-condensed', 6));
    this.letters = [...'TAHIMIK'].map((ch) => this.W.shape(ch, sans(100, 800, 'extra-condensed')));
  }

  render(f: Frame, out: RT): Post {
    const t = f.t;
    const light = lightOf(this.liwanag(t));
    const c = camAt(t), b: Basis = basis(c, 0.02);
    const { s, v } = flight(t);
    const fly = path(s);
    const camD = dist(c.pos, fly);

    // how far into the reveal we are, by camera distance from the chest
    const rev = smoothstep(0.8, 7, camD);
    const voidA = 1 - smoothstep(1.2, 5, camD);

    // ---- ground: black, then LABAS's sky coming up under the dark
    if (rev > 0) {
      sky!.draw(out, b, {
        top: mul(lin('ink'), 0.8 * rev), hor: mul(lin('slate'), 0.55 * rev), ground: mul(lin('ink'), 0.9 * rev), band: 0.7,
      });
    } else clearRT(out, [0, 0, 0]);
    if (voidA > 0) drawVoid(out, b, { fly, light: light * 1.6, alpha: voidA, t });

    // ---- LABAS, drawn outward from the self by the reveal front
    if (t >= T_OUT - 0.02) {
      const ring = 190 * prog(t, T_OUT - 0.02, T_OUT + 1.4, ease.outCubic) ** 1.2;
      const ru = revealUniforms(SELF.pos, ring, 1.5 + ring * 0.08, 0.6 * (1 - prog(t, T_OUT + 0.9, T_OUT + 1.3)));
      this.grid.draw(out, b, { fog: WORLD_FOG, uniforms: ru });

      // TAHIMIK, far beyond the school: the letters drop out of the sky and land one by one
      const R = norm([b.R[0], 0, b.R[2]]);
      this.W.clear().word(this.title, {
        pos: [-4, 9.5, -150], right: R, up: [0, 1, 0], height: 30, col: mul(lin('paper'), 0.95),
        each: (i) => {
          const a = T_OUT + 0.15 + i * 0.08, k = prog(t, a, a + 0.42, ease.inCubic);
          return { off: [0, 70 * (1 - k), 0], alpha: prog(t, a, a + 0.25), spin: (1 - k) * 0.5 * (i % 2 ? 1 : -1) };
        },
      });
      this.W.draw(out, b, { fog: [60, 0.004] });

      this.world.draw(out, b, { fog: WORLD_FOG, uniforms: ru });
      this.crowd.draw(out, b, {
        fog: WORLD_FOG,
        uniforms: { uBeat: f.beat, uSway: 0.04, uBob: 0.015, uGroundY: 0, ...ru },
      });
    }

    // ---- dust, torn through by the chase; gone as the camera leaves it
    const dens = keys(t, [[0, 0.3], [1.546, 0.45], [4.166, 0.75], [6.783, 1]]) * (1 - smoothstep(1, 4.5, camD));
    if (dens > 0) this.dust.draw(out, b, { t, centre: fly, fly, light: light * 1.5, density: dens });

    // ---- the letters of TAHIMIK hung in the dark, one per half-beat, flown through
    if (t > 6.5 && t < T_LAND) {
      this.W.clear();
      for (let i = 0; i < 7; i++) {
        const ti = 6.95 + i * 0.327, si = flight(ti).s;
        if (s > si + 0.6 || s < si - 6) continue;
        const Pi = path(si), Ti = tangent(si);
        let Bi = cross(Ti, [0, 1, 0]);
        Bi = len(Bi) < 1e-4 ? [1, 0, 0] : norm(Bi);
        const side = i % 2 ? 1 : -1;
        const pos = madd(madd(Pi, Bi, side * 0.2), [0, 1, 0], 0.05 * side);
        const near = 1 / (1 + dist(fly, pos) ** 2 * 18);
        this.W.word(this.letters[i], {
          pos, right: mul(Bi, -1), up: cross(mul(Bi, -1), mul(Ti, -1)), height: 0.26,
          col: add(mul(lin('paper'), 0.22), mul(EMBER, 2.2 * near * light)),
          alpha: smoothstep(si - 6, si - 3, s),
        });
      }
      this.W.draw(out, b, { nearFade: 0.12 });
    }

    // ---- the light: a comet tail while it flies, then the self round it
    const body = smoothstep(0.7, 3, camD);
    const zoom = smoothstep(0.6, 12, camD);
    const core = Math.exp(lerp(Math.log(0.0024), Math.log(0.022), zoom));
    const halo = Math.exp(lerp(Math.log(0.014), Math.log(0.09), zoom));
    if (v > 0.05) {
      this.trail.clear();
      const step = Math.min(v * 0.004, core * 0.9);
      for (let j = 1; j <= 64; j++) {
        const u = j / 64;
        this.trail.point(path(s - j * step), -core * (1.5 - u), mul(EMBER, 2), light * 0.06 * (1 - u) ** 2 * Math.min(1, v / 2));
      }
      this.trail.draw(out, b);
    }
    const at = sub(fly, sub(C, SELF.pos));
    self!.draw(out, b, t, { ...SELF, pos: at, core, halo, light, noBody: body <= 0, alpha: body, col: mul(lin('paper'), 0.62) }, { fog: WORLD_FOG });

    // ---- post: dark and hot for the chase, then LABAS's cool air
    const hit = impact(t, [T_OUT], { ca: 0.9, shake: 9, tau: 0.3 });
    const lands = [...'TAHIMIK'].map((_, i) => T_OUT + 0.57 + i * 0.08);
    const kicks = impact(t, lands, { ca: 0.2, shake: 2.5, tau: 0.1, seed: 4 });
    return mergePost(
      {
        exposure: lerp(1.5, 1.12, rev),
        bloom: lerp(0.95, 0.6, rev),
        bloomRadius: lerp(1.3, 1, rev),
        vignette: lerp(0.5, 0.36, rev),
        grain: 0.04,
        fade: 1 - prog(t, 0, 0.9, ease.outQuad),
        ca: 0.25 * window01(t, 6.783, T_LAND, 0.4, 0.2),
      },
      hit,
      kicks,
    );
  }
}

