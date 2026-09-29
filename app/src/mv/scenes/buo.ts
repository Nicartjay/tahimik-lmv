// 17 · BUO — LABAS and LOOB at once. Everything they have been comes back, and fits.
//
// Opens on an IMPACT out of sulok's dawn: their chest bursts and every world so far comes out
// of it in pieces, line shards (a patch of alon's wave, lalamunan's C-rings, bulsa's note,
// noon's photo frame, far out entablado's arch) with splinters and LOOB's fireflies, wheeling
// round them in a vortex. Under LABAS's grid the firefly sea shows through, a disc that
// widens on every downbeat. On every beat a shard breaks from the vortex and slams into its
// place in a dome round them (a downbeat slams two or three and sends a shock through the
// floor); the camera stays low round them against the spin, then goes overhead on the spiral.
// "At kung tanggapin": they lift their head and open their arms, and the letters of TANGGAPIN
// fly in out of the vortex and slam one by one into a crown round their head. In the kick gap
// the vortex hangs (bullet time: only the camera, the last letter and the arch still move);
// it lets go as the arch slams down behind them, and the last photo frame lands on the next
// beat. On "buo" the flare: the chest goes off, the dome catches gold from the inside out,
// the crown and the swirl blow away, BUO slams down into the arch letter by letter, the whole
// floor turns to sea, and the camera dives into the light (a FLARE into gilid).

import { FPS } from '../../engine/config';
import type { RT } from '../../engine/gl';
import { Lyrics, type Line, type Word } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, hash, lerp, prog, smoothstep, TAU } from '../../engine/util';
import { basis, handheld, orbit, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, dist, madd, mix3, mul, norm, rotAxis, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { Words, type WordShape } from '../../engine/3d/words';
import { bars, beats, decay, DIVE_COL, diveOut, Fill, impact, mergePost, towardDive } from './_fx';
import { addShard, Grid, shockFront, Swirl, vortexAt, type Kind, type Placed, type Shock, type Vx } from './_buo_shards';
import { Sea } from './_buo_sea';
import { HERO, PAPER, SELF_INK } from './_dami_chorus';
import { INK, LABAS_FOG, lerpPose, POSE, Sky, type Pose } from './_labas';
import { GOLD, lightOf, Self } from './_self';

/** the Words kit's raster em (engine/3d/words.ts) */
const EM = 320;
const POST: Post = { bloom: 0.85, grain: 0.04, vignette: 0.32 };
const UP: V3 = [0, 1, 0];
const VIOLET: RGB = [0.5, 0.42, 0.95];
const SEA_COL: RGB = mul(lin('sea'), 1.5);
/** the dome's centre (the chest, roughly) */
const HUB: V3 = [0, 1.4, 0];
/** entablado's arch, landed behind them; BUO stands in it */
const ARCH_C: V3 = [0, 3.2, -5.2], ARCH_S = 3.2;
const BUO_POS: V3 = [0, 3.35, -4.9], BUO_H = 3;
/** TANGGAPIN's crown round their head */
const CROWN_C: V3 = [0, 2.3, 0], CROWN_R = 2.3, CROWN_H = 0.8;
/** the flare's gold spreading out of the chest, m/s */
const IGNITE_V = 14;

const OPEN: Pose = { ...POSE.stand, lean: -0.04, nod: -0.12, armL: [0.35, 0.7, 0.35], armR: [0.35, 0.7, 0.35] };
const WIDE: Pose = { ...POSE.stand, lean: -0.14, nod: -0.4, armL: [0.15, 1.75, 0.1], armR: [0.15, 1.75, 0.1] };

/** a knock: out and back, peaking ~.1 s after x = 0 */
const knock = (x: number) => (x > 0 ? Math.exp(-x * 6) * (1 - Math.exp(-x * 40)) : 0);
/** ∫ of a rate ramping 0 → 1 over [a, a + r] */
const ramp = (t: number, a: number, r: number) => (t < a ? 0 : t < a + r ? (t - a) ** 2 / (2 * r) : t - a - r / 2);

interface Slot { c: V3; R: V3; U: V3; N: V3 }
const facingOut = (c: V3): Slot => {
  const N = norm([c[0], (c[1] - HUB[1]) * 0.6, c[2]]), R = norm(cross(UP, N));
  return { c, R, U: cross(N, R), N };
};
const az = (deg: number, r: number, y: number): V3 => [Math.sin((deg * Math.PI) / 180) * r, y, Math.cos((deg * Math.PI) / 180) * r];
/** the dome: a low ring either side (the front and back left open), a high ring, one on the floor */
const SLOTS: Record<string, Slot> = {
  F: { c: [0.3, 0.06, 2.3], R: [1, 0, 0], U: [0, 0, -1], N: [0, 1, 0] },
};
[52, 80, 108, 136, 224, 252, 280, 308].forEach((d, k) => (SLOTS['L' + k] = facingOut(az(d, 3.25 + 0.3 * hash(k, 3, 1), 1.25 + 0.3 * Math.sin(k * 2.3)))));
[40, 75, 108, 140, 220, 252, 285, 320].forEach((d, k) => (SLOTS['U' + k] = facingOut(az(d, 3.1 + 0.2 * hash(k, 3, 2), 3.5 + 0.25 * Math.sin(k * 1.7)))));
/** what lands where, in the order they land (the beats fill it in) */
const ORDER: [Kind, string][] = [
  ['frame', 'L1'], ['wave', 'L6'],
  ['throat', 'U2'], ['note', 'U5'], ['wave', 'L3'],
  ['frame', 'U6'], ['throat', 'L0'], ['note', 'U1'],
  ['wave', 'F'], ['frame', 'L5'], ['throat', 'U4'],
  ['note', 'L2'], ['wave', 'U7'], ['frame', 'L4'],
  ['throat', 'L7'], ['note', 'U3'],
  ['frame', 'U0'],
];
const SIZE: Record<Kind, number> = { wave: 0.95, throat: 0.7, note: 0.62, frame: 0.8, arch: ARCH_S };

interface Shard {
  kind: Kind;
  home: Slot;
  s: number;
  /** when it lands */
  ts: number;
  /** its place in the vortex: radius, height, phase, seed; tumble axis and rate */
  r0: number;
  y0: number;
  th0: number;
  seed: number;
  ax: V3;
  spin: number;
  B0: [V3, V3];
}

let sky: Sky | null = null, sea: Sea | null = null, grid: Grid | null = null, swirl: Swirl | null = null;
let self: Self | null = null, words: Words | null = null, fill: Fill | null = null;
let lines: LineBatch | null = null, sparks: GlowPoints | null = null;

export default class Buo extends Scene {
  maxSamples = 108;

  private T!: { d: number[]; arch: number; last: number; buo: number; ends: number };
  private w!: { tang: Word; buo: Word };
  private S!: { tang: WordShape; buo: WordShape };
  private shards!: Shard[];
  private arch!: Shard;
  private shocks!: Shock[];
  /** shocks that open the sea (their fronts are its rim) */
  private reveals!: Shock[];
  private slams!: { single: number[]; down: number[] };

  async init() {
    sky ??= new Sky();
    sea ??= new Sea();
    grid ??= new Grid({ extent: 90, step: 2, major: 5, seg: 30, col: mul(INK.dim, 1.25), alpha: 0.5 });
    swirl ??= new Swirl([INK.shade, SEA_COL, VIOLET, PAPER, mul(INK.line, 1.4)]);
    self ??= new Self();
    words ??= new Words();
    fill ??= new Fill();
    lines ??= new LineBatch(4096);
    sparks ??= new GlowPoints(2048);

    const c: number = this.params.cut, next: number = this.params.next, L = this.lyrics;
    const find = (q: string): Line => L.find(q, c - 1);
    const line = find('tanggapin');
    this.w = { tang: Lyrics.word(line, 'tanggapin'), buo: Lyrics.word(line, 'buo') };
    this.S = { tang: words.shape('TANGGAPIN', HERO), buo: words.shape('BUO', HERO) };

    const d = bars(this.audio, c + 0.3, next);
    const B = beats(this.audio, c + 0.3, next);
    const buo = this.w.buo.start;
    const arch = B.find((b) => b > d[2] + 0.1)!;
    const lands: number[] = [], single: number[] = [], down: number[] = [];
    for (const b of B) {
      if (b > buo - 0.3 || Math.abs(b - arch) < 0.05) continue;
      const isDown = d.some((x) => Math.abs(x - b) < 0.05);
      const n = isDown ? (Math.abs(b - d[2]) < 0.05 ? 2 : 3) : 1;
      for (let i = 0; i < n; i++) lands.push(b);
      (isDown ? down : single).push(b);
    }
    this.T = { d, arch, last: lands[lands.length - 1], buo, ends: next - 1 / FPS };
    this.slams = { single, down };

    const shard = (kind: Kind, home: Slot, ts: number, i: number): Shard => {
      const ax = norm([hash(i, 5, 5) - 0.5, hash(i, 5, 6) - 0.5, hash(i, 5, 7) - 0.5]);
      const R0 = norm([hash(i, 5, 8) - 0.5, hash(i, 5, 9) - 0.5, hash(i, 5, 10) - 0.5]);
      return {
        kind, home, ts, s: home === SLOTS.F ? 1.3 : SIZE[kind],
        r0: 2.7 + 1.5 * hash(i, 5, 1), y0: 0.6 + 3.4 * hash(i, 5, 2), th0: (TAU * i) / ORDER.length + 0.3 * hash(i, 5, 3), seed: hash(i, 5, 4),
        ax, spin: (1.5 + 2 * hash(i, 5, 11)) * (hash(i, 5, 12) < 0.5 ? -1 : 1), B0: [R0, norm(cross(ax, R0))],
      };
    };
    this.shards = ORDER.map(([k, s], i) => shard(k, SLOTS[s], lands[i], i));
    this.arch = { ...shard('arch', { c: ARCH_C, R: [1, 0, 0], U: UP, N: [0, 0, 1] }, arch, 40), r0: 13, y0: 5 };

    const wb = this.w.buo.c;
    this.shocks = [
      { t: c, R: 5, v: 30, amp: 0.6 },
      { t: d[0], R: 12, v: 28, amp: 0.5 },
      { t: d[1], R: 26, v: 32, amp: 0.6 },
      { t: d[2], R: 40, v: 36, amp: 0.5 },
      { t: arch, R: 18, v: 30, amp: 0.7, c: [0, ARCH_C[2]] },
      { t: buo, R: 140, v: 40, amp: 1 },
      { t: wb[1], R: 10, v: 25, amp: 0.35, c: [0, BUO_POS[2]] },
      { t: wb[2], R: 10, v: 25, amp: 0.35, c: [0, BUO_POS[2]] },
      { t: d[3], R: 60, v: 34, amp: 0.5 },
    ].sort((a, b) => a.t - b.t) as Shock[];
    this.reveals = [
      { t: c, R: 3.5, v: 30, amp: 0 },
      { t: d[0], R: 10, v: 28, amp: 0 },
      { t: d[1], R: 24, v: 32, amp: 0 },
      { t: d[2], R: 40, v: 36, amp: 0 },
      { t: buo, R: 220, v: 40, amp: 0 },
    ];
  }

  /** the vortex's clock: song time since the cut, but it all but stops for the kick gap */
  private clock(t: number) {
    const { d, arch } = this.T;
    return t - this.params.cut - 0.95 * (ramp(t, d[2], 0.07) - ramp(t, arch - 0.22, 0.2));
  }

  private vx(t: number): Vx {
    const c: number = this.params.cut, tau = this.clock(t);
    return {
      tau,
      burst: lerp(0.08, 1, prog(t, c, c + 0.8, ease.outExpo)),
      out: 1.2 * prog(t, this.T.buo, this.T.buo + 1.1, ease.outCubic),
      tilt: 0.14 * Math.sin(0.45 * tau),
    };
  }

  /** a shard's centre, basis and scale at t */
  private place(sh: Shard, t: number, v: Vx): { c: V3; R: V3; U: V3; N: V3; s: number } {
    const dt = t - sh.ts, H = sh.home;
    if (dt >= 0) {
      const j = Math.sin(dt * 45) * Math.exp(-dt * 18);
      return { c: madd(H.c, H.N, 0.22 * sh.s * j), R: H.R, U: H.U, N: H.N, s: sh.s * (1 + 0.2 * Math.exp(-dt / 0.07)) };
    }
    let c: V3, s: number;
    const a = sh.spin * v.tau;
    let R = rotAxis(sh.B0[0], sh.ax, a), U = rotAxis(sh.B0[1], sh.ax, a);
    if (sh.kind === 'arch') {
      // far out, a slow wheel round everything
      const r = lerp(40, sh.r0, prog(t, this.params.cut, this.params.cut + 2, ease.outExpo)), th = 2.2 + 0.7 * v.tau;
      c = [Math.sin(th) * r, sh.y0 + 0.8 * Math.sin(v.tau * 0.6), Math.cos(th) * r];
      R = rotAxis([1, 0, 0], UP, th + 0.25 * v.tau);
      U = rotAxis(UP, R, 0.35 * Math.sin(v.tau * 0.5));
      s = sh.s * 0.8;
    } else {
      c = vortexAt(sh.r0, sh.y0, sh.th0, sh.seed, v);
      s = sh.s * 0.8;
    }
    const e = prog(t, sh.ts - (sh.kind === 'arch' ? 0.42 : 0.24), sh.ts, ease.inCubic);
    const eo = prog(t, sh.ts - (sh.kind === 'arch' ? 0.55 : 0.32), sh.ts, ease.inOutCubic);
    if (e > 0 || eo > 0) {
      c = mix3(c, H.c, e);
      s = lerp(s, sh.s, e);
      R = norm(mix3(R, H.R, eo));
      U = mix3(U, H.U, eo);
      U = norm(sub(U, mul(R, R[0] * U[0] + R[1] * U[1] + R[2] * U[2])));
    }
    return { c, R, U, N: cross(R, U), s };
  }

  private camera(t: number): Cam {
    const c: number = this.params.cut, { d, arch, buo } = this.T;
    const cm = shots(t, [
      // the burst: in close, thrown back as it comes out of them, circling against the spin
      { t: c, cam: (t) => {
        const k = prog(t, c, c + 1.6, ease.outExpo);
        return orbit([0, lerp(1.2, 1.45, k), 0], lerp(0.8, 0.1, prog(t, c, d[0], ease.inOutSine)), lerp(0, 0.1, k), lerp(2.4, 7.6, k), lerp(58, 48, k));
      } },
      // overhead: the spiral, the dome filling, the sea opening under the floor
      { t: d[0], snap: 0.3, kick: 0.06, cam: (t) =>
        orbit([0, 0.6, 0], -0.3 - 0.5 * (t - d[0]), 1.25, lerp(12.5, 10.5, prog(t, d[0], d[1], ease.inOutSine)), 52) },
      // the crown, from in front
      { t: d[1], snap: 0.35, kick: -0.07, cam: (t) => {
        const k = prog(t, d[1], d[2], ease.inOutSine);
        return orbit([0, lerp(1.75, 2.0, k), 0], lerp(0.5, 0.08, k), lerp(0, 0.1, k), lerp(7.4, 5.8, k), 46);
      } },
      // bullet time: low from the front-left, drifting at full speed while the vortex hangs
      { t: d[2], kick: 0.05, cam: (t) => orbit([0, 1.5, 0], lerp(-0.75, -0.3, prog(t, d[2], arch)), -0.28, 3.3, 40) },
      { t: arch, snap: 0.28, kick: 0.09, cam: (t) => this.hero(t) },
      // the flare knocks it back
      { t: buo, kick: 0.1, cam: (t) => this.hero(t) },
    ]);
    return handheld(cm, t, 0.006, 0.7, 23);
  }

  /** the hero wide: the arch lands behind them, BUO, the flare, and the dive into the chest */
  private hero(t: number): Cam {
    const { arch, buo, ends } = this.T;
    const wb = this.w.buo.c;
    const k = prog(t, arch, ends - 0.4, ease.inOutSine), dv = diveOut(t, ends, 0.6);
    const back = 0.8 * knock(t - arch) + 2.6 * knock(t - buo) + 0.7 * knock(t - wb[1]) + 0.9 * knock(t - wb[2]);
    return orbit([0, lerp(2.35, 1.3, dv), 0], lerp(0.1, -0.06, k), lerp(-0.13, 0, dv), lerp(lerp(9.2, 6.6, k) + back, 0.9, dv), lerp(48, 42, k));
  }

  private pose(t: number): Pose {
    const c: number = this.params.cut, { buo } = this.T;
    const burst = lerpPose(POSE.stand, WIDE, 0.6 * decay(t, [c], 0.35));
    const shy = lerpPose(burst, POSE.shy, prog(t, c + 0.45, c + 1.3, ease.inOutCubic));
    const open = lerpPose(shy, OPEN, prog(t, this.w.tang.start - 0.1, this.w.tang.start + 0.9, ease.inOutCubic));
    return lerpPose(open, WIDE, prog(t, buo - 0.05, buo + 0.35, ease.outBack));
  }

  render(f: Frame, out: RT): Post {
    const t = f.t, c: number = this.params.cut, { d, arch, buo, ends } = this.T;
    const liw = this.liwanag(t), light = lightOf(liw);
    const v = this.vx(t), wt = c + v.tau;
    const b: Basis = basis(this.camera(t));

    // the flare: a hit and what it leaves lit
    const flash = decay(t, [buo], 0.35), held = prog(t, buo, buo + 0.4, ease.outCubic);
    const dive = diveOut(t, ends, 0.35);
    const gold = mul(GOLD, light);

    const pose = this.pose(t);
    const me = { pos: [0, 0, 0] as V3, yaw: 0, pose };
    const chest = self!.chest(me);

    sky!.draw(out, b, {
      top: mul(lin('slate'), 0.1), hor: mix3(mul(lin('slate'), 0.2), mul(lin('dawn'), 0.18), 0.5), ground: mul(lin('ink'), 1.2), band: 0.45,
      warm: light * (0.06 + 0.28 * held + 0.6 * flash) + 2 * dive, warmDir: [0.1, 0.08, -1], warmCol: mix3(lin('dawn'), GOLD, held),
    });
    // LOOB under the floor
    const reveal = Math.max(...this.reveals.map((s) => shockFront(s, s.t >= buo ? t : wt)));
    sea!.draw(out, b, {
      t: wt, y: -0.4, reveal, chest, light, speck: 1 + 0.6 * held, sun: [0.1, 0.08, -1], sunCol: mul(mix3(lin('dawn'), GOLD, held), light * (0.1 + 0.3 * held)),
      rim: mix3(mul(SEA_COL, 0.6), mul(GOLD, light * 0.5), 0.2 + 0.8 * held),
    });
    const goldFront = t >= buo ? shockFront(this.shocks.find((s) => s.t === buo)!, t) : 0;
    grid!.draw(out, b, t >= buo ? t : wt, this.shocks, light, goldFront, GOLD, { fog: LABAS_FOG });

    swirl!.draw(out, b, {
      vx: v, now: wt, debrisI: 1 + 1.5 * decay(t, [c], 0.3), gold: held, goldCol: mul(gold, 0.8), fliesI: light * 0.7,
      fog: LABAS_FOG, nearFade: 3,
    });

    // the shards, their landings and sparks
    const L = lines!.clear(), P = sparks!.clear();
    const hot = mul(PAPER, 1.6);
    for (const sh of [...this.shards, this.arch]) {
      const p = this.place(sh, t, v), landed = t >= sh.ts;
      const ig = smoothstep(0, 0.12, t - buo - dist(sh.home.c, HUB) / IGNITE_V);
      const hit = 1 + 3 * decay(t, [sh.ts], 0.09) + 2 * decay(t, [buo + dist(sh.home.c, HUB) / IGNITE_V], 0.12) + 0.5 * decay(t, [d[3]], 0.2) * ig;
      const base: [RGB, RGB, RGB] =
        sh.kind === 'wave' ? [SEA_COL, mul(PAPER, 0.9), SEA_COL]
        : sh.kind === 'throat' ? [mul(VIOLET, 1.1), mul(VIOLET, 0.6), VIOLET]
        : sh.kind === 'note' ? [mul(PAPER, 0.85), mul(gold, 0.5), gold]
        : sh.kind === 'frame' ? [mul(PAPER, 0.8), mul(INK.shade, 0.8), mul(gold, 0.6)]
        : [mul(INK.shade, 1.3), mul(INK.dim, 1.6), INK.dim];
      const col = base.map((k) => mul(mix3(k, mul(gold, 0.9), ig), (landed ? 1 : 0.6) * hit)) as [RGB, RGB, RGB];
      const pl: Placed = { kind: sh.kind, ...p, col, alpha: 1, w: landed ? 1.5 + 0.6 * ig : 1.2 };
      addShard(L, pl);
      if (!landed) continue;
      // the landing: a ring out in its plane, sparks off it
      const u = (t - sh.ts) / 0.45;
      if (u < 1) L.ring(p.c, sh.s * (0.8 + 2.4 * ease.outCubic(u)), p.R, p.U, 1.5, hot, 0.9 * (1 - u) ** 2, 40);
      this.burst(P, sh.home.c, sh.ts, t, sh.kind === 'arch' ? 60 : 18, hot, sh.ts * 7);
      if (t >= buo) this.burst(P, sh.home.c, buo + dist(sh.home.c, HUB) / IGNITE_V, t, 12, mul(gold, 1.6), sh.ts * 3);
    }
    L.draw(out, b, { fog: LABAS_FOG, nearFade: 1.5 });

    self!.draw(out, b, t, {
      ...me, col: mix3(SELF_INK, mul(GOLD, 0.8), 0.55 + 0.35 * held), w: 2,
      light: light * (1 + 1.8 * decay(t, [c], 0.3) + 0.35 * decay(t, d, 0.2) + 1.2 * flash + 0.25 * held),
      halo: 0.07 * (1 + 1.5 * flash + 0.5 * held),
    }, { fog: [30, 0.006] });

    const W = words!.clear();
    this.tanggapin(W, t, v, gold);
    this.buoWord(W, P, t, gold);
    W.draw(out, b);
    P.draw(out, b, { fog: LABAS_FOG, nearFade: 1.8 });

    fill!.draw(out, gold, 0.12 * flash, 'add');
    fill!.draw(out, DIVE_COL, dive, 'over');

    const { single, down } = this.slams;
    return towardDive(mergePost(
      POST,
      impact(t, [c], { flash: 0.35, ca: 1, shake: 14 }),
      impact(t, single, { ca: 0.35, shake: 4, tau: 0.1, seed: 2 }),
      impact(t, down, { flash: 0.1, ca: 0.8, shake: 10, tau: 0.2, seed: 5 }),
      impact(t, [arch], { flash: 0.15, ca: 0.9, shake: 14, tau: 0.22, seed: 7 }),
      impact(t, this.w.tang.c, { ca: 0.2, shake: 2.5, tau: 0.07, seed: 9 }),
      impact(t, [buo], { flash: 0.3, ca: 1.2, shake: 16, tau: 0.35, seed: 11 }),
      impact(t, this.w.buo.c.slice(1), { ca: 0.5, shake: 7, tau: 0.14, seed: 13 }),
      impact(t, [d[3]], { ca: 0.6, shake: 8, tau: 0.2, seed: 15 }),
    ), dive);
  }

  /** sparks thrown off a landing at t0: ballistic, dying in a quarter second */
  private burst(P: GlowPoints, at: V3, t0: number, t: number, n: number, col: RGB, seed: number) {
    const dt = t - t0;
    if (dt < 0 || dt > 0.9) return;
    for (let i = 0; i < n; i++) {
      const u = TAU * hash(i, seed, 1), z = 2 * hash(i, seed, 2) - 1, sp = 2.5 + 4 * hash(i, seed, 3);
      const r = Math.sqrt(1 - z * z), dir: V3 = [r * Math.cos(u), z, r * Math.sin(u)];
      const p = add(madd(at, dir, sp * dt * (1 - 0.35 * dt)), [0, -4.9 * dt * dt, 0]);
      P.point(p, -0.025, col, Math.exp(-dt / 0.22) * (0.5 + 0.5 * hash(i, seed, 4)));
    }
  }

  /** TANGGAPIN: each letter out of the vortex, slammed into the crown on its syllable */
  private tanggapin(W: Words, t: number, v: Vx, gold: RGB) {
    const w = this.w.tang, S = this.S.tang, { buo } = this.T;
    if (t < w.start - 0.9 || t > buo + 0.6) return;
    const k = CROWN_H / EM, width = S.w * k;
    const pos = add(CROWN_C, [0, 0, CROWN_R]);
    const bo = prog(t, buo, buo + 0.5, ease.outCubic);
    W.word(S, {
      pos, right: [1, 0, 0], up: UP, height: CROWN_H, col: mul(PAPER, 1.25),
      each: (i, u) => {
        const ci = w.c[i] ?? w.start, x = (u - 0.5) * width, th = x / CROWN_R;
        const flat = add(pos, [x, 0, 0]);
        const home: V3 = [CROWN_C[0] + Math.sin(th) * CROWN_R, CROWN_C[1], CROWN_C[2] + Math.cos(th) * CROWN_R];
        const e = prog(t, ci - 0.18, ci, ease.inCubic);
        let p = home, tilt = -th, spin = 0, scale = 1 + 0.35 * decay(t, [ci], 0.06);
        if (e < 1) {
          const th0 = th + 2.4 + 0.5 * i, q = vortexAt(3 + 0.4 * hash(i, 9, 1), 2.1 + 0.9 * hash(i, 9, 2), th0, hash(i, 9, 3), v);
          p = mix3(q, home, e);
          const qa = Math.atan2(q[0], q[2]);
          tilt = lerp(-qa, -th, e);
          spin = (1 - e) * v.tau * (2 + hash(i, 9, 4)) * (i % 2 ? 1 : -1);
          scale = lerp(0.7, 1, e);
        }
        // blown off the head by the flare
        if (bo > 0) p = add(p, [Math.sin(th) * 7 * bo, (1.5 + 2 * hash(i, 9, 5)) * bo, Math.cos(th) * 7 * bo]);
        const a = smoothstep(ci - 0.75, ci - 0.45, t) * (e < 1 ? 0.75 : 1) * (1 - bo);
        const col = mul(mix3(PAPER, mul(gold, 0.9), bo), 1.25 * (1 + 2.5 * decay(t, [ci], 0.1)));
        return { off: sub(p, flat), tilt, spin, scale, alpha: a, col };
      },
    });
  }

  /** BUO: dropped letter by letter into the arch, gold hot enough to bloom white */
  private buoWord(W: Words, P: GlowPoints, t: number, gold: RGB) {
    const w = this.w.buo, S = this.S.buo;
    if (t < w.start - 0.25) return;
    const k = BUO_H / EM, width = S.w * k;
    W.word(S, {
      pos: BUO_POS, right: [1, 0, 0], up: UP, height: BUO_H, col: gold,
      each: (i, u) => {
        const ci = w.c[i] ?? w.start, e = prog(t, ci - 0.2, ci, ease.inCubic), dt = t - ci;
        return {
          off: [0, 9 * (1 - e), 0],
          tilt: dt > 0 ? 0.25 * Math.sin(dt * 30) * Math.exp(-dt * 12) : 0,
          scale: 1 + 0.3 * decay(t, [ci], 0.07),
          alpha: smoothstep(ci - 0.2, ci - 0.12, t),
          col: mul(gold, 1.4 + 3 * decay(t, [ci], 0.12)),
        };
      },
    });
    for (let i = 0; i < w.c.length; i++) {
      const x = (i + 0.5) / w.c.length - 0.5;
      this.burst(P, add(BUO_POS, [x * width, -BUO_H * 0.3, 0]), w.c[i], t, 36, mul(gold, 2), 70 + i);
    }
  }
}
