// 02 · ALON — "Tawa nila parang alon / Ako 'yung bato sa tabing-baybayin". Their laughter
// becomes a line-mesh ocean. We skim a metre over the swell as HAHAs pop on the crests,
// then a giant wave rises under us and we ride it up to its crest: far ahead, on the
// shore, a rock with a small light on it. A whip down to the beach (BATO slams in beside
// the rock), and on the downbeat the wave curls over the self in slow motion while the
// camera whips round the rock. The water falls away; the light is still there. We dive
// into it (lalamunan opens out of the gold).

import { sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics, type Word } from '../../engine/lyrics';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, hash, keys, lerp, prog, smoothstep, TAU, window01 } from '../../engine/util';
import { basis, cam, handheld, lerpCam, orbit, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { DIVE_COL, diveOut, Fill, impact, mergePost, towardDive } from './_fx';
import { POSE, Sky, type Pose } from './_labas';
import { lightOf, Self } from './_self';
import { Sea, seaClock, seaN, seaY, Spray, type SeaState } from './_alon_sea';

let sky: Sky | null = null, self: Self | null = null, fill: Fill | null = null;

const FOG: [number, number] = [18, 0.018];
/** crest speed before the break (m/s of sea clock), the crest line at the break, slow-motion rate */
const C = 10, ZB = -4.4, SLOW = 0.2;
const SELF_AT: V3 = [0, 1.28, 0.15];
const SELF_INK = mul(lin('paper'), 0.62);

/** a lumpy boulder of latitude rings and meridians, centre c, radii r */
function boulder(L: LineBatch, c: V3, r: V3, seed: number, w: number, a: number) {
  const col = mul(lin('ash'), 0.85);
  const lump = (u: number, v: number) =>
    1 + 0.1 * Math.sin(3 * u + seed) * Math.cos(2 * v + seed * 0.7) + 0.06 * Math.sin(7 * u - 5 * v + seed * 1.3);
  const P = (u: number, v: number): V3 => {
    const k = lump(u, v);
    return add(c, [r[0] * Math.cos(v) * Math.sin(u) * k, r[1] * Math.sin(v) * k, r[2] * Math.cos(v) * Math.cos(u) * k]);
  };
  const NU = 11, NV = 6;
  for (let j = 0; j <= NV; j++) {
    const v = lerp(-0.25, 1.35, j / NV), pts: V3[] = [];
    for (let i = 0; i <= NU; i++) pts.push(P((i / NU) * TAU, v));
    L.poly(pts, w, col, a * (j === NV ? 0.6 : 1));
  }
  for (let i = 0; i < NU; i++) {
    const pts: V3[] = [];
    for (let j = 0; j <= 8; j++) pts.push(P((i / NU) * TAU + 0.15 * Math.sin(j + i), lerp(-0.25, 1.4, j / 8)));
    L.poly(pts, w, col, a * 0.8);
  }
}

export default class Alon extends Scene {
  maxSamples = 72;
  private sea = new Sea(50, 0.8);
  private rocks = new LineBatch(3000);
  private spray!: Spray;
  private W = new Words();
  private haha!: WordShape;
  private bato!: WordShape;
  private sung!: { tawa: Word[]; bato: Word; ako: Word };
  private T!: { cut: number; next: number; rise0: number; crest: number; whip1: number; brk: number; out0: number; out1: number; tauB: number };

  async init() {
    sky ??= new Sky();
    self ??= new Self();
    fill ??= new Fill();
    boulder(this.rocks, [0, -0.15, 0], [2.35, 1.5, 2], 1, 1.35, 0.9);
    for (let k = 0; k < 7; k++) {
      const s = k % 2 ? 1 : -1, x = s * (8 + 5 * k + 3 * hash(k, 2)), z = 1.5 + 3 * hash(k, 3);
      const r = 0.6 + 1.1 * hash(k, 4);
      boulder(this.rocks, [x, -0.2, z], [r * 1.2, r * 0.8, r], k + 5, 1, 0.55);
    }
    const f = sans(100, 800, 'extra-condensed', 2);
    this.haha = this.W.shape('HAHA', f);
    this.bato = this.W.shape('BATO', f);

    const l1 = this.lyrics.find('Tawa nila', this.ctx.start - 1), l2 = this.lyrics.find('bato sa tabing', this.ctx.start);
    const w = (l: typeof l1, q: string) => Lyrics.word(l, q);
    this.sung = { tawa: ['tawa', 'nila', 'parang', 'alon'].map((q) => w(l1, q)), bato: w(l2, 'bato'), ako: w(l2, 'ako') };
    const A = this.audio, cut: number = this.params.cut, next: number = this.params.next;
    const bar = (t: number) => A.timeOfBar(Math.round(A.barAt(t)));
    const alon = this.sung.tawa[3];
    const crest = bar(alon.start + 0.4), brk = bar(this.sung.bato.end + 0.3), out1 = bar(brk + 2.6);
    const T = { cut, next, rise0: alon.start - 0.35, crest, whip1: this.sung.ako.start - 0.18, brk, out0: out1 - 0.7, out1, tauB: 0 };
    T.tauB = this.clock(brk, T);
    this.T = T;
    // spray from where the lip lands and off the rock itself
    this.spray = new Spray(2000, T.tauB - 0.04, 0.5, (x) => ZB + 1.5 * Math.sin(0.045 * x) + 3.4, 28, 9);
  }

  private clock(t: number, T = this.T) {
    return seaClock(t, T.cut, SLOW, T.brk - 0.25, T.brk, T.out0, T.out1);
  }

  /** the sea at song time t */
  state(t: number): SeaState {
    const T = this.T, tau = this.clock(t), dt = tau - T.tauB;
    const zc = dt <= 0 ? ZB + C * dt : ZB + 4 * dt;
    const H = keys(t, [[T.cut, 0.55], [T.rise0, 0.8], [T.crest, 8.2, ease.inOutSine], [T.brk, 9.4, ease.linear]]);
    const wf = lerp(6, 2.3, smoothstep(T.tauB - 3.2, T.tauB - 0.3, tau));
    const curl = ease.inQuad(clamp((tau - (T.tauB - 1.3)) / 1.3));
    const sink = dt <= 0 ? 1 : Math.exp(-1.3 * dt);
    const foam = dt <= 0 ? 0 : (1 - Math.exp(-5 * dt)) * Math.exp(-0.8 * dt);
    return { tau, zc, H, wf, curl, sink, foam, swell: dt <= 0 ? 0.55 : lerp(0.55, 0.35, clamp(dt)) };
  }

  /**
   * Riding the swell, then the wave, `d` metres ahead of its crest: as it lifts us the view
   * swings left along the crest (the wall running off into the dark), then round to the
   * front on the downbeat: far below and ahead, the rock.
   */
  private rideCam(t: number): Cam {
    const T = this.T, S = this.state(t);
    const rise = prog(t, T.rise0, T.crest, ease.inOutSine);
    const d = keys(t, [[T.cut, 9], [T.rise0, 7.5], [T.crest, 1.4, ease.inOutSine], [T.crest + 1, 2.4]]);
    const x = 1.6 * Math.sin(0.55 * (t - T.cut)) + 0.6 * Math.sin(1.3 * (t - T.cut) + 1);
    const z = S.zc + d;
    // hug the water a metre up, lifted with the wave (and a little ahead of the swell's bob)
    const y = seaY(x, z, S) * 0.85 + 0.15 * seaY(x, z + 3, S) + lerp(1.0, 1.6, rise);
    const psi = keys(t, [[T.rise0, 0], [T.rise0 + 0.55, -1.55, ease.inOutSine], [T.crest - 0.25, -1.4, ease.linear], [T.crest + 0.25, 0, ease.inOutCubic]]);
    const pitch = lerp(-0.07, -0.03, rise);
    const look: V3 = add([x, y, z], mul([Math.sin(psi) * Math.cos(pitch), Math.sin(pitch), Math.cos(psi) * Math.cos(pitch)], 20));
    const tgt = mix3(look, [0, 1.4, 0], prog(t, T.crest - 0.2, T.crest + 0.3, ease.inOutSine) * 0.95);
    const roll = 0.07 * Math.sin(0.8 * (t - T.cut) + 0.5) * (1 - rise) + 0.1 * Math.sin(psi) * rise;
    return cam([x, y, z], tgt, lerp(52, 46, rise), roll);
  }

  private beachCam(t: number): Cam {
    const k = prog(t, this.T.whip1, this.T.brk, ease.inOutSine);
    return handheld(cam(mix3([3.8, 1.55, 11.5], [2.6, 1.3, 8.2], k), [-0.7, 2.4, -1.2], 47), t, 0.004, 0.7, 4);
  }

  /** round the rock: whip in on the break, drift, then come round to the self's front */
  private rockCam(t: number): Cam {
    const T = this.T;
    const late = prog(t, T.out0 - 0.3, T.next - 0.45, ease.inOutSine);
    const yaw = -1.25 - 0.1 * (t - T.brk) * (1 - late) - 1.45 * late;
    const dist = lerp(5.4, 3.1, late), chest = self!.chest({ pos: SELF_AT, yaw: Math.PI, pose: this.pose(t) });
    const tgt = mix3([0, 2.3, 0.2], chest, late);
    return handheld(orbit(tgt, yaw, lerp(0.03, -0.02, late), dist, lerp(52, 42, late)), t, 0.004, 0.6, 5);
  }

  private cam(t: number): Cam {
    const T = this.T;
    return shots(t, [
      { t: T.cut, cam: (t) => this.rideCam(t) },
      { t: T.whip1, cam: (t) => this.beachCam(t), snap: 0.6 },
      { t: T.brk, cam: (t) => this.rockCam(t), snap: 0.5, kick: 0.05 },
    ]);
  }

  private pose(t: number): Pose {
    // the rock: planted, braced a little as the water comes, head up again after
    const brace = window01(t, this.T.brk - 0.6, this.T.out1, 0.5, 1.2);
    return { ...POSE.shy, nod: lerp(0.35, 0.1, brace), lean: 0.08 + 0.1 * brace, armL: [0.12, 0.05 + 0.1 * brace, 0.4], armR: [0.12, 0.05 + 0.1 * brace, 0.4] };
  }

  render(f: Frame, out: RT): Post {
    const t = f.t, T = this.T, S = this.state(t);
    let c = this.cam(t);
    // the dive: into the chest light
    const kd = diveOut(t, T.next, 0.5);
    const pose = this.pose(t), selfO = { pos: SELF_AT, yaw: Math.PI, pose };
    const chest = self!.chest(selfO);
    if (kd > 0) {
      const d = norm(sub(c.pos, chest));
      c = lerpCam(c, cam(madd(chest, d, 0.12), chest, 30), ease.inCubic(kd), 'pan');
    }
    const b: Basis = basis(c);

    sky!.draw(out, b, { band: 0.9, hor: mul(lin('slate'), 0.6) });
    this.sea.draw(out, b, S, FOG);
    this.rocks.draw(out, b, { fog: FOG });

    this.W.clear();
    this.wordsHaha(t, b);
    this.wordBato(t, b);
    this.W.draw(out, b, { fog: FOG, nearFade: 0.8 });

    // the light dims under the water and comes back
    const under = window01(t, T.brk + 0.1, T.out1 - 0.2, 0.6, 1.4);
    self!.draw(out, b, t, { ...selfO, col: SELF_INK, w: 1.3, light: lightOf(this.liwanag(t)) * (1 - 0.45 * under) }, { fog: FOG });
    this.spray.draw(out, b, S.tau, 0.75, FOG);

    const kick = impact(t, [T.cut], { flash: 0.2, ca: 1, shake: 14 });
    const hit = impact(t, [T.brk], { flash: 0.03, ca: 0.7, shake: 9, tau: 0.3, seed: 2 });
    const thud = impact(t, this.batoHits(), { ca: 0.25, shake: 4, tau: 0.12, seed: 3 });
    let post: Post = mergePost({ bloom: 0.85, grain: 0.035, vignette: 0.35 }, kick, hit, thud);
    if (kd > 0) {
      fill!.draw(out, DIVE_COL, kd, 'over');
      post = towardDive(post, kd);
    }
    return post;
  }

  /** each BATO letter lands on its sung char */
  private batoHits(): number[] {
    const w = this.sung.bato;
    return [0, 1, 2, 3].map((i) => (w.c[i] ?? w.start) + 0.12);
  }

  /**
   * HAHA: bursts of laughter on the crests, one burst per sung word, riding the swell; the
   * last ("alon") strung out along the top of the giant wave as it lifts us.
   */
  private wordsHaha(t: number, b: Basis) {
    if (t > this.T.whip1 + 0.05) return;
    const S = this.state(t);
    for (let j = 0; j < 18; j++) {
      const k = Math.min(3, Math.floor(j / 4)), m = j - k * 4;
      const w = this.sung.tawa[k], tb = w.start + m * (k === 3 ? 0.1 : 0.07);
      const age = t - tb;
      if (age < 0 || age > 2.8) continue;
      let x: number, z: number;
      if (k < 3) {
        const cb = basis(this.rideCam(tb + 0.9));
        const fh = norm([cb.F[0], 0, cb.F[2]]), rh: V3 = [fh[2], 0, -fh[0]];
        // a word's four bursts fan out ahead, side to side, each further off (random spots piled up)
        const side = (m % 2 ? 1 : -1) * (2.5 + 2.2 * m + 1.2 * hash(j, 2));
        const p0 = madd(madd(cb.pos, fh, 8 + 3.2 * m + 1.5 * hash(j, 1)), rh, side);
        [x, z] = [p0[0], p0[2]];
      } else {
        // on the crest, running away along it
        x = this.rideCam(this.T.crest).pos[0] - 6 - 5.5 * m - 2 * hash(j, 1);
        z = S.zc + 1.5 * Math.sin(0.045 * x) + 0.6;
      }
      const pop = ease.outBack(clamp(age / 0.28));
      const sinkK = Math.max(prog(age, 2.1, 2.8, ease.inCubic), prog(t, this.T.whip1 - 0.35, this.T.whip1 + 0.05));
      const n = seaN(x, z, S);
      const up = norm(mix3([0, 1, 0], n, k === 3 ? 0.2 : 0.6));
      const toCam = sub(b.pos, [x, 0, z]);
      const right = norm(cross(up, norm([toCam[0], 0, toCam[2]])));
      const h = (k === 3 ? 1.7 : 1.0) * (0.8 + 0.4 * hash(j, 3));
      const near = smoothstep(4, 9, Math.hypot(toCam[0], toCam[2]));
      this.W.word(this.haha, {
        pos: [x, seaY(x, z, S) + 0.25 + h * 0.3 - sinkK * h, z], right, up, height: h * pop,
        col: mul(lin('paper'), 1.2), alpha: smoothstep(0, 0.12, age) * (1 - sinkK) * near,
        each: (i) => ({ off: mul(up, 0.12 * h * Math.sin(age * 9 + i * 1.6)), spin: 0.12 * Math.sin(age * 7 + i * 2.2 + j) }),
      });
    }
  }

  /** BATO: stone letters slamming into the beach beside the rock, one per sung char */
  private wordBato(t: number, b: Basis) {
    const w = this.sung.bato;
    if (t < w.start - 0.1) return;
    const pos: V3 = [2.7, 1.2, -1.1];
    const toCam = norm(sub([3.4, 0, 11], [pos[0], 0, pos[2]]));
    // only from its front: as the camera whips round, the word is gone before it turns edge-on
    const v = norm(sub(b.pos, pos)), front = smoothstep(0.45, 0.8, v[0] * toCam[0] + v[2] * toCam[2]);
    if (front <= 0) return;
    const right: V3 = [toCam[2], 0, -toCam[0]];
    const hits = this.batoHits();
    const dS = this.state(t).tau - this.T.tauB;
    if (dS > 0.3) return;
    this.W.word(this.bato, {
      pos, right, up: [0, 1, 0], height: 2.6, col: mul(lin('ash'), 1.15), alpha: front,
      each: (i) => {
        const land = hits[i], k = prog(t, land - 0.14, land, ease.inQuad);
        // the water takes the word (not the rock): swept up the beach, tumbling, in the sea's slow clock
        const sw = Math.max(dS - 0.04 - 0.03 * i, 0);
        const off: V3 = [0.8 * sw * (i - 1.5), (1 - k) * 4.5 + 2.2 * sw - 6 * sw * sw, 5 * sw];
        return { off, alpha: smoothstep(land - 0.16, land - 0.1, t) * (1 - smoothstep(0.03, 0.15, sw)), spin: (1 - k) * 0.3 * (i % 2 ? 1 : -1) + 3 * sw * (i % 2 ? 1 : -1), tilt: -2.5 * sw };
      },
    });
  }
}
