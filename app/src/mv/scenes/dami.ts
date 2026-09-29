// 04 · DAMI NG TAO — A crowd of thousands to the horizon, a hunting spotlight, the self dodging at the edge (v1); recut against its inner twin (v2); lit, found and staying (v3).
//
// v1  crane up out of the crowd over the whole disc of them; the spot hunts, beat by beat;
//     on "sentro" it slams onto the empty clearing and SENTRO lands in it; on "eksena" a
//     whip pan and a long lens find the self at the rim, EKSENA hung behind them, and the
//     spot comes for them; they step out of it.
// v2  the same camera smash-cut on the downbeats between the crowd and LOOB's twin of it
//     (a firefly where each person stands, over the sea, the self's light at the centre).
// v3  dawn; fireflies leak out of the self, who now stands in the clearing; the spot
//     hunts, lands on them on "sentro", warms to gold, and they stay: the first orbit.
//
// The lines, every word: slammed into the crowd round the clearing as the crane climbs,
// laid flat on the crowd under the search, and set beside SENTRO; in v2 held at the same
// place on screen through the smash cuts, in LABAS's paper or LOOB's gold by the world.

import type { RT } from '../../engine/gl';
import type { Line, Word } from '../../engine/lyrics';
import { Lyrics } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, fbm1, hash, lerp, prog, smoothstep, TAU, window01 } from '../../engine/util';
import { basis, cam, handheld, orbit, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { add, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import type { WordShape } from '../../engine/3d/words';
import { bars, impact, mergePost } from './_fx';
import { lerpPose, POSE, walk, type Pose } from './_labas';
import { lightOf, GOLD } from './_self';
import {
  bigCrowd, chorusGrid, drawCrowd, drawCrowdFlies, faceR, HERO, kit, Leak, OUTW, PAPER, RIM, RIM_A, SELF_INK, smashIdx, TANG,
  tintUniforms, toFrame, type SpotLight,
} from './_dami_chorus';
import { Flies } from './_loob';
import { facing, lens, LyricTrack, TONE, VOICE, type LineOpts, type Place } from './_lyric';
import { carry, depthOf, face, flat, others, pin, worlds } from './_dami_lyric';

const O: V3 = [0, 0, 0];
const COOL: RGB = [0.78, 0.86, 1.0];
const APEX: V3 = [-18, 72, -26];

export default class Dami extends Scene {
  maxSamples = 72;
  private w!: Record<'nahihiya' | 'dami' | 'tao' | 'ayokong' | 'sentro' | 'eksena', Word>;
  private S!: Record<'sentro' | 'eksena', WordShape>;
  private l!: { l1: Line; l2: Line };
  private track!: LyricTrack;
  private cuts: number[] = [];
  private leak?: Leak;
  private flies?: Flies;

  get v(): number {
    return this.params.v ?? 1;
  }

  async init() {
    if (this.v === 2) this.maxSamples = 36;
    chorusGrid();
    bigCrowd();
    const L = this.lyrics, c = this.params.cut;
    const l1 = L.find('Nahihiya sa dami', c - 1), l2 = L.find('Ayokong maging', c - 1);
    this.l = { l1, l2 };
    this.w = {
      nahihiya: Lyrics.word(l1, 'Nahihiya'), dami: Lyrics.word(l1, 'dami'), tao: Lyrics.word(l1, 'tao'),
      ayokong: Lyrics.word(l2, 'Ayokong'), sentro: Lyrics.word(l2, 'sentro'), eksena: Lyrics.word(l2, 'eksena'),
    };
    const W = kit.words;
    this.S = { sentro: W.shape('SENTRO', HERO), eksena: W.shape('EKSENA', HERO) };
    kit.sky; kit.self; kit.spot;
    if (this.v === 2) {
      kit.loob;
      this.cuts = [c, ...bars(this.audio, c + 0.5, this.params.next - 0.5)].map(toFrame);
    }
    if (this.v === 3) {
      this.leak = new Leak(900, 7);
      this.flies = new Flies(2600, 50, 17);
    }
    this.track = new LyricTrack(W);
    // the end of the line before, still being sung over the cut, where the last shot left it
    const [x, y, em, tone] = ([[0.34, -0.09, 0.075, TONE.labas], [0.55, -0.36, 0.1, TONE.labas], [0.14, -0.15, 0.06, TONE.lit]] as const)[this.v - 1];
    this.track.tail(L, c, { voice: VOICE.quiet, size: 1, tone, at: (_t, b) => lens(b, x, y, 3, em) });
    if (this.v === 1) this.stage1();
    else if (this.v === 2) this.stage2();
    else this.stage3();
  }

  render(f: Frame, out: RT): Post {
    return this.v === 2 ? this.v2(f, out) : this.v === 3 ? this.v3(f, out) : this.v1(f, out);
  }

  // ---------------------------------------------------------------- shared

  /** the spotlight's darting search: a new mark every beat, reached with a snap */
  private hunt(t: number, seed: number, r0 = 12, r1 = 50): V3 {
    const b = this.audio.beatAt(t), k = Math.floor(b), x = ease.outExpo(clamp((b - k) / 0.55));
    const P = (i: number): V3 => {
      const a = hash(i, seed, 1) * TAU, r = Math.sqrt(lerp(r0 * r0, r1 * r1, hash(i, seed, 2)));
      return [Math.sin(a) * r, 0, Math.cos(a) * r];
    };
    return mix3(P(k - 1), P(k), x);
  }

  private labas(out: RT, b: Basis, f: Frame, spot: SpotLight | null, o: { leak?: { at: V3; k: number }; sky?: Parameters<typeof kit.sky.draw>[2]; beam?: number; pool?: number } = {}) {
    kit.sky.draw(out, b, o.sky);
    const tu = { spot, leak: o.leak && { ...o.leak, t: f.t } };
    chorusGrid().draw(out, b, { fog: [20, 0.012], uniforms: tintUniforms({ ...tu, spot: spot && { ...spot, col: mul(spot.col, 0.5) } }) });
    drawCrowd(bigCrowd(), out, b, f.beat, { ...tu, sway: 0.045, bob: 0.025 });
    if (spot) kit.spot.draw(out, b, f.t, spot, { beam: o.beam ?? 0.09, pool: o.pool });
  }

  /** a hero word standing at `pos`, turned to the camera, letters slamming in as they're sung */
  private slam(b: Basis, s: WordShape, w: Word, t: number, pos: V3, h: number, col: RGB, a = 1, drop = 1) {
    const right = faceR(b, pos);
    let aS = 0;
    kit.words.word(s, {
      pos, right, up: [0, 1, 0], height: h, col, alpha: a,
      each: (i) => {
        const p = Lyrics.charProgress(w, i, t), e = ease.outExpo(p);
        if (t < (w.c[i] ?? w.start)) return { alpha: 0 };
        aS += smoothstep(0, 0.15, p);
        return { off: [0, (1 - e) * h * 2.2 * drop, 0], scale: lerp(1.35, 1, e), alpha: smoothstep(0, 0.15, p) };
      },
    });
    LyricTrack.mark(this.l.l2, w, b, pos, right, h, s, (a * aS) / s.glyphs.length);
  }

  /** a word bent round a circle of radius R about `c`, centred at angle `spin`, reading from outside (or from inside) */
  private ring(b: Basis, s: WordShape, wd: Word, t: number, o: { c: V3; R: number; h: number; spin: number; col: RGB; alpha?: number; rise?: number; inside?: boolean; stagger?: number }) {
    const width = (s.w * o.h) / 320, span = width / o.R;
    // letters as sung, or (`stagger`) each that long after the last, whatever the singing
    const t0 = (i: number) => (o.stagger !== undefined ? wd.start + i * o.stagger : wd.c[i] ?? wd.start);
    const cp = (i: number) => (o.stagger !== undefined ? clamp((t - t0(i)) / 0.25, 0, 1) : Lyrics.charProgress(wd, i, t));
    let aS = 0;
    kit.words.word(s, {
      pos: o.c, height: o.h, col: o.col, alpha: o.alpha ?? 1,
      each: (i, u) => {
        if (t < t0(i)) return { alpha: 0 };
        const ang = (u - 0.5) * span * 1.12 * (o.inside ? -1 : 1) + o.spin, e = ease.outExpo(cp(i));
        const p: V3 = [Math.sin(ang) * o.R - (u - 0.5) * width, (e - 1) * (o.rise ?? 1.5), Math.cos(ang) * o.R];
        aS += smoothstep(0, 0.35, e);
        return { off: p, tilt: o.inside ? Math.PI - ang : -ang, alpha: smoothstep(0, 0.35, e) };
      },
    });
    // (the audit reads the chord through the word's middle)
    const sn = Math.sin(o.spin), cs = Math.cos(o.spin), side = o.inside ? -1 : 1;
    LyricTrack.mark(this.l.l2, wd, b, add(o.c, [sn * o.R, 0, cs * o.R]), [cs * side, 0, -sn * side], o.h, s, ((o.alpha ?? 1) * aS) / s.glyphs.length);
  }

  // ---------------------------------------------------------------- v1

  /** where the camera looks, high over the hunt */
  private over1(t: number): V3 {
    return mul(add(this.hunt(t - 0.2, 11), this.hunt(t - 0.75, 11)), 0.5);
  }

  private cam1(t: number): Cam {
    const cut: number = this.params.cut, tS = this.w.sentro.start, tE = this.w.eksena.start;
    const camFn = shots(t, [
      // up out of the crowd and over all of them
      { t: cut, cam: (t) => {
        const k = prog(t, cut - 0.9, 46.4, ease.inOutSine), a = 0.35 + 1.25 * k;
        const d = lerp(24, 72, k), h = lerp(1.62, 50, k ** 1.25);
        return cam([Math.sin(a) * d, h, Math.cos(a) * d], [0, lerp(1.45, -2, k), 0], lerp(44, 50, k));
      } },
      // high over the hunt
      { t: toFrame(46.102), cam: (t) => {
        const k = prog(t, 46.1, tS, ease.linear), c = this.over1(t);
        return cam(add(c, [14 - 5 * k, 30 - 4 * k, 24 - 5 * k]), c, 48);
      } },
      // "sentro": down into the clearing, low, looking up at the word
      { t: toFrame(tS), snap: 0.3, kick: 0.06, cam: (t) => {
        const k = prog(t, tS, tE, ease.outSine);
        return cam([7.6 - 1.2 * k, 0.8 + 0.25 * k, 6.4 - 1.4 * k], [0, 1.9, 0], 38 - 3 * k);
      } },
      // "eksena": whip out along the crowd, a long lens on the self at the rim
      { t: toFrame(tE), snap: 0.34, mode: 'pan', kick: 0.05, cam: (t) => {
        const k = prog(t, tE, 51.95, ease.linear);
        const p = add(madd(mul(OUTW, 26), TANG, 1.6 - 0.9 * k), [0, 3.6, 0]);
        return cam(p, add(madd(RIM, TANG, 1.1 + 0.3 * k), [0, 1.35, 0]), lerp(6.2, 5.5, k));
      } },
    ]);
    return handheld(camFn, t, t < 46.1 ? 0.004 : 0.006, 0.7, 4);
  }

  private stage1() {
    const T = this.track, { l1, l2 } = this.l, tS = this.w.sentro.start;
    const B = (t: number) => basis(this.cam1(t));
    const loud = { voice: VOICE.loud, size: 1, layout: 'slam' as const, tone: TONE.labas };
    // a word stood in the crowd at `at` where the lens saw screen x, y at tr, turned to the camera
    const stood = (line: Line, word: string, tr: number, x: number, y: number, frac: number, at: V3 = O, o: Partial<LineOpts> = {}) => {
      const b = B(tr), P = pin(b, x, y, depthOf(b, at), frac);
      T.add(line, { ...loud, ...o, skip: others(line, word), at: (_t, b) => facing(b, P.pos, P.size) });
    };
    // "Nahihiya sa dami ng tao": slammed in round the clearing as the crane climbs, bigger as it pulls away
    stood(l1, 'Nahihiya', 42.0, 0, 0.22, 0.13);
    stood(l1, 'sa', 43.8, -0.34, 0.14, 0.14);
    stood(l1, 'dami', 44.05, 0.1, 0.08, 0.2);
    stood(l1, 'ng', 44.9, -0.3, -0.06, 0.14);
    stood(l1, 'tao', 45.3, 0.04, 0.02, 0.28, O, { out: toFrame(46.102) - 0.01 });
    // "Ayokong maging": flat on the crowd under the search, held where the camera looks
    T.add(l2, {
      voice: VOICE.loud, size: 4.2, layout: 'stack', enter: 'slam', spread: 0, tone: TONE.labas, skip: others(l2, 'Ayokong', 'maging'),
      out: tS - 0.02, exit: 'burst', exitDur: 0.12, at: (t, b) => flat(b, add(this.over1(t), [0, 1.8, 0])),
    });
    // "ng": off the end of SENTRO over the crowd's horizon, gone on the whip to EKSENA
    stood(l2, 'ng', 49.05, 0.8, -0.02, 0.085, [0, 1.55, 0]);
  }

  private v1(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, w = this.w;
    const tS = w.sentro.start, tE = w.eksena.start;

    // the spot: hunting, then slammed onto the clearing, then sent after the self
    const SIDE = madd(RIM, TANG, -7);
    let tgt = this.hunt(t, 11);
    tgt = mix3(tgt, O, prog(t, tS, tS + 0.3, ease.outExpo));
    tgt = mix3(tgt, SIDE, prog(t, tE + 0.35, tE + 0.7, ease.outExpo));
    tgt = mix3(tgt, RIM, prog(t, tE + 0.8, tE + 1.1, ease.outExpo));
    const r = lerp(lerp(3.4, 5.2, prog(t, tS, tS + 0.3)), 2.0, prog(t, tE + 0.35, tE + 0.7));
    const on = 1.3 * (1 - 0.35 * prog(t, 51.3, 51.9));
    const spot: SpotLight = { apex: APEX, tgt, r, col: mul(COOL, on) };

    // the self: at the rim facing in, stepping sideways out of the light
    const dodge = prog(t, tE + 0.95, tE + 1.5, ease.inOutCubic);
    const pos = madd(RIM, TANG, dodge * 3.2);
    const pose: Pose = lerpPose(POSE.shy, walk(dodge * 1.6, 0.55), Math.sin(Math.PI * dodge));
    const yaw = RIM_A + Math.PI;

    const b = basis(this.cam1(t));

    this.labas(out, b, f, spot);
    kit.self.draw(out, b, t, { pos, yaw, pose, col: SELF_INK, light: lightOf(this.liwanag(t)) }, { fog: [30, 0.006] });

    const W = kit.words.clear();
    if (t < tE + 0.4) this.slam(b, this.S.sentro, w.sentro, t, [0, 1.55, 0], 2.0, PAPER, 1 - prog(t, tE, tE + 0.3));
    if (t >= tE) {
      const a = window01(t, tE, 51.95, 0.05, 0.5);
      this.slam(b, this.S.eksena, w.eksena, t, add(madd(RIM, OUTW, 26), [0, 3.5, 0]), 3.4, mul(PAPER, 0.8), a * 0.9, 0.35);
    }
    this.track.draw(t, b);
    W.draw(out, b);

    return mergePost(
      { bloom: 0.8, grain: 0.04, vignette: 0.38 },
      impact(t, [cut], { flash: 0.35, ca: 1, shake: 14 }),
      impact(t, [toFrame(tS)], { flash: 0.03, ca: 0.5, shake: 6, tau: 0.18, seed: 3 }),
    );
  }

  // ---------------------------------------------------------------- v2

  /** where the crane looks: over the search, then down onto the clearing with the light */
  private over2(t: number): V3 {
    const tS = this.w.sentro.start;
    return mix3(mul(add(this.hunt(t - 0.2, 23, 8, 24), this.hunt(t - 0.75, 23, 8, 24)), 0.35), O, prog(t, tS - 0.05, tS + 0.25, ease.outCubic));
  }

  private cam2(t: number): Cam {
    const cut: number = this.params.cut, cuts = this.cuts, tS = this.w.sentro.start;
    const seg = smashIdx(t, cuts);
    // one camera across each OUT / IN pair, so every smash is the same move in the other world
    const c1 = cuts[2], c3 = cuts[4];
    const lane = (t: number): Cam => {
      const k = prog(t, cut - 0.4, c1 + 0.2, ease.inOutSine), a = 0.95 + 0.08 * Math.sin(t * 1.7);
      const r = lerp(80, 17, k), side = Math.sin(t * 2.3) * 0.9;
      const p: V3 = [Math.sin(a) * r + Math.cos(a) * side, 2.35 + 0.12 * Math.sin(t * 5.1), Math.cos(a) * r - Math.sin(a) * side];
      return cam(p, [0, 1.1, 0], 52 - 8 * k);
    };
    // up off the crowd over the search; on "sentro" it drops onto the clearing with the light
    const crane = (t: number): Cam => {
      const k = prog(t, c1, tS, ease.outExpo), d = prog(t, tS, tS + 0.3, ease.outExpo);
      const c = this.over2(t);
      const off: V3 = [lerp(3, 10, k), lerp(2.6, 34, k), lerp(6, 17, k)];
      return cam(add(c, mix3(off, [4.5, 9, 7.5], d)), c, lerp(50, 46, d));
    };
    const whirl = (t: number): Cam => orbit([0, 1.5, 0], 0.4 + (t - cuts[3]) * 0.9, 0.16, 10 - 2.2 * prog(t, cuts[3], c3), 42);
    const tele = (t: number): Cam => {
      const k = prog(t, c3, this.params.next);
      // from outside, the self in front of the wall of them
      const p = add(madd(madd(RIM, OUTW, 38), TANG, -6 + 3 * k), [0, 1.7, 0]);
      return cam(p, add(madd(RIM, TANG, -0.4 + 0.6 * k), [0, 1.35, 0]), 8.5);
    };
    const cf = seg <= 1 ? lane(t) : seg === 2 ? crane(t) : seg === 3 ? whirl(t) : tele(t);
    return handheld(cf, t, 0.005, 0.8, 9);
  }

  private stage2() {
    const T = this.track, { l1, l2 } = this.l, w = this.w, cuts = this.cuts, tS = w.sentro.start;
    const inner = (t: number) => smashIdx(t, cuts) % 2 === 1;
    const loud = { voice: VOICE.loud, size: 1, layout: 'slam' as const };
    const e1 = worlds(l1, inner), e2 = worlds(l2, inner);
    // "Nahihiya": ahead on the lane, flown at through the first smash and through (thinning as it fills the frame)
    const thru = w.nahihiya.end;
    T.add(l1, {
      ...loud, skip: others(l1, 'Nahihiya'), each: (k, i, u, t) => ({ ...e1(k, i, u, t), alpha: 1 - prog(t, thru + 0.05, thru + 0.3) }), at: (t) => {
        const a = 0.95 + 0.08 * Math.sin(t * 1.7), side = Math.sin(t * 2.3) * 0.9, r = 40;
        return { pos: [Math.sin(a) * r + Math.cos(a) * side, 2.9, Math.cos(a) * r - Math.sin(a) * side], right: [Math.cos(a), 0, -Math.sin(a)], size: 2.3 };
      },
    });
    // "sa dami ng tao": slammed over the self's light, each bigger as the lane closes on it;
    // "tao" held on screen through the smash up into the crane
    const C: V3 = [0, 4.4, 0];
    const b0 = basis(this.cam2(cuts[2] - 1e-3)), P0 = facing(b0, C, 4.4);
    const over = (word: string, size: number, o: Partial<LineOpts> = {}) =>
      T.add(l1, { ...loud, ...o, skip: others(l1, word), each: e1, at: (t, b) => (t < cuts[2] ? facing(b, C, size) : carry(P0, b0, b)) });
    over('sa', 3.0);
    over('dami', 4.0);
    over('ng', 3.0);
    over('tao', 4.4, { out: w.tao.end + 0.02 });
    // "Ayokong maging": flat on the crowd above where the crane looks, gone as it drops
    T.add(l2, {
      voice: VOICE.loud, size: 3.2, layout: 'stack', enter: 'slam', spread: 0, skip: others(l2, 'Ayokong', 'maging'), each: e2,
      out: tS - 0.03, exit: 'burst', exitDur: 0.1, at: (t, b) => {
        const c = this.over2(t), d = norm([b.pos[0] - c[0], 0, b.pos[2] - c[2]]);
        return flat(b, add(madd(c, d, -4.5), [0, 1.9, 0]));
      },
    });
    // "ng": after the gold SENTRO, on its line
    const sEm = this.S.sentro.w / this.S.sentro.r, nEm = kit.words.shape('NG', VOICE.loud.font, VOICE.loud.raster).w / VOICE.loud.raster;
    T.add(l2, {
      ...loud, size: 1.0, skip: others(l2, 'ng'), each: e2,
      at: (_t, b) => facing(b, madd([0, 3.3, 0], faceR(b, O), (sEm * 1.5) / 2 + 0.45 + nEm / 2)),
    });
  }

  private v2(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, w = this.w, l2 = this.l.l2;
    const tS = w.sentro.start, tE = w.eksena.start;
    const cuts = this.cuts;
    const seg = smashIdx(t, cuts), inner = seg % 2 === 1;
    const light = lightOf(this.liwanag(t));
    const c3 = cuts[4];
    const b = basis(this.cam2(t));

    let spot: SpotLight | null = null;
    if (seg === 2) spot = { apex: APEX, tgt: mix3(this.hunt(t, 23, 8, 24), O, prog(t, tS, tS + 0.3, ease.outExpo)), r: tS <= t ? 4.4 : 3.4, col: mul(COOL, 1.3) };
    if (seg === 4) {
      const sweep = prog(t, c3 + 0.25, this.params.next - 0.1, ease.inOutSine);
      spot = { apex: APEX, tgt: madd(RIM, TANG, lerp(-9, 5, sweep)), r: 2.2, col: mul(COOL, 1.3) };
    }

    const W = kit.words.clear();
    let depth: RT | undefined;
    if (!inner) {
      this.labas(out, b, f, spot, { pool: seg === 2 ? 0.22 : 0.3 });
      if (seg === 4) {
        // the light passes over them: they fold down out of it
        const dx = lerp(-9, 5, prog(t, c3 + 0.25, this.params.next - 0.1, ease.inOutSine));
        const duck = smoothstep(-3.5, -0.6, dx);
        const pose = lerpPose(POSE.shy, POSE.hug, duck);
        kit.self.draw(out, b, t, { pos: RIM, yaw: RIM_A + 0.5 - duck * 0.3, pose, col: SELF_INK, light }, { fog: [30, 0.006] });
        const pos = add(madd(RIM, OUTW, -22), [0, 3.3, 0]), right = faceR(b, RIM), a = window01(t, c3, this.params.next, 0.04, 0.3);
        let aS = 0;
        W.word(this.S.eksena, {
          pos, right, up: [0, 1, 0], height: 2.1, col: mul(PAPER, 0.85), alpha: a,
          each: (i) => {
            const on = t >= w.eksena.c[i] ? 1 : 0;
            aS += on;
            return { tilt: (1 - ease.outExpo(Lyrics.charProgress(w.eksena, i, t))) * 1.4, alpha: on };
          },
        });
        LyricTrack.mark(l2, w.eksena, b, pos, right, 2.1, this.S.eksena, (a * aS) / this.S.eksena.glyphs.length);
      }
      if (seg === 2 && t >= tS - 0.05) {
        // SENTRO flat on the ground in the pool, each letter flipping up as it's sung
        const right = faceR(b, O), up = norm(sub([b.pos[0], 0, b.pos[2]], O)).map((x) => -x) as V3;
        let aS = 0;
        W.word(this.S.sentro, {
          pos: [0, 0.05, 0], right, up, height: 4.2, col: PAPER,
          each: (i) => {
            const e = ease.outBack(Lyrics.charProgress(w.sentro, i, t)), on = t >= w.sentro.c[i] ? 1 : 0;
            aS += on;
            return { alpha: on, off: [0, e * 0.9, 0], scale: lerp(1.6, 1, e) };
          },
        });
        LyricTrack.mark(l2, w.sentro, b, [0, 0.95, 0], right, 4.2, this.S.sentro, aS / this.S.sentro.glyphs.length, up);
      }
    } else {
      depth = this.rt(0);
      const glow: V3 = [0, 1.3, 0];
      kit.loob.draw(out, depth, b, t, { wave: 0.45, isles: 0.3, isleY: 42, lum: 0.9, haze: 0.004, glow, glowI: light * 1.6, glowR: 0.1, steps: 80 });
      drawCrowdFlies(out, b, t, { depth, swirl: seg === 3 ? (t - cuts[3]) * 0.9 : 0, centre: O, lift: seg === 3 ? 0.25 * (t - cuts[3]) : 0 });
      kit.self.draw(out, b, t, { pos: [0, 0, 0], noBody: true, light: light * 2.2, scale: 1.6 }, { depth });
      if (seg === 3) {
        if (t < w.sentro.end + 0.4) {
          const a = 1 - prog(t, w.sentro.end, w.sentro.end + 0.4), right = faceR(b, O);
          W.word(this.S.sentro, { pos: [0, 3.3, 0], right, height: 1.5, col: mul(GOLD, 1.6), alpha: a });
          LyricTrack.mark(l2, w.sentro, b, [0, 3.3, 0], right, 1.5, this.S.sentro, a);
        }
        if (t >= tE - 0.05)
          // EKSENA ringed round the light, turning with the fireflies
          this.ring(b, this.S.eksena, w.eksena, t, { c: [0, 2.2, 0], R: 4.2, h: 1.4, spin: 0.4 + (t - cuts[3]) * 0.9 + 0.2, col: mul(GOLD, 1.4), rise: 2 });
      }
    }
    this.track.draw(t, b);
    W.draw(out, b, { depth });

    return mergePost(
      { bloom: inner ? 0.95 : 0.8, grain: 0.04, vignette: inner ? 0.32 : 0.38 },
      impact(t, [cut], { flash: 0.35, ca: 1, shake: 14 }),
      impact(t, cuts.slice(1), { flash: 0.03, ca: 0.7, shake: 9, tau: 0.18, seed: 5 }),
    );
  }

  // ---------------------------------------------------------------- v3

  /** the self in the clearing: shy until the light lands, then straightening, staying */
  private found3(t: number) {
    const found = prog(t, this.w.sentro.start + 0.25, this.w.sentro.start + 1.4, ease.inOutCubic);
    const pose = lerpPose(POSE.shy, POSE.stand, found), yaw = 0.6 + 0.4 * found;
    return { found, pose, yaw, chest: kit.self.chest({ pos: O, yaw, pose }) };
  }

  private orbitYaw3(t: number) {
    const tS = this.w.sentro.start;
    return 0.9 + (t - tS) * 0.45 + 0.05 * (t - tS) ** 2;
  }

  private r13(t: number) {
    return lerp(46, 14, prog(t, toFrame(172.677), this.w.sentro.start));
  }

  /** where the camera looks, high over the search */
  private over3(t: number): V3 {
    return mix3(this.hunt(t - 0.3, 31, 6, this.r13(t)), O, 0.35);
  }

  private cam3(t: number): Cam {
    const cut: number = this.params.cut, next: number = this.params.next;
    const tS = this.w.sentro.start, t1 = toFrame(172.677), chest = this.found3(t).chest;
    const camFn = shots(t, [
      // close on them, then up and away over the dawn crowd as the light leaks out
      { t: cut, cam: (t) => {
        const k = prog(t, cut - 0.3, t1 + 0.4, ease.inOutCubic), a = 0.6 + 1.5 * k;
        const d = lerp(3.4, 62, k), h = lerp(0.8, 40, k ** 1.3);
        return cam([Math.sin(a) * d, h, Math.cos(a) * d], mix3(add(chest, [0, 0.2, 0]), [0, -3, 0], k), lerp(40, 50, k));
      } },
      // high over the search
      { t: t1, cam: (t) => {
        const c = this.over3(t);
        return cam(add(c, [18, 34, 20]), c, 44);
      } },
      // found: straight down into the first orbit round them
      { t: toFrame(tS + 0.12), snap: 0.45, kick: 0.07, cam: (t) =>
        // low, looking up: their head and the light above the crowd's horizon, in the dawn
        orbit([0, 1.3, 0], this.orbitYaw3(t), -0.12 + 0.03 * Math.sin(t * 0.7), lerp(5.4, 3.8, prog(t, tS, next, ease.outSine)), 40) },
    ]);
    return handheld(camFn, t, 0.004, 0.6, 12);
  }

  private stage3() {
    const T = this.track, { l1, l2 } = this.l, w = this.w, tS = w.sentro.start, t1 = toFrame(172.677);
    const B = (t: number) => basis(this.cam3(t));
    const lit = { voice: VOICE.loud, size: 1, tone: TONE.lit };
    // grown as the camera leaves it (by the `g` power of how much further it is), so it goes
    // up and away with the light more slowly than the crowd does
    const grow = (b: Basis, P: Place, d0: number, g: number) => Math.max(1, depthOf(b, P.pos) / d0) ** g * (P.size ?? 1);
    // "Nahihiya": beside them, close, left behind as the camera goes up and away
    {
      const b = B(169.1), P = pin(b, -0.46, 0.3, depthOf(b, [0, 1.2, 0]), 0.12), d0 = depthOf(b, P.pos);
      T.add(l1, { ...lit, layout: 'slam', skip: others(l1, 'Nahihiya'), at: (_t, b) => facing(b, P.pos, grow(b, P, d0, 0.8)) });
    }
    // "sa dami ng tao": one row stood over the clearing for the whole crowd, held on screen into the search
    {
      const b = B(171.7), P = pin(b, 0, 0.2, depthOf(b, O), 0.11), d0 = depthOf(b, P.pos);
      const b0 = B(t1 - 1e-3), P0 = face(b0, P.pos, grow(b0, P, d0, 0.5));
      T.add(l1, {
        ...lit, layout: 'flow', wrap: 30, enter: 'slam', spread: 0, skip: ['Nahihiya'], out: w.tao.end + 0.08, exit: 'scatter', exitDur: 0.4,
        at: (t, b) => (t < t1 ? face(b, P.pos, grow(b, P, d0, 0.5)) : carry(P0, b0, b)),
      });
    }
    // "Ayokong maging": flat on the crowd where the camera looks, gone before the dive into the orbit
    T.add(l2, {
      ...lit, size: 5, layout: 'stack', enter: 'slam', spread: 0, skip: others(l2, 'Ayokong', 'maging'),
      out: tS - 0.02, exit: 'burst', exitDur: 0.12, at: (t, b) => flat(b, add(this.over3(t), [0, 1.8, 0])),
    });
    // "ng": at their side in the orbit, between SENTRO and EKSENA
    T.add(l2, {
      ...lit, layout: 'slam', size: 0.36, skip: others(l2, 'ng'),
      at: (_t, b) => facing(b, madd([0, 1.35, 0], faceR(b, O), 1.15)),
    });
  }

  private v3(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next, w = this.w;
    const tS = w.sentro.start, tE = w.eksena.start;
    const liw = this.liwanag(t), light = lightOf(liw);
    const { found, pose, yaw, chest } = this.found3(t);

    // the spot circles in, finds them and turns gold
    const land = prog(t, tS, tS + 0.3, ease.outExpo);
    const tgt = mix3(this.hunt(t, 31, 6, this.r13(t)), O, land);
    const warm = prog(t, tS + 0.1, tS + 0.9, ease.inOutSine);
    const spot: SpotLight = { apex: APEX, tgt, r: lerp(3.4, 2.6, land), col: mix3(mul(COOL, 1.25), mul(GOLD, 1.5), warm) };

    const b = basis(this.cam3(t));

    const leakK = lerp(0.4, 1.2, prog(t, cut, next));
    const sky = {
      top: mul(lin('slate'), 0.28), hor: mix3(mul(lin('slate'), 0.45), mul(lin('dawn'), 0.4), 0.6), ground: mul(lin('ink'), 1.2),
      band: 0.9, warm: 0.35 + 0.3 * liw, warmDir: [0.5, 0.06, -1] as V3, warmCol: lin('dawn'),
    };
    this.labas(out, b, f, spot, { leak: { at: chest, k: leakK }, sky, beam: 0.08, pool: 0.26 });
    this.flies!.draw(out, b, { t, centre: b.pos, density: lerp(0.04, 0.2, prog(t, cut, next)), rise: 0.3, fog: [25, 0.02], nearFade: 2.5 });
    kit.self.draw(out, b, t, { pos: O, yaw, pose, col: mix3(SELF_INK, mul(GOLD, 0.8), found * 0.5), w: 2, light: light * (1 + 0.3 * warm) }, { fog: [30, 0.006] });
    this.leak!.draw(out, b, t, { src: chest, k: lerp(0.25, 1, prog(t, cut, next)), life: 7, spread: lerp(6, 11, prog(t, cut, next)) });

    // SENTRO rises in a ring round their feet
    const W = kit.words.clear();
    const col = mix3(PAPER, mul(GOLD, 1.3), 0.6);
    const oy = this.orbitYaw3(t);
    if (t >= tS && t < tE) this.ring(b, this.S.sentro, w.sentro, t, { c: [0, 0.45, 0], R: 1.9, h: 0.6, spin: oy - 0.15 - (t - tS) * 0.1, col, alpha: 1 - prog(t, tE - 0.4, tE), rise: 0.8 });
    // EKSENA behind them, on the far side of the same ring, read from where we are
    if (t >= tE - 0.05) this.ring(b, this.S.eksena, w.eksena, t, { c: [0, 2.1, 0], R: 2.6, h: 0.8, spin: oy + Math.PI - 0.1 + (t - tE) * 0.12, col, alpha: window01(t, tE, next + 1, 0.05, 0.3), rise: -0.8, inside: true, stagger: 0.035 });
    this.track.draw(t, b);
    W.draw(out, b);

    return mergePost(
      { bloom: 0.85, grain: 0.04, vignette: 0.34 },
      impact(t, [cut], { flash: 0.35, ca: 1, shake: 14 }),
      impact(t, [toFrame(tS)], { flash: 0.05, ca: 0.5, shake: 7, tau: 0.18, seed: 7 }),
    );
  }
}
