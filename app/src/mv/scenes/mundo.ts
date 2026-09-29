// SARILING MUNDO — "Pero kahit ’di ako sumisigaw / May sarili rin akong mundo", twice.
// I (07): LABAS, plain. A loud crowd, a level meter over every head; the self at its edge,
// turned away, a gauge beside it reading 0.00 through "sumisigaw". The camera crashes into
// the light in its chest, the frame fills with gold, and on "May sarili rin" it bursts out
// into LOOB: sea, islands, thousands of rising fireflies, and the flies of the self's own
// light pour out and settle into MUNDO. Crane up (CONT to BULSA).
// II (13): out of the gold (DIVE from NOON), the self at cosmic scale: fireflies rising off
// the sea assemble a constellation of it. A corkscrew out, an orbit, a corkscrew back in
// through its chest star on "mundo", and a fall out the far side towards the self on the
// sea as MUNDO forms over it (CONT to HAKBANG: the shared layout is in _mundo_cosmos).

import { mono, sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics, type Word } from '../../engine/lyrics';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, frameIdx, hash, keys, lerp, noise1, prog, spring, TAU } from '../../engine/util';
import { basis, cam, handheld, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, dist, madd, mix3, mul, norm, sph, sub, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { decay, DIVE_COL, diveIn, diveOut, Fill, impact, mergePost, towardDive } from './_fx';
import { Crowd, figure, groundGrid, INK, LABAS_FOG, POSE, scatter, Sky, toWorld } from './_labas';
import { Flies, Loob } from './_loob';
import {
  CHEST, CON, CON_POSE, Handover, HERO, mundoK, SELF_POS, SELF_POSE, SELF_YAW, tailCam, tailLoob, tailTimes, type Tail,
} from './_mundo_cosmos';
import { figureStars, Swarm, toFrame, wordPoints } from './_mundo_fx';
import { EMBER, GOLD, lightOf, Self } from './_self';

let sky: Sky | null = null, loob: Loob | null = null, self: Self | null = null, fill: Fill | null = null;

const FLY = mul(GOLD, 2.2), FLY_E = mul(EMBER, 2.2);
/** the self and its dial: a touch brighter than the crowd's ash */
const SELF_INK = mul(lin('ash'), 1.45), HOT = mul(lin('paper'), 1.1);
const POST: Post = { bloom: 0.9, grain: 0.035, vignette: 0.3 };

// ---- I, LABAS: the self at the crowd's edge, facing away from it
const S: V3 = [0, 0, 0];
const S_YAW = -Math.PI / 2 + 0.45;
const S_POSE = POSE.shy;
const CROWD_C: V3 = [6.5, 0, -3];
/** the push-in looks at the self from here (a unit direction off its chest) */
const D2 = norm([-0.78, 0.12, 0.62]);
/** the gauge: beside the head, square to the push-in */
const GR = norm([0.62, 0, 0.78]);
const PG: V3 = madd(madd(add(S, [0, 1.72, 0]), GR, 0.95), D2, 0.25);
const G_A0 = (160 * Math.PI) / 180, G_A1 = (20 * Math.PI) / 180, G_RAD = 0.5;
/** what the gauge shows once the camera is inside: noise, then pinned */
const SCRAMBLE = ['0.00', '0.41', '2.17', '0.93', '5.60', '3.08', '7.74', '6.29', '8.85', '9.12', '9.99', '9.47'];

// ---- I, LOOB: the light, and MUNDO over the sea ahead of it
const G: V3 = [0, 3.4, 0];
const W1: V3 = [0, 11.5, -42];
const W1_EM = 12;
const LOOB_I = { isleY: 26, steps: 80 };

// ---- II
/** the constellation's middle, framed at the end of the pull-back */
const FC: V3 = add(CON.pos, [0, 88, 0]);

export default class Mundo extends Scene {
  maxSamples = 36;
  private W = new Words();
  private shapes = new Map<string, WordShape>();
  // I
  private grid!: LineBatch;
  private crowd!: Crowd;
  private heads: V3[] = [];
  private meters = new LineBatch(600);
  private gauge = new LineBatch(200);
  private flies!: Flies;
  private word1!: Swarm;
  // II
  private con!: Swarm;
  private conLines!: LineBatch;
  private hand!: Handover;

  private T1 = { cut: 0, next: 0, ako: 0, burst: 0, crash: 0, crane: 0, mundo: null as unknown as Word };
  private T2 = { cut: 0, next: 0, may: 0, tail: null as unknown as Tail };

  private shape(text: string, f = HERO) {
    const k = text + '|' + f.family + f.weight;
    if (!this.shapes.has(k)) this.shapes.set(k, this.W.shape(text, f));
    return this.shapes.get(k)!;
  }

  async init() {
    self ??= new Self();
    fill ??= new Fill();
    loob ??= new Loob();
    const L = this.lyrics, cut: number = this.params.cut, next: number = this.params.next;
    if (this.params.v === 2) {
      this.T2 = { cut, next, may: Lyrics.word(L.find('May sarili rin', 138), 'May').start, tail: tailTimes(L, this.audio) };
      this.buildConstellation();
      this.hand = new Handover();
      return;
    }
    const k1 = L.find('Pero kahit'), m1 = L.find('May sarili rin');
    const burst = toFrame(Lyrics.word(m1, 'May').start), mundo = Lyrics.word(m1, 'mundo');
    this.T1 = { cut, next, ako: Lyrics.word(k1, 'ako').start, burst, crash: burst - 0.55, crane: mundo.end + 0.05, mundo };

    sky ??= new Sky();
    this.grid = new LineBatch(12000);
    groundGrid(this.grid, { extent: 90 });
    const members = scatter(40, {
      centre: CROWD_C, r0: 0.5, r1: 7.5, gap: [-1.14, 0.5], seed: 7,
      poses: [POSE.cheer, POSE.talk, POSE.laugh, POSE.cheer, POSE.talk],
    });
    this.crowd = new Crowd(members, { seed: 7 });
    this.heads = members.map((m) => toWorld(m, figure(m.pose ?? POSE.stand).head));
    for (let i = 50; i <= 100; i++) this.shape((i / 100).toFixed(2), mono(10, 500));
    for (const s of SCRAMBLE) this.shape(s);
    this.shape('SIGAW', mono(10, 500, false, 2));

    this.flies = new Flies(6000, 70, 7);
    this.word1 = new Swarm(2600);
    wordPoints('MUNDO', HERO, 2500, 5).pts.forEach((q, i) =>
      this.word1.add(q.p, q.g, -0.06 - 0.05 * hash(i, 5, 5), hash(i, 5, 6) < 0.2 ? FLY_E : FLY, 0.7 + 0.5 * hash(i, 5, 7), 5, i),
    );
  }

  render(f: Frame, out: RT): Post {
    if (this.params.v === 2) return this.two(f, out);
    return toFrame(f.t) < this.T1.burst ? this.labas(f, out) : this.inside(f, out);
  }

  // ================================================================ I, LABAS

  private chest1() {
    return self!.chest({ pos: S, yaw: S_YAW, pose: S_POSE });
  }

  private push(t: number): Cam {
    const T = this.T1, c = this.chest1();
    const k = prog(t, T.ako, T.crash, ease.inOutSine);
    const tgt = mix3(c, PG, lerp(0.45, 0.3, k));
    return cam(madd(tgt, D2, lerp(4.2, 2.6, k)), tgt, 38);
  }

  private camLabas(t: number): Cam {
    const T = this.T1;
    if (t < T.crash)
      return handheld(
        shots(t, [
          {
            // along the front of the crowd, their meters jumping, to the one at the edge
            t: T.cut,
            cam: (t) => {
              const k = prog(t, T.cut, T.ako + 0.4);
              return cam(mix3([15.5, 1.45, 11.5], [5.2, 1.5, 9.4], ease.inOutSine(k)), mix3([9, 1.7, -3], [1.2, 1.3, -0.2], ease.inOutSine(k)), 38);
            },
          },
          { t: T.ako, snap: 0.38, mode: 'pan', kick: 0.06, cam: (t) => this.push(t) },
        ]),
        t, 0.003, 0.7, 1,
      );
    // the crash: straight down the line into the light, the lens widening, faster and faster
    const c = this.chest1(), c0 = this.push(T.crash);
    const u = clamp((t - T.crash) / (T.burst - T.crash)), e = ease.inCubic(u);
    const d0 = dist(c0.pos, c), dir = norm(sub(c0.pos, c));
    const d = d0 * Math.pow(0.04 / d0, e);
    const tgt = mix3(c0.tgt, c, ease.outCubic(clamp(u / 0.4)));
    return handheld(cam(madd(c, dir, d), tgt, lerp(38, 62, e), 0.18 * e), t, 0.004 + 0.02 * e, 1.4, 1);
  }

  private labas(f: Frame, out: RT): Post {
    const t = f.t, T = this.T1;
    const b = basis(this.camLabas(t));
    const crash = prog(t, T.crash, T.burst, ease.inCubic);
    sky!.draw(out, b);
    this.grid.draw(out, b, { fog: LABAS_FOG });
    this.crowd.draw(out, b, { beat: f.beat, sway: 0.07, bob: 0.04 });
    this.drawMeters(out, b, t);
    const light = lightOf(this.liwanag(t)) * (1 + 6 * crash);
    self!.draw(out, b, t, { pos: S, yaw: S_YAW, pose: S_POSE, light, col: SELF_INK, w: 1.3 }, { fog: LABAS_FOG, nearFade: 0.25 });
    this.drawGauge(out, b, t, crash);
    const k = diveOut(t, T.burst, 0.45);
    fill!.draw(out, DIVE_COL, k, 'over');
    return towardDive(mergePost(POST, { ca: 0.5 * crash }), k);
  }

  /** everyone else's level: a bar over each head, jumping with the song */
  private drawMeters(out: RT, b: Basis, t: number) {
    const M = this.meters.clear(), rms = this.audio.env('rms', t);
    const frame = mul(INK.line, 1.1), bar = mul(INK.line, 1.3);
    this.W.clear();
    this.heads.forEach((h, i) => {
      const lv = clamp(0.4 + 0.55 * rms + 0.3 * noise1(t * 5.3 + i * 3.7, i) + 0.15 * noise1(t * 13 + i, i + 50));
      const c = add(h, [0, 0.55, 0]), R = mul(b.R, 0.045), U: V3 = [0, 0.25, 0];
      const P = (x: number, y: number) => madd(madd(c, R, x), U, y);
      M.poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], 1, frame, 0.8, true);
      M.seg(P(0, -0.92), P(0, -0.92 + 1.84 * lv), -0.06, bar, 0.9);
      // the nearest read out loud
      if (i % 3 === 0) {
        const s = this.shape((Math.round(50 + 50 * lv) / 100).toFixed(2), mono(10, 500));
        this.W.word(s, { pos: add(c, [0, 0.36, 0]), right: b.R, up: [0, 1, 0], height: 0.11, col: INK.line, alpha: 0.85 });
      }
    });
    M.draw(out, b, { fog: LABAS_FOG });
    this.W.draw(out, b, { blend: 'add' });
  }

  /** the self's own level: a dial that reads nothing, until the camera is inside */
  private drawGauge(out: RT, b: Basis, t: number, crash: number) {
    const T = this.T1, L = this.gauge.clear();
    const U: V3 = [0, 1, 0];
    const P = (a: number, r: number): V3 => madd(madd(PG, GR, Math.cos(a) * r), U, Math.sin(a) * r);
    const col = mul(INK.line, 1.4), hot = HOT;
    const arc: V3[] = [];
    for (let i = 0; i <= 32; i++) arc.push(P(lerp(G_A0, G_A1, i / 32), G_RAD));
    L.poly(arc, 1.3, col, 0.9);
    const red: V3[] = [];
    for (let i = 0; i <= 8; i++) red.push(P(lerp(G_A0, G_A1, 0.8 + (0.2 * i) / 8), G_RAD + 0.035));
    L.poly(red, 2.2, col, 0.7);
    for (let i = 0; i <= 10; i++) {
      const a = lerp(G_A0, G_A1, i / 10), maj = i % 5 === 0;
      L.seg(P(a, G_RAD - (maj ? 0.1 : 0.055)), P(a, G_RAD), maj ? 1.5 : 1, col, maj ? 0.9 : 0.6);
    }
    // the housing
    const B = (x: number, y: number) => madd(madd(PG, GR, x), U, y);
    L.poly([B(-0.64, -0.3), B(0.64, -0.3), B(0.64, 0.64), B(-0.64, 0.64)], 1, INK.line, 0.3, true);
    // the needle: a tremble at zero, then slammed past the end as the camera goes in
    const hit = T.crash + 0.08;
    const v = t < hit ? 0.004 + 0.004 * noise1(t * 11, 3) : Math.min(1.06, spring(t, hit, 2.4, 0.3) * 1.02) + 0.02 * noise1(t * 30, 4);
    const an = lerp(G_A0, G_A1, v);
    L.seg(P(an + Math.PI, 0.07), P(an, 0.45), 1.7, crash > 0 ? hot : col, 1);
    L.ring(PG, 0.028, GR, U, 1.2, col, 0.9, 10);
    L.draw(out, b, { fog: LABAS_FOG, nearFade: 0.2 });

    const digits = t < hit ? '0.00' : SCRAMBLE[1 + Math.floor(hash(frameIdx(t), 9) * (SCRAMBLE.length - 1))];
    this.W.clear();
    this.W.word(this.shape('SIGAW', mono(10, 500, false, 2)), { pos: madd(PG, U, 0.19), right: GR, up: U, height: 0.075, col, alpha: 0.9 });
    this.W.word(this.shape(digits), { pos: madd(PG, U, -0.15), right: GR, up: U, height: 0.2, col: crash > 0 ? hot : SELF_INK });
    this.W.draw(out, b, { blend: 'add', nearFade: 0.2 });
  }

  // ================================================================ I, LOOB

  private camInside(t: number): Cam {
    const T = this.T1;
    const D = norm([0.12, 0.1, 1]);
    const TA = mix3(G, W1, 0.3);
    if (t < T.crane) {
      // out of the light: from inside it to 11 m off, turning to find the word
      const u = prog(t, T.burst, T.crane, ease.outQuart);
      const tg = mix3(G, TA, prog(t, T.burst + 0.25, T.crane, ease.inOutSine));
      return handheld(cam(madd(G, D, 0.05 * Math.pow(11 / 0.05, u)), tg, 42), t, 0.003, 0.5, 2);
    }
    // the crane: up and back over the islands, the whole world under the word
    const v = clamp((t - T.crane) / (T.next - T.crane)), e = v * v * (2 - v);
    const pos = mix3(madd(G, D, 11), [10, 36, 30], e);
    const tgt = mix3(TA, [0, 4, -34], ease.inOutSine(v));
    return handheld(cam(pos, tgt, lerp(42, 50, ease.inOutSine(v))), t, 0.003, 0.5, 2);
  }

  private inside(f: Frame, out: RT): Post {
    const t = f.t, T = this.T1;
    const b = basis(this.camInside(t));
    const depth = this.rt(0);
    const light = lightOf(this.liwanag(t)), boom = decay(t, [T.burst], 0.5);
    loob!.draw(out, depth, b, t, { ...LOOB_I, glow: G, glowI: light * (1.3 + 4 * boom), glowR: 0.1 });
    this.flies.draw(out, b, { t, centre: b.pos, depth, fog: [25, 0.015], rise: 0.9 });
    // MUNDO: the flies leave the self's light a letter at a time and settle into the word
    const c = T.mundo.c;
    const k = [0, 1, 2, 3, 4].map((i) => prog(t, c[i] - 0.9, c[i] + 0.45, ease.outCubic));
    this.word1.draw(out, b, {
      t, frame: { o: W1, r: [W1_EM, 0, 0], u: [0, W1_EM, 0], n: [0, 0, W1_EM] }, k,
      src: G, spread: [1.2, 1.2, 1.2], arc: 0.6, jit: 0.25, flare: 0.5, depth,
    });
    this.W.clear().word(this.shape('MUNDO'), { pos: W1, height: W1_EM, col: mul(GOLD, 0.6), each: (i) => ({ alpha: 0.32 * k[i] ** 2 }) });
    this.W.draw(out, b, { depth, blend: 'add' });
    const sc = 4, off = self!.chest({ pos: [0, 0, 0], pose: S_POSE, scale: sc });
    self!.draw(out, b, t, { pos: sub(G, off), pose: S_POSE, scale: sc, noBody: true, light: light * (2 + 3 * boom) }, { depth });
    const k0 = diveIn(t, T.burst, 0.6);
    fill!.draw(out, DIVE_COL, k0, 'over');
    return towardDive(mergePost(POST, { ca: 0.9 * boom }), k0);
  }

  // ================================================================ II

  private buildConstellation() {
    const fig = figure(CON_POSE), S100 = CON.scale;
    const stars = figureStars(fig, 26, 3);
    this.con = new Swarm(stars.length + 3200);
    let i = 0;
    for (const s of stars) this.con.add(s.p, s.g, s.big ? -2.2 : -0.9 - 0.4 * hash(i, 3, 9), FLY, s.big ? 1.2 : 0.9, 3, i++);
    // dust along every limb and round the head: the milky way of the self
    fig.segs.forEach(([a, bb], si) => {
      const g = si < 5 ? 1 : si < 9 ? 2 : 0;
      for (let j = 0; j < 170; j++, i++) {
        const u = hash(i, 3, 1), r = 0.04 * Math.sqrt(hash(i, 3, 2)), th = hash(i, 3, 3) * TAU;
        const p = mix3(a, bb, u);
        this.con.add([p[0] + Math.cos(th) * r, p[1] + Math.sin(th) * r * 0.6, p[2] + Math.sin(th) * r], g, -0.45, hash(i, 3, 4) < 0.25 ? FLY_E : FLY, 0.45, 3, i);
      }
    });
    for (let j = 0; j < 260; j++, i++) {
      const th = hash(i, 3, 3) * TAU, r = 0.115 + 0.03 * (hash(i, 3, 2) - 0.5);
      this.con.add([fig.head[0] + Math.cos(th) * r, fig.head[1] + Math.sin(th) * r, fig.head[2] + (hash(i, 3, 5) - 0.5) * 0.03], 3, -0.45, FLY, 0.45, 3, i);
    }
    // the figure drawn between its stars, part by part
    this.conLines = new LineBatch(64, CON_LINES);
    const W = (p: V3) => toWorld(CON, p), col = mul(GOLD, 0.6);
    fig.segs.forEach(([a, bb], si) => this.conLines.seg(W(a), W(bb), 1.3, col, 0.55, [si < 5 ? 1 : si < 9 ? 2 : 0, 0, 0, 0]));
    this.conLines.ring(W(fig.head), 0.115 * S100, [1, 0, 0], [0, 1, 0], 1.3, col, 0.55, 24, [3, 0, 0, 0]);
  }

  /** the four parts of the constellation, 0..1: legs, torso, arms, head */
  private conK(t: number) {
    const c = this.T2.cut;
    return [
      prog(t, c + 0.2, 138.4, ease.outCubic),
      prog(t, c + 0.7, 139.0, ease.outCubic),
      prog(t, 137.5, 139.9, ease.outCubic),
      prog(t, 138.4, 140.7, ease.outCubic),
    ];
  }

  private camTwo(t: number): Cam {
    const T = this.T2, th = T.tail.thru, mid = 140.0;
    if (t >= th) return tailCam(t, T.tail);
    const oc = ease.outCubic, io = ease.inOutSine;
    // out of the chest star in a corkscrew, round to face it, then settle square in front
    const at = (t: number) => {
      const a = keys(t, [[T.cut, -2.4], [mid, 0.3, oc], [T.may, 0, io]]);
      const p = keys(t, [[T.cut, 0.5], [mid, 0.05, oc], [T.may, 0.03, io]]);
      const d = Math.exp(keys(t, [[T.cut, Math.log(3)], [mid, Math.log(300), oc], [T.may, Math.log(270), io]]));
      const k = keys(t, [[T.cut, 0], [mid, 0.9, oc], [T.may, 0.6, io]]);
      const roll = keys(t, [[T.cut, -TAU * 0.6], [mid, 0, oc], [T.may, 0.05, io]]);
      return cam(add(CHEST, sph(a, p, d)), mix3(CHEST, FC, k), keys(t, [[T.cut, 48], [T.may, 46]]), roll);
    };
    if (t < T.may) return at(t);
    // and back in: one barrel roll down the line into the star, faster and faster
    const B = at(T.may), dir = norm(sub(B.pos, CHEST)), dB = dist(B.pos, CHEST);
    const u = clamp((t - T.may) / (th - T.may));
    const aim = madd(CHEST, dir, -400);
    return cam(madd(CHEST, dir, dB * (1 - ease.inCubic(u))), mix3(B.tgt, aim, ease.inOutSine(clamp(u / 0.5))), lerp(46, 58, ease.inCubic(u)), 0.05 + TAU * ease.inOutCubic(u));
  }

  private two(f: Frame, out: RT): Post {
    const t = f.t, T = this.T2, th = T.tail.thru;
    const b = basis(this.camTwo(t));
    const depth = this.rt(0);
    const light = lightOf(this.liwanag(t));
    const through = toFrame(t) >= th;
    loob!.draw(out, depth, b, t, through ? tailLoob(light) : { ...tailLoob(light), glow: CHEST, glowI: light * 1.5, glowR: 6 });
    // the constellation (behind the camera once it is through)
    if (!through) {
      const k = this.conK(t);
      this.con.draw(out, b, {
        t, frame: { o: CON.pos, r: [CON.scale, 0, 0], u: [0, CON.scale, 0], n: [0, 0, CON.scale] }, k,
        src: [CON.pos[0], 2, CON.pos[2]], spread: [260, 1, 200], arc: 0.9, jit: 1.5, flare: 0.8, depth,
      });
      const g = k.map((x) => ease.inOutSine(clamp((x - 0.75) / 0.25)));
      this.conLines.draw(out, b, { depth, uniforms: { uG: [...g, 0, 0, 0, 0] } });
      self!.draw(out, b, t, { pos: CON.pos, yaw: CON.yaw, pose: CON_POSE, scale: CON.scale, noBody: true, light: light * 2.2, core: 0.03, halo: 0.08 }, { depth });
    }
    this.hand.draw(out, b, depth, t, mundoK(t, this.lyrics));
    self!.draw(out, b, t, { pos: SELF_POS, yaw: SELF_YAW, pose: SELF_POSE, light, col: INK.shade }, { depth });
    // the pass through the star: a white-gold instant
    const pass = Math.exp(-(((t - th) / 0.06) ** 2));
    fill!.draw(out, DIVE_COL, 0.9 * pass, 'add');
    const k0 = diveIn(t, T.cut, 0.6);
    fill!.draw(out, DIVE_COL, k0, 'over');
    return towardDive(mergePost(POST, impact(t, [th], { flash: 0.15, ca: 0.8, shake: 6 })), k0);
  }
}

/** constellation lines, shown part by part (d.x = part) */
const CON_LINES = /* glsl */ `
uniform float uG[8];
vec4 tint(vec4 c, vec3 p, vec4 d) { return vec4(c.rgb, c.a * uG[int(d.x + .5)]); }`;
