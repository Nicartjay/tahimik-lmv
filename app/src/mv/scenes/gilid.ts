// 01 · GILID — "Nakatayo sa gilid lang / Nakikinig, pero 'di sumasabay". A line-art
// schoolyard whose centre is a ring of six laughing friends. The camera starts low among
// them, spirals out and passes close behind the self, standing still at the yard's edge
// by the fence (GILID rises beside them), then cranes up over the ring as NAKIKINIG
// curls round it. On "sumasabay" the whole yard sways as one, the self alone doesn't; the
// laughter starts rippling out through the ground: the sea of the next shot.

import { sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics, type Word } from '../../engine/lyrics';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, hash, lerp, noise1, prog, smoothstep, TAU } from '../../engine/util';
import { basis, cam, handheld, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, madd, mul, norm, sub, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import {
  addFigure, building, figure, groundGrid, INK, LABAS_FOG, lerpPose, POSE, rect, scatter, Sky, wireBox,
  type Member, type Pose,
} from './_labas';
import { lightOf, Self } from './_self';

let sky: Sky | null = null, self: Self | null = null;

/** where the self stands: the yard's edge, 9 m out from the ring, facing it */
const A_SELF = 0.9;
const SELF_POS: V3 = [Math.sin(A_SELF) * 9, 0, Math.cos(A_SELF) * 9];
const SELF_YAW = A_SELF + Math.PI;
/** the self's line colour */
export const SELF_INK = mul(lin('paper'), 0.62);

/**
 * FIGURE_GLSL plus `uUnison`: at 1 every figure sways the same way at the same phase
 * (along uSwayDir), the yard moving as one body.
 */
const YARD_GLSL = /* glsl */ `
uniform float uBeat, uSway, uBob, uGroundY, uUnison;
uniform vec2 uSwayDir;
vec3 warp(vec3 p, vec4 d, float end) {
  float h = fract(sin(d.x * 91.3458) * 47453.5453), h2 = fract(h * 13.73), h3 = fract(h * 71.9);
  float up = max(p.y - uGroundY, 0.);
  float a = h2 * 6.2831853;
  vec2 dir = normalize(mix(vec2(cos(a), sin(a)), uSwayDir, uUnison) + 1e-4);
  float ph = mix(h * 6.2831853, 0., uUnison);
  p.xz += dir * up * uSway * mix(.5 + h, 1., uUnison) * sin(3.14159265 * uBeat + ph);
  p.y += uBob * up * step(.5, h3) * (.5 + .5 * sin(6.2831853 * 2. * uBeat + h * 6.2831853));
  if (d.y > 0.) {
    float t = mix(d.z, d.w, end);
    p += (uCamR * cos(t) + uCamU * sin(t)) * d.y;
  }
  return p;
}`;

/** the ground: laughter rings leaving the ring at uRipV m/s from uRipT, brightening their crests */
const GROUND_GLSL = /* glsl */ `
uniform float uNow, uRipT, uRipA, uRipV;
float rip(vec3 p, out float crest) {
  float r = length(p.xz), front = max(uNow - uRipT, 0.) * uRipV;
  float env = smoothstep(front, front - 8., r) * exp(-r * .03) * uRipA * smoothstep(1., 3.5, r);
  float s = sin(1.25 * (r - front));
  crest = max(s, 0.) * env;
  return s * env;
}
vec3 warp(vec3 p, vec4 d, float end) {
  float c;
  p.y += rip(p, c);
  return p;
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float k;
  rip(p, k);
  return vec4(c.rgb * (1. + 5. * k), c.a);
}`;

/** a bare line tree: a trunk and three or four levels of forking branches */
function tree(L: LineBatch, base: V3, h: number, seed: number, a = 0.5) {
  const col = INK.dim;
  const branch = (p: V3, dir: V3, len: number, depth: number, id: number) => {
    const q = madd(p, dir, len);
    L.seg(p, q, depth > 2 ? 1.3 : 0.9, col, a * (0.5 + 0.12 * depth));
    if (depth === 0) return;
    const n = 2 + (hash(id, seed, 1) < 0.45 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const yaw = (k / n) * TAU + hash(id, seed, 10 + k) * 1.6, pitch = 0.35 + 0.45 * hash(id, seed, 20 + k);
      const out: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
      const d2 = norm(madd(mul(dir, Math.cos(pitch)), out, Math.sin(pitch)));
      branch(q, norm(add(d2, [0, 0.25, 0])), len * (0.62 + 0.14 * hash(id, seed, 30 + k)), depth - 1, id * 4 + k + 1);
    }
  };
  branch(base, [0, 1, 0], h * 0.36, 4, 1);
}

/** the schoolyard's props, built once */
function yard(L: LineBatch) {
  // two school blocks across the yard from the self, an L round the far side
  building(L, [-20, 0, -20], { size: [36, 11, 10], yaw: A_SELF - 0.1, floors: 3, bays: 12, alpha: 0.55 });
  building(L, [-33, 0, 6], { size: [24, 8, 9], yaw: A_SELF + Math.PI / 2 - 0.1, floors: 2, bays: 8, alpha: 0.5 });
  // the flagpole and its flag
  const fp: V3 = [-9, 0, -7];
  L.seg(fp, add(fp, [0, 10, 0]), 1.2, INK.line, 0.7);
  for (let i = 0; i < 6; i++) {
    const x0 = i * 0.33, x1 = (i + 1) * 0.33, w0 = Math.sin(i * 0.9) * 0.12, w1 = Math.sin((i + 1) * 0.9) * 0.12;
    L.seg(add(fp, [x0, 9.9, w0]), add(fp, [x1, 9.9, w1]), 1, INK.line, 0.6);
    L.seg(add(fp, [x0, 8.7, w0]), add(fp, [x1, 8.7, w1]), 1, INK.line, 0.6);
  }
  L.seg(add(fp, [2, 9.9, Math.sin(6 * 0.9) * 0.12]), add(fp, [2, 8.7, Math.sin(6 * 0.9) * 0.12]), 1, INK.line, 0.6);
  // a basketball post, backboard and hoop
  const bp: V3 = [15, 0, -9];
  L.seg(bp, add(bp, [0, 3.2, 0]), 1.2, INK.line, 0.6);
  rect(L, add(bp, [0, 3.4, 0.3]), norm([0.6, 0, 0.8]), [0, 1, 0], 0.9, 0.55, 1, INK.line, 0.6);
  L.ring(add(bp, [0.25, 3.05, 0.75]), 0.23, [1, 0, 0], [0, 0, 1], 1, INK.line, 0.6, 16);
  // benches along the near side
  for (const [x, z, yaw] of [[12, 1, 1.9], [4, -12, 0.2], [-12, 8, 2.6]] as const) {
    wireBox(L, [x, 0.43, z], [1, 0.04, 0.2], yaw, 1, INK.line, 0.5);
    for (const s of [-0.85, 0.85]) {
      const leg = add([x, 0, z], [Math.cos(yaw) * s, 0, -Math.sin(yaw) * s]);
      L.seg(leg, add(leg, [0, 0.41, 0]), 1, INK.line, 0.45);
    }
  }
  // the fence the self stands at, on a chord behind them
  const fc = madd([0, 0, 0], [Math.sin(A_SELF), 0, Math.cos(A_SELF)], 12.2);
  const ft: V3 = [Math.cos(A_SELF), 0, -Math.sin(A_SELF)];
  for (let k = -14; k <= 14; k++) {
    const p = madd(fc, ft, k * 1.6);
    L.seg(p, add(p, [0, 1.3, 0]), 1, INK.line, 0.5);
  }
  for (const y of [0.45, 1.15]) L.seg(madd(add(fc, [0, y, 0]), ft, -22.4), madd(add(fc, [0, y, 0]), ft, 22.4), 1, INK.line, 0.45);
  // trees round the yard
  const trees: [number, number, number][] = [[-4, -24, 7], [18, -18, 8], [24, 4, 6.5], [-24, -4, 7.5], [3, 22, 6], [-14, 18, 7]];
  trees.forEach(([x, z, h], i) => tree(L, [x, 0, z], h, i + 3));
}

/** the six at the centre, their laughter a pure function of the beat */
function ring(beat: number, t: number, laugh: number): { pose: Pose; pos: V3; yaw: number }[] {
  const out: { pose: Pose; pos: V3; yaw: number }[] = [];
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * TAU + 0.35 + 0.08 * Math.sin(j * 2.3);
    const r = 1.05 + 0.12 * hash(j, 5, 1);
    const pos: V3 = [Math.sin(a) * r, 0, Math.cos(a) * r];
    // who is talking and who is laughing drifts; the laughing bounce is on the half-beat
    const talk = smoothstep(0.2, 0.8, 0.5 + 0.5 * noise1(t * 0.35 + j * 7.1, 3));
    const ph = TAU * 2 * beat + j * 1.7;
    const base = lerpPose(POSE.laugh, POSE.talk, talk * (1 - 0.6 * laugh));
    const shake = (0.5 + 0.5 * Math.sin(ph)) * (1 - talk * 0.7);
    out.push({
      pos,
      yaw: a + Math.PI + (hash(j, 5, 2) - 0.5) * 0.5,
      pose: {
        ...base,
        lean: base.lean - 0.1 * shake * laugh,
        nod: base.nod - 0.2 * shake * laugh,
        twist: base.twist + 0.12 * Math.sin(t * 0.9 + j),
        armL: [base.armL[0] + 0.15 * shake, base.armL[1], base.armL[2] + 0.2 * shake],
        armR: [base.armR[0] + 0.1 * shake, base.armR[1], base.armR[2]],
      },
    });
  }
  return out;
}

export default class Gilid extends Scene {
  maxSamples = 108;
  private ground = new LineBatch(40000, GROUND_GLSL);
  private props = new LineBatch(8000);
  private crowd = new LineBatch(4000, YARD_GLSL);
  private six = new LineBatch(256, YARD_GLSL);
  private W = new Words();
  private gilid!: WordShape;
  private naki!: WordShape;
  private lines!: { sabay: Word; gilid: Word; nakikinig: Word };

  async init() {
    sky ??= new Sky();
    self ??= new Self();
    groundGrid(this.ground, { extent: 80, step: 2, seg: 160, alpha: 0.5 });
    yard(this.props);
    // the rest of the yard: little knots of students, none near the self
    const members: Member[] = [];
    const knots: [number, number, number][] = [];
    for (let k = 0; knots.length < 14 && k < 80; k++) {
      const a = hash(k, 17, 1) * TAU, r = 13 + 26 * Math.sqrt(hash(k, 17, 2));
      const da = Math.atan2(Math.sin(a - A_SELF), Math.cos(a - A_SELF));
      if (Math.abs(da) < 0.55) continue;
      knots.push([Math.sin(a) * r, Math.cos(a) * r, 3 + Math.floor(hash(k, 17, 3) * 4)]);
    }
    knots.forEach(([x, z, n], k) => members.push(...scatter(n, { centre: [x, 0, z], r0: 0.7, r1: 1.4, seed: 40 + k })));
    members.forEach((m, i) => {
      if (!m.pose) return;
      addFigure(this.crowd, figure(m.pose), m, i + 100, 1, INK.line, 0.85);
    });
    const f = sans(100, 800, 'extra-condensed', 2);
    this.gilid = this.W.shape('GILID', f);
    this.naki = this.W.shape('NAKIKINIG', f);
    const L = this.lyrics;
    const l1 = L.find('Nakatayo', this.ctx.start - 1), l2 = L.find('Nakikinig', this.ctx.start);
    this.lines = { sabay: Lyrics.word(l2, 'sumasabay'), gilid: Lyrics.word(l1, 'gilid'), nakikinig: Lyrics.word(l2, 'nakikinig') };
  }

  /** the camera: spiral out of the ring, pass behind the self, crane up and over */
  private cam(t: number): Cam {
    const t0 = this.params.cut as number, tp = this.lines.gilid.start + 0.3;
    const out = prog(t, t0, tp - 0.25, ease.outCubic);
    const crane = prog(t, this.lines.nakikinig.start - 0.1, this.lines.sabay.end + 0.1, ease.inOutCubic);
    const push = prog(t, this.lines.sabay.end, this.params.next + 0.6, ease.inOutSine);
    const yaw = A_SELF + 0.42 * (t - tp) - 0.05 * crane;
    const R = lerp(3.4, 12.2, out) + 5 * crane - 3 * push;
    const y = lerp(1.05, 1.45, out) + 10.5 * crane + 1.2 * push;
    const tgt: V3 = [0, lerp(1.25, 0.35, crane), 0];
    return handheld(cam([Math.sin(yaw) * R, y, Math.cos(yaw) * R], tgt, lerp(40, 46, crane)), t, 0.0035, 0.5, 11);
  }

  render(f: Frame, out: RT): Post {
    const t = f.t;
    const b: Basis = basis(this.cam(t));
    const { sabay, gilid, nakikinig } = this.lines;
    // "sumasabay": the yard sways as one, the self alone doesn't
    const unison = prog(t, sabay.start - 0.3, sabay.start + 0.4) * (1 - prog(t, sabay.end + 0.9, sabay.end + 2.2));
    const swayDir: [number, number] = [Math.cos(A_SELF), -Math.sin(A_SELF)];
    const laugh = 0.6 + 0.4 * this.audio.env('vocals', t);

    sky!.draw(out, b, { band: 0.7 });
    this.ground.draw(out, b, {
      fog: LABAS_FOG,
      uniforms: { uNow: t, uRipT: sabay.end - 0.4, uRipA: 0.12 + 0.28 * prog(t, sabay.end, this.params.next), uRipV: 7 },
    });
    this.props.draw(out, b, { fog: LABAS_FOG });
    const yardU = { uBeat: f.beat, uSway: 0.035 + 0.1 * unison, uBob: 0.015, uGroundY: 0, uUnison: unison, uSwayDir: swayDir };
    this.crowd.draw(out, b, { fog: LABAS_FOG, uniforms: yardU });

    this.six.clear();
    ring(f.beat, t, laugh).forEach((m, j) =>
      addFigure(this.six, figure(m.pose), { pos: m.pos, yaw: m.yaw }, j + 1, 1.25, mul(INK.line, 1.25), 1),
    );
    this.six.draw(out, b, { fog: LABAS_FOG, uniforms: { ...yardU, uSway: 0.02 + 0.12 * unison, uBob: 0.03 } });

    // the self: still, head down, a breath and nothing else
    const breath = 0.02 * Math.sin(t * 1.4);
    const pose: Pose = { ...POSE.shy, lean: POSE.shy.lean + breath, nod: POSE.shy.nod + 0.1 * prog(t, gilid.start, gilid.end + 1) };
    self!.draw(out, b, t, { pos: SELF_POS, yaw: SELF_YAW, pose, col: SELF_INK, light: lightOf(this.liwanag(t)) }, { fog: LABAS_FOG });

    this.W.clear();
    this.wordGilid(t);
    this.wordNaki(t);
    this.W.draw(out, b, { fog: LABAS_FOG });
    return { bloom: 0.8, grain: 0.035, vignette: 0.35 };
  }

  /** GILID: letters rising out of the ground beside the self as each is sung */
  private wordGilid(t: number) {
    const w = this.lines.gilid;
    const vis = 1 - prog(t, this.lines.nakikinig.start + 0.6, this.lines.nakikinig.start + 1.4);
    if (t < w.start - 0.1 || vis <= 0) return;
    // world-fixed beside the self, square to the camera as the word lands; the orbit then
    // carries it across the frame
    const wb = basis(this.cam(w.end + 0.15));
    const right = norm([wb.R[0], 0, wb.R[2]]);
    const pos: V3 = add(madd(SELF_POS, right, 1.7), [0, 0.95, 0]);
    this.W.word(this.gilid, {
      pos, right, up: [0, 1, 0], height: 1.3, col: mul(lin('paper'), 1.25),
      each: (i) => {
        const k = Lyrics.charProgress(w, i, t);
        const rise = ease.outBack(clamp(k * 1.6));
        return { off: [0, (rise - 1) * 1.4 - (1 - vis) * 1.6, 0], alpha: smoothstep(0, 0.25, k) * vis, tilt: (1 - rise) * 0.6 };
      },
    });
  }

  /** NAKIKINIG: an arc of standing letters curling round the ring, each lifting as sung */
  private wordNaki(t: number) {
    const w = this.lines.nakikinig;
    const vis = 1 - prog(t, this.lines.sabay.start + 0.2, this.lines.sabay.start + 1.2);
    if (t < w.start - 0.1 || vis <= 0) return;
    const r = 3.7, h = 1.25, thc = A_SELF + 0.95;
    const s = this.naki, k = h / 320, x0 = s.w / 2;
    const Rt: V3 = [Math.cos(thc), 0, -Math.sin(thc)];
    const pos: V3 = [Math.sin(thc) * r, h * 0.42, Math.cos(thc) * r];
    this.W.word(s, {
      pos, right: Rt, up: [0, 1, 0], height: h, col: mul(lin('paper'), 1.2),
      each: (i, u) => {
        const c = Lyrics.charProgress(w, i, t);
        const sArc = (u - 0.5) * s.w * k, d = sArc / r, th = thc + d;
        const onArc: V3 = [Math.sin(th) * r, pos[1], Math.cos(th) * r];
        const lin0 = madd(pos, Rt, sArc);
        const lift = ease.outBack(clamp(c * 1.4));
        // listening: the letters shiver with the laughter they hear
        const shiver = 0.04 * Math.sin(t * 31 + i * 2.1) * this.audio.env('vocals', t);
        return {
          off: add(sub(onArc, lin0), [0, (lift - 1) * 1.1 - (1 - vis) * 1.2 + shiver, 0]),
          tilt: -d, alpha: smoothstep(0, 0.2, c) * vis, spin: (1 - lift) * 0.4 * (i % 2 ? 1 : -1),
        };
      },
    });
  }
}
