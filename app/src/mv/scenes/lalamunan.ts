// 03 · LALAMUNAN — Inside the body, cool not gold: the answer is ready, it rushes up the
// throat and jams at a knot that won't open.
//
// Opens out of the chest light (a dive), pulling back up the throat; on "sagot" the five
// letters burst out of the light side by side, whoosh past the lens and the camera whips
// round to chase them up the throat. On "Pero" they crash into the knot; it clenches a notch
// on every beat, they strain forward on "makalusot", and on "lalamunan" the whole throat
// clamps. On "Nagpapaliban" the knot slams shut, the letters are blown back past us, the
// flow reverses and MAMAYA is stamped on the shut knot (NA on "na"); on "naman" the camera
// is sucked back down the throat in a corkscrew; on "Baka pagtawanan lang" laughter echoes
// down it as rings. Ends hard on dami's impact.
//
// Every other sung word rides the throat too: "May" rises out of the light and SAGOT bursts
// through it; "na sa isipan" rushes up ahead of the chase, slower than it, so the camera
// flies through each word; "Pero", "’di makalusot" and "sa lalamunan" fly up and jam in rows
// against the knot, knocked with the letters on every beat; "Nagpapaliban" is shoved back
// down at us as the knot shuts; "naman" is sucked down with the camera and "Baka pagtawanan
// lang" shakes with each laugh.

import { sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics, type Line, type Word } from '../../engine/lyrics';
import type { RGB } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, hash, keys, lerp, noise1, prog, smoothstep, spring, TAU } from '../../engine/util';
import { basis, handheld, type Basis, type Cam } from '../../engine/3d/camera';
import { add, dot, mul, norm, rotY, sub, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { beats, decay, DIVE_COL, diveIn, Fill, impact, mergePost, towardDive } from './_fx';
import { POSE } from './_labas';
import { axisAt, Motes, Throat } from './_lalamunan_throat';
import { lens, LyricTrack, see, VOICE, type Place, type Tone } from './_lyric';
import { lightOf, Self } from './_self';

/** the knot, metres up the throat from the chest light */
const SK = 90;
/** where each letter of SAGOT comes to rest against the knot */
const JAM = [SK - 2.15, SK - 2.5, SK - 2.25, SK - 2.6, SK - 2.3];
/** the sign on the shut knot */
const SIGN_S = SK - 2.2;
const COOL: RGB = [0.8, 0.9, 1.0];
const HERO = sans(100, 800, 'extra-condensed', 4);
/** the sung words: the body's cool, not the loob's gold */
const THROAT: Tone = { rest: mul(COOL, 0.6), hot: mul(COOL, 1.15) };

let throat: Throat | null = null, motes: Motes | null = null, self: Self | null = null, fill: Fill | null = null;

/** a knock: out and back, peaking ~.1 s after x = 0 */
const knock = (x: number) => (x > 0 ? Math.exp(-x * 6) * (1 - Math.exp(-x * 40)) : 0);

export default class Lalamunan extends Scene {
  maxSamples = 36;
  private W = new Words();
  private letters: WordShape[] = [];
  private sign!: { mamaya: WordShape; na: WordShape };
  private w!: Record<'sagot' | 'pero' | 'makalusot' | 'lalamunan' | 'nag' | 'na' | 'naman' | 'baka' | 'pagtawanan' | 'lang', Word>;
  private l!: Line[];
  private track!: LyricTrack;
  /** SAGOT's flight: s = fly(x) since "sagot", its late acceleration, each letter's crash time */
  private accel = 0;
  private crash: number[] = [];
  private beatsJam: number[] = [];
  private laughs: number[] = [];

  async init() {
    throat ??= new Throat();
    motes ??= new Motes();
    self ??= new Self();
    fill ??= new Fill();
    const L = this.lyrics, c: number = this.params.cut;
    const find = (q: string): Line => L.find(q, c - 1);
    const l1 = find('May sagot'), l2 = find('makalusot'), l3 = find('Nagpapaliban'), l4 = find('pagtawanan');
    this.l = [l1, l2, l3, l4];
    this.w = {
      sagot: Lyrics.word(l1, 'sagot'), pero: l2.words[0], makalusot: Lyrics.word(l2, 'makalusot'),
      lalamunan: Lyrics.word(l2, 'lalamunan'), nag: l3.words[0], na: l3.words[1], naman: l3.words[2],
      baka: l4.words[0], pagtawanan: Lyrics.word(l4, 'pagtawanan'), lang: Lyrics.word(l4, 'lang'),
    };
    this.letters = [...'SAGOT'].map((ch) => this.W.shape(ch, HERO));
    this.sign = { mamaya: this.W.shape('MAMAYA', HERO), na: this.W.shape('NA', HERO) };

    // S reaches its rest exactly on "Pero"; the others pile in behind it
    const X = this.w.pero.start - this.w.sagot.start;
    this.accel = (3 * (JAM[0] - this.fly0(X))) / (X - 0.6) ** 3;
    this.crash = JAM.map((j, i) => {
      let a = 0, b = 6;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        if (this.fly(m) < j) a = m; else b = m;
      }
      return this.w.sagot.start + a;
    });
    this.beatsJam = beats(this.audio, this.w.pero.start + 0.15, this.w.nag.start - 0.1);
    const pw = this.w.pagtawanan;
    this.laughs = [this.w.baka.start, pw.c[0] ?? pw.start, pw.c[3] ?? pw.start + 0.3, pw.c[5] ?? pw.start + 0.55, pw.c[7] ?? pw.start + 0.8, this.w.lang.start];
    this.track = this.lines(l1, l2, l3, l4);
  }

  /** every sung word but SAGOT and NA, which the scene draws itself */
  private lines(l1: Line, l2: Line, l3: Line, l4: Line) {
    const w = this.w, T = new LyricTrack(this.W), tn = w.nag.start;
    const face = (pos: V3, b: Basis): Place => ({ pos, right: b.R, up: b.U });
    // down the throat from the knot: towards us
    const back = norm(sub(axisAt(SK - 4), axisAt(SK - 3)));
    const jolt = (t: number) => { let k = 0; for (const tb of this.beatsJam) k += knock(t - tb); return k; };

    // "May" rises out of the light below us, and SAGOT bursts through it
    T.add(l1, {
      voice: VOICE.soft, size: 0.7, tone: THROAT, skip: ['sagot', 'na', 'sa', 'isipan'],
      at: (t, b) => face(add(axisAt(1.2 + 6 * (t - l1.words[0].start)), [0, 0.7, 0]), b),
      out: w.sagot.start + 0.05, exit: 'scatter', exitDur: 0.25,
    });
    // "na sa isipan" rushes up the throat ahead of the chase, but slower: the camera
    // catches each word up and flies through it
    const AHEAD = [[5.5, 6, -0.7, 0.95], [7, 6.5, 0.75, 0.95], [7.5, 4.2, 0, 1.2]]; // metres ahead, closing m/s, x, y
    const ahead = (k: number, t: number) => AHEAD[k - 2][0] - AHEAD[k - 2][1] * Math.max(0, t - l1.words[k].start);
    T.add(l1, {
      voice: VOICE.soft, size: 0.47, tone: THROAT, skip: ['May', 'sagot'], at: { pos: axisAt(0) },
      wordAt: (k, t, b) => face(add(axisAt(this.camS(t) + ahead(k, t)), [AHEAD[k - 2][2], AHEAD[k - 2][3], 0]), b),
      each: (k, _i, _u, t) => ({ alpha: smoothstep(0.9, 1.8, ahead(k, t)) }),
      out: w.pero.start - 0.1, exit: 'fly',
    });

    // piled up in the throat behind the letters, in rows above and below them: knocked
    // back on every beat, straining forward on "makalusot", crushed as the throat clamps on
    // "lalamunan"; as the camera creeps up it presses the pile into the knot
    const sq = (t: number) => clamp(this.knot(t));
    const row = (s0: number, y0: number, y1: number, size: number) => (t: number, b: Basis): Place => {
      const k = sq(t), c = this.camS(t) + 4;
      const s = Math.min(SK - 2.75, (s0 + c + Math.hypot(s0 - c, 1)) / 2);
      return { ...face(add(axisAt(s), [0, lerp(y0, y1, k), 0]), b), size: size * lerp(1, 0.8, k) };
    };
    const jam = (strain: number) => (_k: number, i: number, _u: number, t: number) => {
      const m = w.makalusot;
      const st = strain * smoothstep(m.start, m.start + 0.25, t) * (1 - smoothstep(m.end - 0.3, m.end, t)) * (0.6 + 0.4 * noise1(t * 9, i));
      const kn = jolt(t) + 1.4 * knock(t - w.lalamunan.start);
      return { off: mul(back, 0.3 * kn - st), spin: noise1(t * 14, i + 20) * 0.05 * (1 + 3 * kn) + (hash(i, 7) - 0.5) * 0.25 * sq(t) };
    };
    T.add(l2, {
      voice: VOICE.soft, size: 0.65, tone: THROAT, skip: ['’di', 'makalusot', 'sa', 'lalamunan'],
      at: row(79.5, 0.7, 0.6, 0.65), enter: 'slam', each: jam(0), out: 35.02, exit: 'scatter', exitDur: 0.25,
    });
    T.add(l2, {
      voice: VOICE.soft, size: 0.45, tone: THROAT, skip: ['Pero', 'sa', 'lalamunan'],
      at: row(80, -0.55, -0.5, 0.45), enter: 'fly', travel: 4, each: jam(0.45), out: tn - 0.04, exit: 'fly', exitDur: 0.26,
    });
    T.add(l2, {
      voice: VOICE.soft, size: 0.45, tone: THROAT, skip: ['Pero', '’di', 'makalusot'],
      at: row(83, 0.76, 0.58, 0.45), enter: 'fly', travel: 4, each: jam(0), out: tn - 0.02, exit: 'fly', exitDur: 0.26,
    });

    // the knot slams shut and shoves "Nagpapaliban" back down at us, under MAMAYA
    T.add(l3, {
      voice: VOICE.soft, size: 0.3, tone: THROAT, skip: ['na', 'naman'], enter: 'slam',
      at: (t, b) => face(add(axisAt(SK - 2.7 - 0.9 * ease.outExpo(prog(t, tn, tn + 0.3))), [0, -0.1, 0]), b),
      out: w.na.start - 0.02, exit: 'fly', exitDur: 0.4,
    });
    // "naman" is sucked back down the throat with us, riding just ahead of the lens
    T.add(l3, {
      voice: VOICE.soft, size: 0.42, tone: THROAT, skip: ['Nagpapaliban', 'na'],
      at: (t, b) => face(add(axisAt(this.camS(t) + 2.5 - 0.5 * prog(t, w.naman.start, w.naman.end)), mul(b.U, 0.75)), b),
      out: w.naman.end + 0.05, exit: 'fly', exitDur: 0.35,
    });
    // the fear, small and level through the corkscrew, shaking with each laugh
    T.add(l4, {
      voice: VOICE.quiet, size: 1, tone: THROAT, spread: 0.15, settle: 0.14,
      at: (t, b) => lens(b, 0, -0.08, lerp(4, 2.6, prog(t, w.baka.start, this.params.next)), 0.085),
      each: (k, i, _u, t) => {
        let j = 0;
        for (const t0 of this.laughs) j += knock(t - t0);
        return { scale: 1 + 0.1 * j, tilt: noise1(t * 7, i + 10 * k) * 0.12 * j };
      },
      out: this.params.next + 0.1,
    });
    return T;
  }

  /** the letters' flight up the throat, x seconds after leaving the light (without the late push) */
  private fly0(x: number) {
    return 0.3 + 22 * x + 5.04 * (1 - Math.exp(-x / 0.18));
  }
  private fly(x: number) {
    return this.fly0(x) + (this.accel * Math.max(0, x - 0.6) ** 3) / 3;
  }

  // ---------------------------------------------------------------- the knot

  private knot(t: number) {
    const w = this.w;
    if (t < w.pero.start) return 0;
    let k = 0.12 * spring(t, w.pero.start, 3, 0.4) + 0.16 * spring(t, w.lalamunan.start, 3.5, 0.35);
    for (const b of this.beatsJam) k += 0.075 * spring(t, b, 4, 0.35);
    return Math.min(1.04, lerp(k, 1, spring(t, w.nag.start, 5, 0.45)));
  }
  private twist(t: number) {
    let k = 0;
    for (const b of this.beatsJam) k += 0.45 * spring(t, b, 4, 0.35);
    return k + 2.2 * spring(t, this.w.nag.start, 5, 0.45) - 0.8 * prog(t, this.w.naman.start, this.params.next);
  }
  private squeeze(t: number) {
    const w = this.w;
    return keys(t, [
      [w.pero.start, 0], [w.pero.start + 0.3, 0.25, ease.outCubic], [w.lalamunan.start - 0.05, 0.32],
      [w.lalamunan.start + 0.3, 0.78, ease.outBack], [w.nag.start, 0.82], [w.nag.start + 0.15, 1, ease.outCubic],
      [w.naman.start + 0.1, 1], [w.naman.start + 1.5, 0.25],
    ]);
  }
  /** peristalsis phase: swallowing up the throat, then reversed on "Nagpapaliban" */
  private flow(t: number) {
    const tn = this.w.nag.start, tr = this.w.naman.start + 1.1;
    return 2.2 * (Math.min(t, tn) - 30) - 9 * clamp(t - tn, 0, tr - tn) - 3 * Math.max(0, t - tr);
  }
  private drift(t: number) {
    const tn = this.w.nag.start, tr = this.w.naman.start + 1.1;
    return 4 * (Math.min(t, tn) - 30) - 25 * clamp(t - tn, 0, tr - tn) - 8 * Math.max(0, t - tr);
  }

  // ---------------------------------------------------------------- the letters

  /** letter i: throat s, lateral offset, spin, tilt, scale, alpha */
  private letter(i: number, t: number) {
    const w = this.w, x = t - w.sagot.start;
    const tb = w.nag.start + 0.025 * i;
    if (x < 0) return null;
    const home = (i - 2) * 0.62;
    if (t < this.crash[i]) {
      // out of the light together, fanning straight out into the word; until the whip
      // turns us round they are seen from above, so they are laid out mirrored to read
      const form = smoothstep(0, 0.1, x), a = i * 1.26 + x * 9, r = 0.45 * (1 - form);
      const side = lerp(-1, 1, smoothstep(0.22, 0.42, x));
      const lat: [number, number] = [
        side * (lerp(Math.cos(a) * r, home, form) + noise1(t * 1.5, i) * 0.12 * form),
        Math.sin(a) * r + noise1(t * 1.3, i + 9) * 0.1 * form,
      ];
      const sgn = hash(i, 5) < 0.5 ? -1 : 1;
      return { s: this.fly(x), lat, spin: (1 - form) * sgn * x * 9, tilt: (1 - form) * x * 5 * sgn, scale: ease.outBack(clamp(x / 0.12)), a: 1, form };
    }
    const jam = (tt: number) => {
      const xc = tt - this.crash[i];
      let s = JAM[i] - 0.55 * Math.exp(-xc * 7) * Math.sin(xc * 18);
      let kn = 0;
      for (const b of this.beatsJam) kn += knock(tt - b);
      s -= 0.35 * kn;
      s += 0.7 * smoothstep(w.makalusot.start, w.makalusot.start + 0.25, tt) * (1 - smoothstep(w.makalusot.end - 0.3, w.makalusot.end, tt)) * (0.6 + 0.4 * noise1(tt * 9, i));
      s -= 0.5 * knock(tt - w.lalamunan.start);
      return { s, kn };
    };
    if (t < tb) {
      const { s, kn } = jam(t);
      const sq = clamp(this.knot(t));
      return {
        s,
        lat: [home * lerp(1, 0.66, sq) + noise1(t * 11, i) * 0.03 * (1 + 3 * kn), (hash(i, 3) - 0.5) * 0.25 * sq + noise1(t * 13, i + 4) * 0.03] as [number, number],
        spin: (hash(i, 8) - 0.5) * 0.5 * sq + noise1(t * 14, i * 3) * 0.08 * (1 + 3 * kn),
        tilt: (hash(i, 9) - 0.5) * 0.6 * sq,
        scale: lerp(1, 0.74, sq) * (1 - 0.1 * kn),
        a: 1, form: 1,
      };
    }
    // blown back past the camera, tumbling, scattering to the walls
    const u = t - tb, s0 = jam(tb).s, sgn = hash(i, 5) < 0.5 ? -1 : 1;
    const out = 1 - Math.exp(-u / 0.35), ang = i * 1.9 + 0.4;
    return {
      s: s0 - 34 * (1 - Math.exp(-u / 0.8)),
      lat: [home * 0.66 + Math.cos(ang) * 1.3 * out, Math.sin(ang) * 1.1 * out] as [number, number],
      spin: sgn * u * 9, tilt: sgn * u * 6, scale: 0.74, a: 1 - smoothstep(0.9, 1.6, u), form: 0,
    };
  }

  // ---------------------------------------------------------------- the camera

  private camS(t: number) {
    const w = this.w, c: number = this.params.cut;
    const pull = 0.35 + 9.4 * (1 - Math.exp(-(t - c) / 0.32));
    const t1 = w.sagot.start + 0.66; // the whip lands; the chase starts here
    const gap1 = this.fly(t1 - w.sagot.start) - (0.35 + 9.4 * (1 - Math.exp(-(t1 - c) / 0.32)));
    const chase = (tt: number) => this.fly(tt - w.sagot.start) - lerp(gap1, 12.5, prog(tt, t1, 33.2));
    const tB = w.pero.start - 0.16, T = 0.45;
    const s0 = chase(tB), v0 = (chase(tB + 1e-3) - chase(tB - 1e-3)) / 2e-3, stop = s0 + (v0 * T) / 3;
    if (t < tB) return lerp(pull, chase(t), smoothstep(t1, t1 + 0.65, t));
    if (t < w.nag.start) {
      const creep = stop + (84 - stop) * prog(t, tB + T, w.nag.start - 0.05, ease.inOutSine);
      return s0 + (v0 * T) / 3 * ease.outCubic(clamp((t - tB) / T)) + (creep - stop) - 0.5 * knock(t - w.lalamunan.start);
    }
    const hold = 84 - 1.1 * knock(t - w.nag.start) + 0.5 * prog(t, w.nag.start + 0.2, w.na.start - 0.05, ease.inOutCubic);
    const tn = w.naman.start;
    if (t < tn) return hold;
    return keys(t, [[tn, 84.5], [tn + 0.54, 63, ease.inQuad], [tn + 1.44, 36, ease.outCubic], [this.params.next, 30, ease.linear]]);
  }

  private camera(t: number): { c: Cam; s: number } {
    const w = this.w, c0: number = this.params.cut, s = this.camS(t);
    const pos = add(axisAt(s), [0.25 * noise1(t * 0.7, 1), 0.2 + 0.2 * noise1(t * 0.6, 2), 0]);
    const up = norm(sub(axisAt(s + 6), pos)), dn = norm(sub(axisAt(s - 6), pos));
    // the whip: yaw half a turn from looking down at the light to looking up the throat
    const k = prog(t, w.sagot.start + 0.2, w.sagot.start + 0.64, ease.inOutQuart);
    const F = k >= 1 ? up : k <= 0 ? dn : norm(add(mul(rotY(dn, Math.PI * k), 1 - smoothstep(0.6, 1, k)), mul(up, smoothstep(0.6, 1, k))));
    const tn = w.naman.start;
    const roll =
      0.35 * Math.sin(Math.PI * k) +
      0.18 * noise1(t * 0.8, 5) * smoothstep(c0 + 1, c0 + 2, t) * (1 - prog(t, w.pero.start, w.pero.start + 1)) +
      0.04 * noise1(t * 0.5, 6) -
      TAU * prog(t, tn + 0.05, tn + 1.7, ease.inOutCubic);
    const fov = keys(t, [
      [c0, 50], [w.sagot.start + 0.66, 58], [w.pero.start - 0.2, 66, ease.inQuad], [w.pero.start + 0.3, 46, ease.outCubic],
      [w.nag.start - 0.1, 44], [w.na.start, 42], [tn, 43], [tn + 0.54, 76, ease.inQuad], [tn + 1.6, 56], [this.params.next, 52],
    ]);
    return { c: handheld({ pos, tgt: add(pos, F), roll, fov }, t, 0.01, 1.1, 3), s };
  }

  // ---------------------------------------------------------------- the frame

  private rings(t: number): [number, number, number][] {
    const c: number = this.params.cut, out: [number, number, number, number][] = [];
    // laughter carried over from alon, rising from below as the shot opens
    for (const t0 of [c - 0.35, c, c + 0.35, c + 0.7]) {
      const age = t - t0;
      if (age >= 0 && age < 3) out.push([-8 + 26 * age, 0.22 * Math.exp(-age * 1.1), 0.8 * Math.exp(-age * 1.1), t0]);
    }
    // "baka pagtawanan lang": echoes down from the shut knot, each with its own echo
    for (const t0 of this.laughs) {
      for (const [dt, g] of [[0, 1], [0.14, 0.5]]) {
        const age = t - t0 - dt;
        if (age >= 0 && age < 3) out.push([SK - 3 - 60 * age, 0.38 * g * Math.exp(-age * 0.5), 1.3 * g * Math.exp(-age * 0.5), t0 + dt]);
      }
    }
    return out.sort((a, b) => b[3] - a[3]).map(([s, a, g]) => [s, a, g] as [number, number, number]);
  }

  /** SAGOT, spread over its five letters, for the lyric audit */
  private markSagot(Ls: ReturnType<Lalamunan['letter']>[], b: Basis) {
    let n = 0, a = 0, form = 1, h = 0, pos: V3 = [0, 0, 0];
    const ps = Ls.map((l) => (l ? add(axisAt(l.s), [l.lat[0], l.lat[1], 0]) : null));
    Ls.forEach((l, i) => { if (l && ps[i]) { n++; a += l.a; form = Math.min(form, l.form); h += 0.95 * l.scale; pos = add(pos, ps[i]!); } });
    if (n < 5) return;
    pos = mul(pos, 1 / n);
    h /= n;
    // the word's extent along the lens's reading axis, in its em
    let lo = Infinity, hi = -Infinity;
    Ls.forEach((l, i) => {
      const x = dot(sub(ps[i]!, pos), b.R), half = (this.letters[i].w / this.letters[i].r) * 0.95 * l!.scale / 2;
      lo = Math.min(lo, x - half);
      hi = Math.max(hi, x + half);
    });
    // mirrored (S right of T on screen) reads as nothing
    const order = dot(sub(ps[4]!, ps[0]!), b.R) > 0 ? 1 : 0;
    see(this.l[0], this.l[0].words.indexOf(this.w.sagot), b, pos, b.R, b.U, h, (hi - lo) / h, (a / n) * form * order);
  }

  render(f: Frame, out: RT): Post {
    const t = f.t, w = this.w, cut: number = this.params.cut;
    const { c, s: camS } = this.camera(t);
    const b: Basis = basis(c);
    const light = lightOf(this.liwanag(t));
    const depth = this.rt(0);

    // the letters and the light they carry
    const Ls = this.letters.map((_, i) => this.letter(i, t));
    let wsum = 0, wp: V3 = [0, 0, 0];
    for (const l of Ls) if (l && l.a > 0) { const p = add(axisAt(l.s), [l.lat[0], l.lat[1], 0]); wp = add(wp, mul(p, l.a)); wsum += l.a; }
    const signA = prog(t, w.nag.start, w.nag.start + 0.06);
    // one light: the letters' until the knot shuts, then the sign's
    const lit = t < w.nag.start;
    const wordP: V3 = lit ? (wsum > 0 ? mul(wp, 1 / wsum) : axisAt(0.5)) : add(axisAt(SIGN_S), [0, 0, 0.3]);
    const wordI = lit
      ? 1.2 * (wsum / 5) * (1 + 0.6 * decay(t, this.beatsJam, 0.15))
      : signA * (0.75 + 2.2 * decay(t, [w.nag.start, w.na.start], 0.12));

    throat!.draw(out, depth, b, {
      t, flow: this.flow(t), knot: this.knot(t), knotS: SK, twist: this.twist(t), squeeze: this.squeeze(t),
      chest: axisAt(0), chestI: light * 1.4, word: wordP, wordI, rings: this.rings(t),
    });
    motes!.draw(out, b, t, camS, this.drift(t), depth);

    // the chest light far below: where we came from
    const c0 = self!.chest({ pos: [0, 0, 0], pose: POSE.shy, scale: 1.5 });
    self!.draw(out, b, t, { pos: sub(axisAt(0), c0), pose: POSE.shy, noBody: true, light: light * 1.6, scale: 1.5 }, { depth });

    const W = this.W.clear();
    Ls.forEach((l, i) => {
      if (!l || l.a <= 0) return;
      W.word(this.letters[i], {
        pos: add(axisAt(l.s), [l.lat[0], l.lat[1], 0]), right: b.R, up: b.U, height: 0.95 * l.scale,
        col: mul(COOL, 1.5), alpha: l.a,
        each: () => ({ spin: l.spin, tilt: l.tilt }),
      });
    });
    this.markSagot(Ls, b);
    // MAMAYA stamped on the shut knot, NA under it on "na"
    for (const [shape, t0, dy] of [[this.sign.mamaya, w.nag.start, 0.27], [this.sign.na, w.na.start, -0.36]] as const) {
      if (t < t0) continue;
      const k = ease.outExpo(prog(t, t0, t0 + 0.22));
      W.word(shape, {
        pos: add(axisAt(SIGN_S), [0, dy, 0]), right: [1, 0, 0], up: [0, 1, 0], height: 0.55 * (1.5 - 0.5 * k),
        col: mul(COOL, 1.35 + 1.5 * decay(t, [t0], 0.1)), alpha: prog(t, t0, t0 + 0.05),
        each: (gi) => ({ spin: (hash(gi, dy > 0 ? 3 : 4) - 0.5) * 0.12, off: [0, (hash(gi, 6) - 0.5) * 0.04, 0] }),
      });
      if (shape === this.sign.na) LyricTrack.mark(this.l[2], w.na, b, add(axisAt(SIGN_S), [0, dy, 0]), [1, 0, 0], 0.55 * (1.5 - 0.5 * k), shape, prog(t, t0, t0 + 0.05));
    }
    this.track.draw(t, b);
    W.draw(out, b, { depth, nearFade: 0.5 });

    const kDive = diveIn(t, cut, 0.6);
    fill!.draw(out, DIVE_COL, kDive, 'over');

    const hits = mergePost(
      impact(t, [w.pero.start], { flash: 0.12, ca: 0.7, shake: 10, seed: 1 }),
      impact(t, [w.lalamunan.start], { flash: 0.1, ca: 0.8, shake: 12, seed: 2 }),
      impact(t, [w.nag.start], { flash: 0.28, ca: 1, shake: 16, seed: 3 }),
      impact(t, [w.na.start], { flash: 0.08, ca: 0.5, shake: 6, seed: 4 }),
      impact(t, [w.naman.start], { ca: 0.9, shake: 8, seed: 5, tau: 0.35 }),
      impact(t, this.beatsJam, { ca: 0.25, shake: 3, seed: 6, tau: 0.12 }),
    );
    return towardDive(mergePost({ exposure: 1.05, bloom: 0.85, grain: 0.04, vignette: 0.42 }, hits), kDive);
  }
}
