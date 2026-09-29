// 08 · BULSA — LOOB. The stories folded in the chest's pocket want out.
//
// Opens on mundo's world (CONT, the same LOOB look), the camera already swooping down over
// the islands to a pocket drawn in the sky, jeans-blue lines, packed with folded notes and
// lit from inside by the self's light. The pile jumps on "May" and "mga"; on "kwento" the
// pocket bursts: four hundred notes fold into paper birds and pour out, KWENTO pops out of
// the mouth after them a letter at a time and thumps on "dibdib". On "Nakatupi" the letters
// fold edge-on as the camera punches through them and the flock streams away: the camera
// flies with it, down over the sea, past a hanging island's root, banking hard round. On
// "Gustong-gusto" one note breaks from the flock, turns to face us and unfolds huge, its
// handwriting written in light while the others wheel round it; ILABAS rises off the page a
// letter at a time on "ilabas". On "Pero" the letters falter and sink back into the paper,
// the letter folds itself shut, and on "nanahimik" every note folds its wings and dives
// back into the pocket; the camera goes with them, into the light (a DIVE into entablado).

import { sans } from '../../engine/fonts';
import { FPS } from '../../engine/config';
import { makeRT, Pass, type RT } from '../../engine/gl';
import type { Line, Word } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, hash, keys, lerp, noise1, prog, smoothstep, TAU, type Ease } from '../../engine/util';
import { basis, handheld, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, dot, len, madd, mix3, mul, norm, sub, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { beats, decay, DIVE_COL, diveOut, Fill, impact, mergePost, towardDive } from './_fx';
import { Paper, pocket, type PocketOpts } from './_bulsa_paper';
import { POSE } from './_labas';
import { Flies, Loob } from './_loob';
import { GOLD, lightOf, Self } from './_self';

const N_NOTES = 420;
/** mundo's islands (the same world across the cut), plus one hanging over the flight */
const LOOB_B = { isleY: 26, steps: 80 };
const DENIM: RGB = [0.38, 0.55, 1.1];
const THREAD: RGB = mul(lin('paper'), 0.6);
const PK: Omit<PocketOpts, 'bulge'> = { c: [0, 12, -24], R: [1, 0, 0], U: [0, 1, 0], size: 8, col: DENIM, thread: THREAD };
/** the self's light, down in the pocket */
const G: V3 = [0, 13.6, -24.2];
const KW_POS: V3 = [0, 21.6, -23.2], KW_H = 5;
/** the letter, unfolded: centre, right, up, facing (towards the camera), half size */
const S0: V3 = [15, 8.4, -64.5], SR: V3 = [-1, 0, 0], SU: V3 = [0, 1, 0], SN: V3 = [0, 0, -1];
const SW = 3.2, SH = 2.25;
const IL_H = 1.25;
/** ILABAS: the page's light, whiter than the ink it rises from */
const IL_COL: RGB = mix3(lin('glow'), [1, 1, 1], 0.35);
const COOL: RGB = [0.8, 0.9, 1.0];
const HERO = sans(100, 800, 'extra-condensed', 4);
/** the Words kit's raster em (engine/3d/words.ts), to lay out where each glyph comes to rest */
const EM = 320;
const POST: Post = { bloom: 0.9, grain: 0.035, vignette: 0.3 };
const SHUT = Math.PI - 0.03;

let loob: Loob | null = null, self: Self | null = null, fill: Fill | null = null, paper: Paper | null = null;
let flies: Flies | null = null, lines: LineBatch | null = null;

// LOOB is most of a frame's cost, and behind the flock a third of the shutter looks the same:
// march it on the 12-sample grid (each sample of the 4 and 12 levels exactly, the 36 level's
// pairs sharing their middle one) and keep the last one, colour + depth, to reuse
const LOOB_SUB = 12;
let loobRT: RT | null = null, loobKey = NaN, copy: Pass | null = null;
const COPY = /* glsl */ `
uniform sampler2D uSrc;
void main() { fragColor = vec4(texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb, 1.); }`;

/** a knock: out and back, peaking ~.1 s after x = 0 */
const knock = (x: number) => (x > 0 ? Math.exp(-x * 6) * (1 - Math.exp(-x * 40)) : 0);

type Key = [number, V3];
/** a smooth path through timed keys (Hermite, centred tangents), carried on straight past the ends */
function track(ks: Key[]) {
  const n = ks.length;
  const tan = ks.map((_, i) => {
    const a = ks[Math.max(0, i - 1)], b = ks[Math.min(n - 1, i + 1)];
    return mul(sub(b[1], a[1]), 1 / (b[0] - a[0]));
  });
  return (t: number): V3 => {
    if (t <= ks[0][0]) return madd(ks[0][1], tan[0], t - ks[0][0]);
    if (t >= ks[n - 1][0]) return madd(ks[n - 1][1], tan[n - 1], t - ks[n - 1][0]);
    let i = 0;
    while (t > ks[i + 1][0]) i++;
    const [t0, p0] = ks[i], [t1, p1] = ks[i + 1], h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
    return add(
      add(mul(p0, 2 * u3 - 3 * u2 + 1), mul(tan[i], (u3 - 2 * u2 + u) * h)),
      add(mul(p1, -2 * u3 + 3 * u2), mul(tan[i + 1], (u3 - u2) * h)),
    );
  };
}
/** a Catmull-Rom curve through `pts`, u 0..1 */
function spline(pts: V3[]) {
  const n = pts.length;
  return (u: number): V3 => {
    const x = clamp(u) * (n - 1), i = Math.min(n - 2, Math.floor(x)), f = x - i, f2 = f * f, f3 = f2 * f;
    const P0 = pts[Math.max(0, i - 1)], P1 = pts[i], P2 = pts[i + 1], P3 = pts[Math.min(n - 1, i + 2)];
    return [0, 1, 2].map((k) =>
      0.5 * (2 * P1[k] + (P2[k] - P0[k]) * f + (2 * P0[k] - 5 * P1[k] + 4 * P2[k] - P3[k]) * f2 + (3 * P1[k] - P0[k] - 3 * P2[k] + P3[k]) * f3),
    ) as V3;
  };
}
const vkeys = (t: number, ks: [number, V3, Ease?][]): V3 =>
  [0, 1, 2].map((k) => keys(t, ks.map(([tt, v, e]) => [tt, v[k], e] as [number, number, Ease?]))) as V3;
const bez = (a: V3, c: V3, b: V3, u: number): V3 => add(add(mul(a, (1 - u) ** 2), mul(c, 2 * u * (1 - u))), mul(b, u * u));

interface Note {
  id: number;
  /** its place in the pile: across, down (0 = top), depth, turn in the pocket's plane */
  px: number; py: number; pz: number; rot: number;
  /** out of the pocket at te with velocity v0 */
  te: number; v0: V3;
  /** its slot in the flock: this far behind the flock's path, offset across / up it, swirl */
  lag: number; sx: number; sy: number; om: number;
  /** round the letter: radius, angle, depth, orbit speed, when it joins */
  rr: number; th: number; dz: number; rw: number; tr: number;
  /** back into the pocket: leaves at ts, home at ta, over an arc this high and this far aside */
  ts: number; ta: number; lift: number; side: number;
  f: number; ph: number; tone: number; len: number; wing: number;
  /** (filled in once the paths exist) where it leaves the pile, where it starts its dive home */
  pe?: V3; p0?: V3;
}

export default class Bulsa extends Scene {
  maxSamples = 36;
  private W = new Words();
  private kwento!: WordShape;
  private ilabas!: WordShape;
  private w!: Record<'may' | 'mga' | 'kwento' | 'dibdib' | 'naka' | 'bulsa' | 'gusto' | 'kong' | 'ilabas' | 'pero' | 'nana', Word>;
  private notes: Note[] = [];
  /** per-t values every note asks for (cleared each sub-frame) */
  private memo = new Map<number, { jolt: number; bulge: number; beat: number }>();
  private hero!: Note;
  private beatsAll: number[] = [];
  private barsAll: number[] = [];
  /** the flock's path, the camera's path through the opening and the flight, its dive */
  private F!: (t: number) => V3;
  private camA!: (t: number) => V3;
  private dive!: (u: number) => V3;

  async init() {
    loob ??= new Loob();
    self ??= new Self();
    fill ??= new Fill();
    paper ??= new Paper();
    flies ??= new Flies(4000, 60, 11);
    lines ??= new LineBatch(4096);
    loobRT ??= makeRT();
    copy ??= new Pass(COPY);
    const L = this.lyrics, c: number = this.params.cut, next: number = this.params.next;
    const find = (q: string): Line => L.find(q, c - 1);
    const l1 = find('May mga kwento'), l2 = find('Nakatupi'), l3 = find('Gustong'), l4 = find('Pero nanahimik');
    this.w = {
      may: l1.words[0], mga: l1.words[1], kwento: l1.words[2], dibdib: l1.words[4],
      naka: l2.words[0], bulsa: l2.words[2], gusto: l3.words[0], kong: l3.words[1], ilabas: l3.words[2],
      pero: l4.words[0], nana: l4.words[1],
    };
    this.kwento = this.W.shape('KWENTO', HERO);
    this.ilabas = this.W.shape('ILABAS', HERO);
    this.beatsAll = beats(this.audio, c, next);
    this.barsAll = [85.307, 87.941, 90.61].filter((b) => b > c && b < next);
    const w = this.w, kw = w.kwento.start, g = w.gusto.start, nana = w.nana.start;

    this.F = track([
      [kw, [0, 16.2, -24.4]], [kw + 0.51, [0.2, 21.5, -25.5]], [kw + 1.11, [-0.3, 23, -27.5]],
      [w.naka.start, [-1.2, 21, -33]], [w.naka.start + 0.44, [-3, 16.5, -42]], [w.naka.start + 1.04, [-5.5, 10, -54]],
      [w.naka.start + 1.64, [-4.5, 6.2, -66]], [w.naka.start + 2.14, [2, 5.8, -77]], [g - 0.18, [10, 6.6, -79]],
      [g + 0.32, [15, 7.8, -72]], [g + 0.97, [15.5, 8.4, -66]],
    ]);

    const mk = (i: number, seed: number): Note => {
      const h = (k: number) => hash(i, seed, k);
      const py = h(2), te = kw + 0.02 + 0.95 * py ** 1.3 + 0.08 * h(20);
      const r = Math.sqrt(h(9)), a = TAU * h(10), sz = 0.85 + 0.3 * h(24);
      const ts = nana + 0.5 * h(16);
      return {
        id: i, px: h(1), py, pz: h(3), rot: (h(4) - 0.5) * 1.4,
        te, v0: [(h(1) * 2 - 1) * 1.5 + (h(5) - 0.5) * 5, 15 + 8 * h(6), -1.5 - 6 * h(7)],
        lag: te - kw - 0.3 + (h(8) - 0.5) * 0.35, sx: 5.5 * r * Math.cos(a), sy: 3.2 * r * Math.sin(a), om: (h(11) - 0.5) * 1.2,
        rr: 3.6 + 5.5 * h(12) ** 0.7, th: TAU * h(13), dz: -4 + 7 * h(14), rw: 0.35 + 0.35 * h(15), tr: g - 0.05 + 0.5 * h(25),
        ts, ta: ts + 0.75 + 0.5 * h(17), lift: 5 + 6 * h(18), side: (h(19) - 0.5) * 12,
        f: 2.2 + 1.4 * h(21), ph: TAU * h(22), tone: h(23), len: 0.46 * sz, wing: 0.6 * sz,
      };
    };
    this.notes = Array.from({ length: N_NOTES }, (_, i) => mk(i, 41));
    // the letter: top of the pile, first out, leading the flock
    this.hero = { ...mk(0, 97), px: 0.56, py: 0.02, pz: 0.9, rot: 0, te: kw + 0.02, v0: [0, 19, -3], lag: -0.12, sx: 0.3, sy: 0.6, om: 0, ts: nana + 0.06, ta: nana + 1.05, lift: 7, side: 3 };

    // the camera: down over the islands to the pocket, through KWENTO, then riding with the flock
    const flight: Key[] = [];
    for (let tt = w.naka.start + 0.34; tt < g - 0.05; tt += 0.35) {
      const f = this.frame(tt - 0.32);
      flight.push([tt, madd(madd(f.P, f.S, 0.7), f.U, 1.1)]);
    }
    this.camA = track([
      [c - 0.47, [9.5, 35.5, 31.5]], [c, [8, 30, 26]], [c + 0.73, [5, 20.5, 14]], [kw, [2, 13.8, 3.8]],
      [kw + 0.31, [2.3, 13.6, 5.2]], [w.dibdib.start, [1.2, 17.8, -6]], [w.naka.start, [0, 21.5, -22.5]],
      ...flight, [g + 0.17, [13.6, 7.8, -75.5]], [g + 0.67, [15.2, 8.3, -72.3]],
    ]);
    this.dive = spline([this.camB(nana), [13, 9.4, -60], [8, 11.8, -47], [3.2, 14.2, -35.5], [0.2, 14.3, -26.6]]);
  }

  // ---------------------------------------------------------------- the flock

  private frame(t: number) {
    const P = this.F(t), Fw = norm(sub(this.F(t + 0.05), this.F(t - 0.05)));
    const s = cross(Fw, [0, 1, 0]), S: V3 = len(s) < 1e-3 ? [1, 0, 0] : norm(s);
    return { P, F: Fw, S, U: cross(S, Fw) };
  }

  /** how far the pocket's front bows out: packed, jumping, burst, empty, filling again */
  private bulge(t: number) {
    const w = this.w, kw = w.kwento.start;
    if (t < kw) return 0.9 + 0.3 * (knock(t - w.may.start) + knock(t - w.mga.start));
    return lerp(0.9 + 1.4 * knock(t - kw), 0.25, prog(t, kw + 0.1, kw + 1.4, ease.outCubic)) + 0.7 * prog(t, 92.3, 93.3, ease.inOutSine);
  }
  private jolt(t: number) {
    const w = this.w, kw = w.kwento.start;
    let j = knock(t - w.may.start) + knock(t - w.mga.start);
    for (const b of this.beatsAll) if (b < kw) j += 0.5 * knock(t - b);
    return j + 0.4 * prog(t, kw - 0.45, kw) * (0.5 + 0.5 * noise1(t * 20, 3));
  }

  private at(t: number) {
    let m = this.memo.get(t);
    if (!m) this.memo.set(t, (m = { jolt: this.jolt(t), bulge: this.bulge(t), beat: decay(t, this.beatsAll, 0.15) }));
    return m;
  }

  /** its place in the pocket (it lies flat there, before and after) */
  private pile(n: Note, t: number): V3 {
    const y = 4.4 - n.py * 8.2, m = this.at(t);
    const xm = y > -2.4 ? 3.3 : 3.3 * clamp((y + 4.5) / 2.1, 0.1, 1);
    const x = (n.px * 2 - 1) * xm;
    const j = m.jolt * (1.2 - n.py);
    const z = -0.3 + n.pz * 0.4 + m.bulge * 0.5 * Math.max(0, 1 - (x / 4) ** 2);
    return [PK.c[0] + x + noise1(t * 7, n.id) * 0.04 * j, PK.c[1] + y + 0.25 * j, PK.c[2] + z];
  }

  /** out of the pocket and into its slot in the flock */
  private flock(n: Note, t: number): V3 {
    const kw = this.w.kwento.start, tau = t - n.te, k = 2.4;
    const pB = madd((n.pe ??= this.pile(n, n.te)), n.v0, (1 - Math.exp(-k * tau)) / k);
    const ts = t - n.lag;
    const wF = smoothstep(n.te + 0.15, n.te + 1.3, t) * smoothstep(kw + 0.05, kw + 0.6, ts);
    if (wF <= 0) return pB;
    const f = this.frame(ts);
    const spread = lerp(1.5, 1, prog(t, 85.3, 86.3)) * (1 + 0.12 * this.at(t).beat);
    const a = n.om * (t - kw), ca = Math.cos(a), sa = Math.sin(a);
    const sx = (n.sx * ca - n.sy * sa) * spread, sy = (n.sx * sa + n.sy * ca) * spread;
    const wob: V3 = [noise1(t * 0.9, n.id) * 0.4, noise1(t * 1.1, n.id + 500) * 0.35, noise1(t * 0.8, n.id + 900) * 0.4];
    return mix3(pB, add(madd(madd(f.P, f.S, sx), f.U, sy), wob), wF);
  }

  private sheetC(t: number): V3 {
    return madd(S0, SU, 0.06 * Math.sin(t * 1.3));
  }

  /** wheeling round the letter */
  private ring(n: Note, t: number): V3 {
    const a = n.th + n.rw * (t - this.w.gusto.start), r = n.rr * (1 + 0.08 * this.at(t).beat);
    const wob: V3 = [noise1(t * 0.7, n.id + 40) * 0.3, noise1(t * 0.9, n.id + 80) * 0.3, noise1(t * 0.6, n.id + 120) * 0.3];
    return add(madd(madd(madd(this.sheetC(t), SR, r * Math.cos(a)), SU, 0.8 * r * Math.sin(a)), SN, n.dz), wob);
  }

  private airborne(n: Note, t: number): V3 {
    const p = this.flock(n, t), wR = smoothstep(n.tr, n.tr + 0.8, t);
    return wR > 0 ? mix3(p, this.ring(n, t), wR) : p;
  }

  private notePos(n: Note, t: number): V3 {
    if (t < n.te || t >= n.ta) return this.pile(n, t);
    if (t < n.ts) return this.airborne(n, t);
    // folded, diving back in: an arc from where it was over the pocket and down into it
    const P0 = (n.p0 ??= this.airborne(n, n.ts)), P2 = this.pile(n, t);
    const C: V3 = [lerp(P0[0], P2[0], 0.5) + n.side, P2[1] + n.lift, lerp(P0[2], P2[2], 0.6)];
    return bez(P0, C, P2, prog(t, n.ts, n.ta, ease.inQuad));
  }

  /** a note's pose: where, which way it's flying, its wings' fold */
  private noteXf(n: Note, t: number) {
    const p = this.notePos(n, t), dt = 0.012;
    const v = mul(sub(this.notePos(n, t + dt), this.notePos(n, t - dt)), 1 / (2 * dt));
    const sp = len(v), wv = smoothstep(0.3, 3, sp);
    const f0: V3 = [-Math.sin(n.rot), Math.cos(n.rot), 0];
    const fwd = norm(add(mul(f0, 1 - wv), mul(v, wv / Math.max(sp, 1e-6))));
    const up0 = norm(mix3([0, 1, 0], [0, 0, 1], smoothstep(0.75, 0.97, Math.abs(fwd[1]))));
    const up = norm(mix3([0, 0, 1], up0, wv));
    const nana = this.w.nana.start;
    const flap = 0.5 + 0.32 * Math.sin(TAU * n.f * t + n.ph);
    let beta = lerp(0.12, flap, smoothstep(n.te, n.te + 0.25, t));
    beta = lerp(beta, 1.47, prog(t, Math.max(nana - 0.05, n.ts - 0.3), n.ts + 0.15, ease.outCubic));
    if (t > n.ta) beta = lerp(1.47, 0.12, prog(t, n.ta, n.ta + 0.3));
    return { p, fwd, up, beta };
  }

  // ---------------------------------------------------------------- the letter

  private sheet(t: number) {
    const w = this.w, n = this.hero, g = w.gusto.start;
    if (t < n.te || t >= n.ta) return { c: this.pile(n, t), R: [1, 0, 0] as V3, U: [0, 1, 0] as V3, sc: 0.13, a: SHUT, b: SHUT };
    const flapB = Math.PI - 0.3 - 0.3 * Math.sin(TAU * 2.6 * t);
    let a = SHUT, b = lerp(SHUT, flapB, smoothstep(n.te, n.te + 0.3, t)), sc = 0.13;
    const f = this.frame(t - n.lag);
    const u = prog(t, g, g + 0.7, ease.inOutCubic);
    let c = add(mix3(this.flock(n, t), this.sheetC(t), u), [0, 1.5 * Math.sin(Math.PI * u), 0]);
    let R = norm(mix3(f.S, SR, u)), U = norm(mix3(f.F, SU, u));
    U = norm(madd(U, R, -dot(U, R)));
    sc = lerp(0.13, 1, ease.outExpo(prog(t, g + 0.17, g + 0.87)));
    b = lerp(b, 0, ease.outBackSoft(prog(t, g + 0.32, g + 0.77)));
    a = lerp(a, 0, ease.outBackSoft(prog(t, g + 0.62, g + 1.07)));
    // on "Pero" it folds itself shut again, and shrinks back into a note
    a = lerp(a, SHUT, prog(t, 91.2, 91.47, ease.inCubic));
    b = lerp(b, SHUT - 0.02, prog(t, 91.3, 91.55, ease.inCubic));
    sc *= lerp(1, 0.13 / Math.max(sc, 1e-3), prog(t, 91.35, 91.62, ease.inOutCubic));
    sc *= 1 + 0.025 * decay(t, this.beatsAll, 0.15) * smoothstep(g + 1, g + 1.2, t);
    if (t >= n.ts) {
      const P0 = mix3(this.flock(n, n.ts), this.sheetC(n.ts), 1), P2 = this.pile(n, t);
      const C: V3 = [lerp(P0[0], P2[0], 0.5) + n.side, P2[1] + n.lift, lerp(P0[2], P2[2], 0.6)];
      c = bez(P0, C, P2, prog(t, n.ts, n.ta, ease.inQuad));
      const k = prog(t, n.ts, n.ts + 0.3);
      R = norm(mix3(R, [1, 0, 0], k));
      U = norm(mix3(U, [0, 1, 0], k));
      U = norm(madd(U, R, -dot(U, R)));
    }
    return { c, R, U, sc, a, b };
  }

  // ---------------------------------------------------------------- the camera

  private camB(t: number): V3 {
    const g = this.w.gusto.start;
    return vkeys(t, [
      [g + 0.17, [13.6, 7.8, -75.5]], [g + 0.72, [15.2, 8.3, -72.3], ease.outCubic], [this.w.ilabas.start, [15.35, 8.35, -72.9]],
      [this.w.pero.start, [15.3, 8.4, -72.4]], [this.w.nana.start, [15.1, 8.4, -71.8]],
    ]);
  }

  private camera(t: number): Cam {
    const w = this.w, c0: number = this.params.cut, next: number = this.params.next;
    const kw = w.kwento.start, g = w.gusto.start, nana = w.nana.start;
    // position: the swoop and the flight, braking at the letter, then the dive
    let pos = this.camA(t);
    const wB = prog(t, g - 0.08, g + 0.67, ease.inOutCubic);
    if (wB > 0) pos = mix3(pos, this.camB(t), wB);
    const u = prog(t, nana, next, ease.inQuad);
    if (u > 0) pos = this.dive(u);
    // looking: at the pocket, up after the burst, ahead of the flock, at the letter, at the light
    let tgt = vkeys(t, [
      [c0, [0, 10, -26]], [kw, [0, 14.5, -24]], [kw + 0.4, [0, 19.5, -24.5], ease.outCubic],
      [w.dibdib.start, [-0.3, 21.5, -28]], [w.naka.start, [-1, 20, -36]],
    ]);
    tgt = mix3(tgt, this.F(t + 0.45), prog(t, w.naka.start - 0.3, w.naka.start + 0.35, ease.inOutSine));
    tgt = mix3(tgt, madd(this.sheetC(t), SN, 0.6 * prog(t, w.ilabas.start, w.ilabas.start + 0.4)), wB);
    tgt = mix3(tgt, G, prog(t, nana - 0.05, nana + 0.55, ease.inOutCubic));
    // bank into the flock's turns, and a turn of the screw on the way in
    const tb = t - 0.32, f = this.frame(tb);
    const acc = mul(add(sub(this.F(tb + 0.1), mul(this.F(tb), 2)), this.F(tb - 0.1)), 100);
    const bank = clamp(-0.03 * dot(acc, f.S), -0.65, 0.65) * prog(t, w.naka.start, w.naka.start + 0.4) * (1 - wB);
    const roll = bank + 0.05 * noise1(t * 0.6, 4) - 0.55 * ease.inCubic(u);
    const fov = keys(t, [
      [c0, 46], [kw - 0.1, 44], [kw + 0.12, 54, ease.outCubic], [w.dibdib.start, 50], [w.naka.start + 0.1, 60],
      [g - 0.2, 62], [g + 0.2, 50], [g + 0.8, 46], [w.ilabas.start + 0.3, 50], [nana, 48], [nana + 0.8, 60], [next, 72, ease.inQuad],
    ]);
    return handheld({ pos, tgt, roll, fov }, t, 0.006, 0.9, 8);
  }

  // ---------------------------------------------------------------- the frame

  render(f: Frame, out: RT): Post {
    const t = f.t, w = this.w, next: number = this.params.next;
    const kw = w.kwento.start, g = w.gusto.start, nana = w.nana.start;
    const b: Basis = basis(this.camera(t));
    const light = lightOf(this.liwanag(t));
    const boom = decay(t, [kw], 0.45), home = prog(t, 92.4, next, ease.inQuad);
    this.memo.clear();

    // LOOB at this sub-frame's slot on the 12-sample grid, marched only when the slot changes
    const t0 = f.frame / FPS, cell = 0.5 / FPS / LOOB_SUB;
    const tq = t0 + (Math.floor((t - t0) / cell + 1e-6) + 0.5) * cell;
    const depth = loobRT!;
    if (tq !== loobKey) {
      const lq = lightOf(this.liwanag(tq)), bq = decay(tq, [kw], 0.45), hq = prog(tq, 92.4, next, ease.inQuad);
      loob!.draw(out, depth, basis(this.camera(tq)), tq, { ...LOOB_B, glow: G, glowI: lq * (1.2 + 3 * bq + 5 * hq), glowR: 0.1 });
      loobKey = tq;
    } else copy!.draw(out, { uSrc: depth });
    flies!.draw(out, b, { t, centre: b.pos, depth, fog: [25, 0.015], rise: 0.9, density: 0.75 });

    // the pocket and the light in it
    if (t < g || t > nana) {
      lines!.clear();
      pocket(lines!, { ...PK, bulge: this.bulge(t), col: mul(DENIM, 1 + 0.8 * boom + 0.6 * decay(t, [w.may.start, w.mga.start], 0.15)) });
      lines!.draw(out, b, { depth, fog: [40, 0.01] });
    }
    const sc = 4, off = self!.chest({ pos: [0, 0, 0], pose: POSE.shy, scale: sc });
    self!.draw(out, b, t, { pos: sub(G, off), pose: POSE.shy, scale: sc, noBody: true, light: light * (1.4 + 2.5 * boom + 3 * home) }, { depth });

    // the notes, and the letter
    const P = paper!.clear();
    for (const n of this.notes) {
      const x = this.noteXf(n, t);
      P.note(x.p, x.fwd, x.up, n.len, n.wing, x.beta, 1, n.tone);
    }
    const s = this.sheet(t);
    P.sheet(s.c, s.R, s.U, SW * s.sc, SH * s.sc, s.a, s.b, 1, 1, 0.8);
    const refold = prog(t, 91.2, 91.5);
    const reveal = prog(t, g + 0.92, g + 2.3, ease.inOutSine) * (1 - refold);
    const toSheet = prog(t, g, g + 0.7, ease.inOutCubic);
    // the stories' own warmth, travelling with the flock; then a soft wash on the page
    const l2: V3 = mix3(this.F(t), madd(this.sheetC(t), SN, 4.5), toSheet);
    const l2I = lerp(2.4 * prog(t, kw, kw + 0.8), 1.1 + 1.6 * reveal, toSheet) * (1 - prog(t, nana - 0.3, nana + 0.3));
    P.draw(out, b, {
      depth, nearFade: 1,
      lights: [{ pos: G, col: mul(GOLD, light * (10 + 20 * boom + 25 * home)) }, { pos: l2, col: mul(GOLD, light * l2I) }],
      key: [0.25, 1, 0.35], keyCol: [0.1, 0.12, 0.22], amb: [0.03, 0.036, 0.07],
      reveal, inkI: light * 1.4 * (1 + 0.6 * decay(t, this.beatsAll, 0.2)),
    });

    // KWENTO out of the pocket after the notes; ILABAS up off the page
    const W = this.W.clear();
    const kc = w.kwento.c, kwW = (this.kwento.w * KW_H) / EM;
    if (t > kw - 0.1 && t < w.naka.start + 0.6) {
      const mouth: V3 = [0, 16.2, -24];
      W.word(this.kwento, {
        pos: KW_POS, height: KW_H, col: COOL,
        each: (i, uu) => {
          const t0 = (kc[i] ?? kw + 0.1 * i) - 0.08, k = prog(t, t0, t0 + 0.42, ease.outCubic);
          if (t < t0) return { alpha: 0 };
          const homeP = madd(KW_POS, [1, 0, 0], (uu - 0.5) * kwW);
          const sgn = hash(i, 13) < 0.5 ? -1 : 1;
          const fd = prog(t, w.naka.start - 0.05 + 0.04 * i, w.naka.start + 0.3 + 0.04 * i, ease.inOutCubic);
          const thump = 0.09 * knock(t - w.dibdib.start) + 0.05 * knock(t - (w.dibdib.c[3] ?? w.dibdib.start + 0.3));
          return {
            off: add(mul(sub(mouth, homeP), 1 - k), [0, 2.2 * Math.sin(Math.PI * k), 0]),
            scale: (0.25 + 0.75 * ease.outBack(prog(t, t0, t0 + 0.3))) * (1 + thump) * (1 - 0.3 * fd),
            spin: (1 - k) * sgn * 2.5, tilt: sgn * fd * Math.PI * 0.5,
            col: mul(mix3(mul(GOLD, light * 2.4), mul(COOL, 1.1), smoothstep(0.2, 0.9, k)) as RGB, 1 + 1.2 * decay(t, [kc[i] ?? kw], 0.12)),
            alpha: 1 - smoothstep(0.75, 1, fd),
          };
        },
      });
    }
    const ic = w.ilabas.c;
    if (t > w.ilabas.start - 0.1 && t < 91.6) {
      W.word(this.ilabas, {
        pos: madd(this.sheetC(t), SU, 0.25), right: SR, up: SU, height: IL_H, col: IL_COL,
        each: (i) => {
          const t0 = (ic[i] ?? w.ilabas.start + 0.08 * i) - 0.06;
          if (t < t0) return { alpha: 0 };
          const k = ease.outBack(prog(t, t0, t0 + 0.3));
          const falter = 1 - 0.2 * prog(t, w.pero.start, w.pero.start + 0.3, ease.outCubic);
          const sink = prog(t, 91.2 + 0.02 * i, 91.45 + 0.02 * i, ease.inCubic);
          const shiver = 0.05 * prog(t, w.pero.start, w.pero.start + 0.1);
          return {
            off: add(mul(SN, (0.05 + 2.1 * k * falter) * (1 - sink)), [noise1(t * 23, i) * shiver, noise1(t * 19, i + 7) * shiver, 0]),
            spin: noise1(t * 17, i + 3) * shiver * 2,
            col: mul(IL_COL, light * 3 * (1 + 1.5 * decay(t, [ic[i] ?? w.ilabas.start], 0.12))),
            alpha: prog(t, t0, t0 + 0.08) * (1 - smoothstep(0.6, 1, sink)),
          };
        },
      });
    }
    W.draw(out, b, { depth, nearFade: 0.5 });

    // all light by the last frame, so both sides of the cut are the same gold
    const k = diveOut(t, next - 1 / FPS, 0.5);
    fill!.draw(out, DIVE_COL, k, 'over');

    const hits = mergePost(
      impact(t, [kw], { flash: 0.3, ca: 1, shake: 14, seed: 1 }),
      impact(t, kc.slice(1), { ca: 0.3, shake: 4, seed: 2, tau: 0.12 }),
      impact(t, [...this.barsAll, w.naka.start], { ca: 0.5, shake: 6, seed: 3, tau: 0.18 }),
      impact(t, [g], { ca: 0.6, shake: 8, seed: 4 }),
      impact(t, [g + 0.77, g + 1.07], { ca: 0.45, shake: 5, seed: 5, tau: 0.15 }),
      impact(t, [w.ilabas.start], { flash: 0.15, ca: 0.8, shake: 10, seed: 6 }),
      impact(t, [w.pero.start], { ca: 0.4, shake: 3, seed: 7 }),
      impact(t, [91.47], { ca: 0.6, shake: 8, seed: 8, tau: 0.15 }),
      impact(t, [nana], { ca: 0.7, shake: 6, seed: 9, tau: 0.3 }),
    );
    return towardDive(mergePost(POST, hits), k);
  }
}
