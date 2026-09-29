// 09 · ENTABLADO — "Pinapanood ko silang sumikat / Sa entablado ng ating paaralan / Ako
// nama'y nanonood lang / Nakatalikod, ngumingiti nang lihim". A line-art school hall.
// Out of the gold we leave the self's chest as their gaze: a rush up the aisle over the
// seated audience to the stage. On "sumikat" the spots slam on one by one and SUMIKAT
// stands up over the proscenium; the camera circles the stage until it looks back over the
// performers at the dark hall, where at the far back door one small warm light is watching.
// A crane over the heads back to it. The self turns away, the camera comes round through
// the doorway to their front, and pushes in on the smile they keep to themselves.

import { sans, serif } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics, type Line, type Word } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, frameIdx, hash, keys, lerp, noise1, prog, smoothstep, TAU } from '../../engine/util';
import { basis, cam, handheld, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, madd, mix3, mul, norm, rotY, sub, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { beats, decay, DIVE_COL, diveIn, Fill, impact, mergePost, towardDive } from './_fx';
import {
  Crowd, figure, groundGrid, INK, lerpPose, POSE, rect, stage, Sky, toWorld, wireBox,
  type Member, type Pose,
} from './_labas';
import { lightOf, Self } from './_self';
import { Beams, type Beam } from './_entablado_beams';
import { facing, LyricTrack, TONE, VOICE, type Place } from './_lyric';

let sky: Sky | null = null, self: Self | null = null, fill: Fill | null = null, beams: Beams | null = null;

const FOG: [number, number] = [16, 0.016];
/** the hall: half-width, front and back walls, eaves, ridge */
const HW = 11, Z0 = -17.5, Z1 = 14.5, EAVE = 7.5, RIDGE = 10;
/** the stage (faces +z), its platform height and footprint */
const STAGE_AT: V3 = [0, 0, -12], TOP = 1.1;
const STAGE_FOOT: [number, number, number, number] = [6, -15, -9, TOP];
/** the self, in the back doorway */
const SELF_POS: V3 = [0, 0, 14.3];
const SELF_CHEST: V3 = [0, 1.33, 14.3];
const SELF_INK = mul(lin('paper'), 0.62);
const COOL: RGB = [0.78, 0.88, 1.0], ICE: RGB = [0.6, 0.76, 1.0];

/** walls, windows, roof trusses, the lamp bar, benches: the hall around the stage */
function hall(L: LineBatch) {
  const col = INK.dim, a = 0.75, w = 1;
  for (const s of [-1, 1]) {
    const x = s * HW;
    L.seg([x, 0, Z0], [x, 0, Z1], w, col, a);
    L.seg([x, EAVE, Z0], [x, EAVE, Z1], w, col, a);
    for (let z = Z0; z <= Z1 + 0.01; z += 3.2) L.seg([x, 0, z], [x, EAVE, z], w, col, a * 0.8);
    for (let z = Z0 + 1.6; z < Z1; z += 3.2) {
      rect(L, [x, 4.1, z], [0, 0, 1], [0, 1, 0], 1.05, 1.25, w, col, a * 0.6);
      L.seg([x, 2.85, z], [x, 5.35, z], w, col, a * 0.35);
      L.seg([x, 4.1, z - 1.05], [x, 4.1, z + 1.05], w, col, a * 0.35);
    }
  }
  // front wall behind the stage, back wall with the door
  L.poly([[-HW, 0, Z0], [HW, 0, Z0], [HW, EAVE, Z0], [0, RIDGE, Z0], [-HW, EAVE, Z0]], w, col, a, true);
  const dw = 1.3, dh = 2.7;
  L.poly([[-HW, 0, Z1], [-dw, 0, Z1], [-dw, dh, Z1], [dw, dh, Z1], [dw, 0, Z1], [HW, 0, Z1], [HW, EAVE, Z1], [0, RIDGE, Z1], [-HW, EAVE, Z1]], w, col, a, true);
  L.poly([[-dw - 0.12, 0, Z1], [-dw - 0.12, dh + 0.12, Z1], [dw + 0.12, dh + 0.12, Z1], [dw + 0.12, 0, Z1]], w, col, a * 0.6);
  for (const s of [-1, 1]) rect(L, [s * 6, 4.1, Z1], [1, 0, 0], [0, 1, 0], 1.6, 1.2, w, col, a * 0.55);
  // the roof: a truss every bay
  for (let z = Z0; z <= Z1 + 0.01; z += 3.2) {
    L.poly([[-HW, EAVE, z], [0, RIDGE, z], [HW, EAVE, z]], w, col, a * 0.7);
    L.seg([-HW, EAVE, z], [HW, EAVE, z], w, col, a * 0.5);
    for (const s of [-1, 1])
      for (const f of [1 / 3, 2 / 3]) {
        const x = s * HW * (1 - f), y = EAVE + (RIDGE - EAVE) * f;
        L.seg([x, EAVE, z], [x, y, z], w, col, a * 0.4);
        L.seg([x, EAVE, z], [s * HW * (1 - f - 1 / 3), EAVE + (RIDGE - EAVE) * (f + 1 / 3), z], w, col, a * 0.3);
      }
  }
  L.seg([0, RIDGE, Z0], [0, RIDGE, Z1], w, col, a * 0.7);
  // the lamp bar over the audience
  const bz = 1.5, by = 7.25;
  L.seg([-7.5, by + 0.15, bz], [7.5, by + 0.15, bz], w, col, a);
  L.seg([-7.5, by - 0.15, bz], [7.5, by - 0.15, bz], w, col, a);
  for (let k = 0; k < 20; k++) {
    const x0 = -7.5 + k * 0.75;
    L.seg([x0, by - 0.15, bz], [x0 + 0.75, by + 0.15, bz], w, col, a * 0.6);
  }
  for (const [x, y, z] of LAMPS) wireBox(L, [x, y + 0.12, z], [0.16, 0.16, 0.22], 0, w, INK.line, 0.9);
  // a banner on the stage's back wall
  rect(L, [0, 4.2, -14.8], [1, 0, 0], [0, 1, 0], 4.2, 1.0, w, INK.line, 0.5);
  L.seg([-4.2, 5.2, -14.8], [-4.8, EAVE, -14.8], w, col, a * 0.4);
  L.seg([4.2, 5.2, -14.8], [4.8, EAVE, -14.8], w, col, a * 0.4);
}

/** the lamps' apexes: bar left / right / centre, wall left / right, over the stage */
const LAMPS: V3[] = [[-4.6, 7.25, 1.5], [4.6, 7.25, 1.5], [0, 7.3, 1.5], [-10.4, 6.6, -6.5], [10.4, 6.6, -6.5], [0, 9.6, -11.5]];

const ROWS = 13, ROW0 = -5.8, ROW_DZ = 1.15;

/** the seated audience (plus a few standing at the back), and their benches */
function audience(L: LineBatch): Member[] {
  const out: Member[] = [];
  const sitUp: Pose = { ...POSE.sit, armR: [0.2, 2.5, 0.3] };
  for (let r = 0; r < ROWS; r++) {
    const z = ROW0 + r * ROW_DZ;
    for (let x = -7.6; x <= 7.61; x += 0.8) {
      if (Math.abs(x) < 1) continue;
      const i = r * 40 + Math.round(x * 10);
      if (hash(i, 3, 1) < 0.1) continue;
      out.push({
        pos: [x + (hash(i, 3, 2) - 0.5) * 0.16, 0, z + (hash(i, 3, 3) - 0.5) * 0.12],
        yaw: Math.PI + (hash(i, 3, 4) - 0.5) * 0.35, scale: 0.9 + 0.15 * hash(i, 3, 5),
        pose: hash(i, 3, 6) < 0.06 ? sitUp : POSE.sit,
      });
    }
    // the bench behind them
    for (const s of [-1, 1]) {
      const x0 = s * 1.0, x1 = s * 8.0, bz = z + 0.32;
      L.seg([x0, 0.47, bz], [x1, 0.47, bz], 1, INK.dim, 0.6);
      L.seg([x0, 0.47, bz + 0.3], [x1, 0.47, bz + 0.3], 1, INK.dim, 0.35);
      for (const x of [x0, x1]) L.seg([x, 0, bz + 0.15], [x, 0.47, bz + 0.15], 1, INK.dim, 0.5);
    }
  }
  for (let k = 0; k < 14; k++) {
    const s = k % 2 ? 1 : -1, x = s * (2 + 5.5 * hash(k, 7, 1)), z = 10.6 + 1.6 * hash(k, 7, 2);
    out.push({ pos: [x, 0, z], yaw: Math.PI + (hash(k, 7, 3) - 0.5) * 0.5, pose: hash(k, 7, 4) < 0.3 ? POSE.talk : POSE.stand });
  }
  return out;
}

const PERFORMERS: Member[] = [
  { pos: [-3.3, TOP, -11.1], yaw: 0.2, pose: POSE.talk },
  { pos: [-1.6, TOP, -10.6], yaw: 0.08, pose: POSE.cheer },
  { pos: [0, TOP, -11.4], yaw: 0, pose: POSE.cheer },
  { pos: [1.6, TOP, -10.7], yaw: -0.1, pose: POSE.laugh },
  { pos: [3.3, TOP, -11.1], yaw: -0.2, pose: POSE.talk },
];

/** where along a quadratic Bézier */
const bez = (a: V3, c: V3, b: V3, u: number): V3 => mix3(mix3(a, c, u), mix3(c, b, u), u);

export default class Entablado extends Scene {
  maxSamples = 36;
  private lines = new LineBatch(20000);
  private crowd!: Crowd;
  private stars!: Crowd;
  private smile = new LineBatch(32);
  private W = new Words();
  private sumikat!: WordShape;
  private lihim!: WordShape;
  /** the lines, for the hero words' audit marks */
  private ln!: { l1: Line; l4: Line };
  private track!: LyricTrack;
  /** "Pero nanahimik na lang", carried over the cut: drawn over the gold */
  private W2 = new Words();
  private over!: LyricTrack;
  private sung!: { pinapanood: Word; sumikat: Word; sa: Word; paaralan: Word; nanonood: Word; nakatalikod: Word; ngumingiti: Word; lihim: Word };
  private T!: { cut: number; next: number; lit: number; hit: number; orbit0: number; crane0: number; crane1: number; turn0: number; turn1: number; orb0: number; orb1: number };

  async init() {
    sky ??= new Sky();
    self ??= new Self();
    fill ??= new Fill();
    beams ??= new Beams();
    groundGrid(this.lines, { extent: 42, step: 1.6, seg: 48, alpha: 0.32 });
    hall(this.lines);
    stage(this.lines, STAGE_AT, { size: [12, 6, TOP], arch: 5.5, folds: 6, col: INK.line, alpha: 0.9 });
    this.crowd = new Crowd(audience(this.lines), { w: 1, col: mul(INK.line, 0.85), alpha: 0.85, seed: 2 });
    this.stars = new Crowd(PERFORMERS, { w: 1.3, col: mul(lin('paper'), 0.8), seed: 5 });

    this.sumikat = this.W.shape('SUMIKAT', sans(100, 800, 'extra-condensed', 2));
    this.lihim = this.W.shape('lihim', serif(100, 380, true));

    const L = this.lyrics, s0 = this.ctx.start;
    const l1 = L.find('Pinapanood', s0 - 1), l2 = L.find('Sa entablado', s0), l3 = L.find('nanonood lang', s0), l4 = L.find('Nakatalikod', s0);
    const w = Lyrics.word;
    this.sung = {
      pinapanood: w(l1, 'pinapanood'), sumikat: w(l1, 'sumikat'), sa: w(l2, 'sa'), paaralan: w(l2, 'paaralan'),
      nanonood: w(l3, 'nanonood'), nakatalikod: w(l4, 'nakatalikod'), ngumingiti: w(l4, 'ngumingiti'), lihim: w(l4, 'lihim'),
    };
    const S = this.sung, A = this.audio, cut: number = this.params.cut, next: number = this.params.next;
    const turn0 = S.nakatalikod.start, turn1 = turn0 + 0.8;
    this.T = {
      cut, next, lit: S.sumikat.start - 0.05, hit: A.timeOfBar(Math.round(A.barAt(S.sumikat.start))),
      orbit0: S.sa.start - 0.05, crane0: S.paaralan.end - 0.4, crane1: S.nanonood.end - 0.05,
      turn0, turn1, orb0: turn1 - 0.1, orb1: S.ngumingiti.start + 0.3,
    };
    this.ln = { l1, l4 };
    this.stageLyrics(L.find('nanahimik na lang', s0 - 4), l1, l2, l3, l4);
  }

  /**
   * Every other word. The last of the previous line in ink on the gold of the cut; the
   * stage lines across the banner over the stage, "ng ating" over the stage front as the
   * orbit swings off the banner, PAARALAN hanging in the centre spot's beam; "Ako nama'y" over the back door, "nanonood lang" small beside the self in it;
   * "Nakatalikod," on their other side; "ngumingiti / nang" by their face at the end,
   * before their own "lihim".
   */
  private stageLyrics(l0: Line, l1: Line, l2: Line, l3: Line, l4: Line) {
    const T = this.T, S = this.sung, w = Lyrics.word;
    // ink while the gold covers the frame, flipping to paper as the hall shows through it
    const ink = { rest: mul(lin('pencil'), 0.6), hot: mul(lin('ink'), 0.3) };
    const onGold = (k: number, _i: number, _u: number, t: number) => {
      const h = heat(l0.words[k], t), g = smoothstep(0.18, 0.3, diveIn(t, T.cut, 0.6));
      return { col: mix3(mix3(TONE.labas.rest, TONE.labas.hot, h), mix3(ink.rest, ink.hot, h), g) };
    };
    this.over = new LyricTrack(this.W2).add(l0, {
      voice: VOICE.loud, size: 0.36, wrap: 7, at: { pos: [0, 1.42, 10.7] },
      out: T.cut + 0.3, exit: 'fall', exitDur: 0.35, each: onGold,
    });

    const BANNER: Place = { pos: [0, 4.25, -14.7] };
    // as the orbit swings off the banner: over the front of the stage, near the pivot
    const ating = w(l2, 'ating'), over = facing(this.cam(ating.start + 0.2).pos, [0, 3.8, -9.5]);
    const beam = facing(this.cam(S.paaralan.start + 0.8).pos, [0, 5.4, -2.5]);
    // at the end: right-aligned just left of the self's face, in the final frame
    const wb = basis(this.selfCam(T.next - 0.05)), head = toWorld({ pos: SELF_POS, yaw: 0 }, figure(this.pose(T.next - 0.05)).head);
    const small = 0.075, wNg = this.W.shape('ngumingiti', VOICE.quiet.font, VOICE.quiet.raster).w / VOICE.quiet.raster;
    const face = madd(madd(head, wb.R, -0.2 - (wNg * small) / 2), wb.U, -0.03);
    this.track = new LyricTrack(this.W)
      .add(l1, {
        voice: VOICE.loud, size: 0.85, wrap: 12, at: BANNER, skip: ['sumikat'],
        enter: 'drop', out: S.sumikat.end - 0.05, exit: 'fall', exitDur: 0.35,
      })
      .add(l2, {
        voice: VOICE.loud, size: 0.8, wrap: 12, at: BANNER, skip: ['ng', 'ating', 'paaralan'],
        enter: 'drop', out: w(l2, 'entablado').end - 0.05, exit: 'fade',
      })
      .add(l2, {
        voice: VOICE.loud, size: 0.55, at: over, skip: ['sa', 'entablado', 'paaralan'],
        enter: 'rise', out: ating.end + 0.08, exit: 'fade', exitDur: 0.3,
      })
      .add(l2, {
        voice: VOICE.loud, size: 1.1, at: beam, skip: but(l2, S.paaralan),
        enter: 'rise', spread: 0.5, out: S.paaralan.end + 0.05, exit: 'burst', exitDur: 0.3,
      })
      .add(l3, {
        voice: VOICE.quiet, size: 0.85, at: { pos: [0, 3.7, 14.4], right: [-1, 0, 0] }, skip: ['nanonood', 'lang'],
        enter: 'drop', out: w(l3, 'nama').end + 0.1, exit: 'fade',
      })
      .add(l3, {
        voice: VOICE.quiet, size: 0.15, at: { pos: [0.86, 1.45, 14.22], right: [-1, 0, 0] }, skip: but(l3, S.nanonood, w(l3, 'lang')),
        enter: 'rise', out: w(l3, 'lang').end + 0.3, exit: 'fade',
      })
      .add(l4, {
        voice: VOICE.quiet, size: 0.15, at: { pos: [-0.86, 1.62, 14.22], right: [-1, 0, 0] }, skip: but(l4, S.nakatalikod),
        enter: 'rise', out: T.orb0 + 0.3, exit: 'fade',
      })
      .add(l4, {
        voice: VOICE.quiet, size: small, layout: 'stack', align: 1, at: { pos: face, right: wb.R, up: wb.U },
        skip: but(l4, S.ngumingiti, w(l4, 'nang')), enter: 'rise', travel: 0.5, exit: 'none',
      });
  }

  // ---------------------------------------------------------------- the camera

  /** the self's gaze: out of their chest, up the aisle over the heads to the stage */
  private gazeCam(t: number): Cam {
    const u = ease.inOutCubic(prog(t, this.T.cut + 0.05, this.T.lit - 0.15));
    const arc = Math.sin(Math.PI * u);
    const pos: V3 = [0.35 * arc, lerp(1.33, 2.4, u) + 1.5 * arc, lerp(14.15, -3.4, u)];
    return cam(pos, [0, lerp(1.8, 3.0, u), -12], lerp(46, 42, u), 0.03 * arc);
  }

  /** knocked back by the light: the stage, the spots and SUMIKAT over the proscenium */
  private litCam(t: number): Cam {
    const d = t - this.T.lit;
    return handheld(cam([0.9 - 0.3 * d, 3.1 + 0.15 * d, 2.6 + 0.4 * d], [0, 5.0, -11], 50), t, 0.004, 0.7, 3);
  }

  /** round the stage until we look back over the performers at the hall */
  private orbitCam(t: number): Cam {
    const T = this.T, u = ease.inOutSine(prog(t, T.orbit0, T.crane0));
    const yaw = lerp(0.12, 2.75, u), r = lerp(10.5, 4.4, u);
    const pos: V3 = [Math.sin(yaw) * r, lerp(5.2, 3.5, u), -11 + Math.cos(yaw) * r];
    const tgt = mix3([0, lerp(5.0, 2.6, u), -11.5], [0, 1.5, 6], smoothstep(0.45, 1, u));
    return cam(pos, tgt, lerp(48, 44, u));
  }

  /** a crane up over the heads and down to the self's front, in the doorway */
  private craneCam(t: number): Cam {
    const T = this.T, u = ease.inOutCubic(prog(t, T.crane0, T.crane1));
    const c0 = this.orbitCam(T.crane0);
    const pos = bez(c0.pos, [1.4, 8.4, 1], this.selfCam(T.crane1).pos, u);
    const tgt = mix3(c0.tgt, add(SELF_CHEST, [0, 0.1, 0]), smoothstep(0.05, 0.85, u));
    return cam(pos, tgt, lerp(44, 40, u));
  }

  /** with the self: they turn away; round through the doorway to their front; the push */
  private selfCam(t: number): Cam {
    const T = this.T;
    const push = prog(t, this.sung.ngumingiti.start, T.next, ease.inOutSine);
    const yaw = keys(t, [[T.crane1, 2.96], [T.orb0, 2.86, ease.linear], [T.orb1, 0.32, ease.inOutCubic], [T.next, 0.14, ease.outSine]]);
    const dip = Math.sin(Math.PI * prog(t, T.orb0, T.orb1)) * 1.25;
    const dist = keys(t, [[T.crane1, 2.77], [T.orb0, 2.6], [T.orb1, 1.8, ease.inOutSine], [T.next, 1.15, ease.inOutSine]]) - dip;
    const pitch = keys(t, [[T.crane1, 0.145], [T.orb1, 0.05], [T.next, 0.02]]);
    const tgt = mix3(add(SELF_CHEST, [0, 0.1, 0]), [SELF_CHEST[0], 1.52, SELF_CHEST[2]], push);
    const c = cam(add(tgt, [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist]), tgt,
      keys(t, [[T.crane1, 40], [T.orb1, 38], [T.next, 34]]));
    return handheld(c, t, 0.003 * (1 - push * 0.6), 0.5, 8);
  }

  private cam(t: number): Cam {
    const T = this.T;
    return shots(t, [
      { t: T.cut, cam: (t) => this.gazeCam(t) },
      { t: T.lit, cam: (t) => this.litCam(t), snap: 0.45, kick: 0.04 },
      { t: T.orbit0, cam: (t) => this.orbitCam(t), snap: 1.1, ease: ease.inOutSine },
      { t: T.crane0, cam: (t) => this.craneCam(t) },
      { t: T.crane1, cam: (t) => this.selfCam(t) },
    ]);
  }

  // ---------------------------------------------------------------- the self

  private selfYaw(t: number) {
    return Math.PI * (1 - ease.inOutCubic(prog(t, this.T.turn0, this.T.turn1)));
  }

  private pose(t: number): Pose {
    const watch: Pose = { ...POSE.stand, nod: -0.1, armL: [0.05, 0.06, 0.2], armR: [0.05, 0.06, 0.2] };
    const away: Pose = { ...POSE.shy, nod: 0.28 + 0.03 * Math.sin(t * 1.3) };
    return lerpPose(watch, away, ease.inOutSine(prog(t, this.T.turn0 - 0.1, this.T.turn1 + 0.3)));
  }

  // ---------------------------------------------------------------- the lights

  /** each spot slams on with a char of "sumikat", flickers, overshoots, settles */
  private lamp(t: number, on: number, seed: number): number {
    const a = t - on;
    if (a < 0) return 0;
    const flick = a < 0.14 ? (hash(frameIdx(t), seed, 1) < 0.6 ? 1 : 0.15) : 1;
    return flick * (1 + 0.7 * Math.exp(-a / 0.12));
  }

  private beams(t: number): Beam[] {
    const w = this.sung.sumikat, c = (i: number) => w.c[i] ?? w.start + i * 0.1;
    const wan = (k: number, s: number) => 0.45 * noise1(t * 0.35 + k, s);
    const work = 0.35 + 0.65 * this.lamp(t, c(0), 6);
    return [
      { apex: LAMPS[0], at: [-1.6 + wan(0, 1), TOP, -10.6 + wan(1, 1)], half: 0.085, I: 0.1 * this.lamp(t, c(1), 1), col: COOL, stageOnly: true },
      { apex: LAMPS[1], at: [1.6 + wan(2, 2), TOP, -10.7 + wan(3, 2)], half: 0.085, I: 0.1 * this.lamp(t, c(2), 2), col: COOL, stageOnly: true },
      { apex: LAMPS[2], at: [0, TOP, -11.4], half: 0.07, I: 0.12 * this.lamp(t, c(3), 3), col: ICE, stageOnly: true },
      { apex: LAMPS[3], at: [-0.6, TOP, -12], half: 0.11, I: 0.07 * this.lamp(t, c(4), 4), col: ICE, stageOnly: true },
      { apex: LAMPS[4], at: [0.6, TOP, -12], half: 0.11, I: 0.07 * this.lamp(t, c(5), 5), col: ICE, stageOnly: true },
      { apex: LAMPS[5], at: [0, TOP, -11.5], half: 0.42, I: 0.022 * work, col: COOL, stageOnly: true, throw: 9 },
    ];
  }

  // ---------------------------------------------------------------- render

  render(f: Frame, out: RT): Post {
    const t = f.t, T = this.T, S = this.sung;
    const c = this.cam(t), b: Basis = basis(c);
    const lit = smoothstep(S.sumikat.start - 0.05, S.sumikat.end + 0.2, t);

    sky!.draw(out, b, { band: 0.5, hor: mul(lin('slate'), 0.45) });
    beams!.draw(out, b, this.beams(t), { t, seed: frameIdx(t) % 997, stage: STAGE_FOOT, flare: 1 });
    this.lines.draw(out, b, { fog: FOG, nearFade: 0.5 });
    this.crowd.draw(out, b, { beat: f.beat, sway: 0.012, bob: 0.02 * lit, fog: FOG, nearFade: 0.5 });
    this.stars.draw(out, b, {
      beat: f.beat, sway: 0.03 + 0.07 * lit, bob: 0.05 * lit, groundY: TOP, fog: FOG, nearFade: 0.4,
      uniforms: {},
    });

    this.W.clear();
    this.wordSumikat(t, b);
    this.wordLihim(t, b);
    this.track.draw(t, b);
    this.W.draw(out, b, { fog: FOG, nearFade: 0.3 });

    // the self: watching, then turned away; the light answers the beat as they smile
    const pose = this.pose(t), yaw = this.selfYaw(t), place = { pos: SELF_POS, yaw };
    const smiling = prog(t, S.ngumingiti.start - 0.4, S.ngumingiti.start + 0.4);
    const pulse = decay(t, beats(this.audio, S.ngumingiti.start - 0.5, T.next + 1), 0.22) * smiling;
    const light = lightOf(this.liwanag(t)) * (1 + 0.5 * pulse) * (1 + 0.15 * lit * (1 - smiling));
    // from the far end of the hall the light must still read: one small warm point
    const far = smoothstep(6, 24, Math.hypot(...sub(b.pos, SELF_CHEST)));
    self!.draw(out, b, t, { ...place, pose, col: SELF_INK, w: 1.3, light, core: 0.022 * (1 + far), halo: 0.09 * (1 + 2 * far) }, { fog: FOG, nearFade: 0.35 });
    this.drawSmile(out, b, t, place, pose);

    const kick = impact(t, [T.hit], { flash: 0.08, ca: 0.6, shake: 7 });
    let post: Post = mergePost({ bloom: 0.9, grain: 0.035, vignette: 0.4 }, kick);
    const kIn = diveIn(t, T.cut, 0.6);
    if (kIn > 0) {
      fill!.draw(out, DIVE_COL, kIn, 'over');
      post = towardDive(post, kIn);
    }
    if (t < T.cut + 1) {
      this.W2.clear();
      this.over.draw(t, b);
      this.W2.draw(out, b, { fog: FOG, nearFade: 0.3 });
    }
    return post;
  }

  /** a small arc on the face, only from the front, curling up through "ngumingiti" */
  private drawSmile(out: RT, b: Basis, t: number, place: { pos: V3; yaw: number }, pose: Pose) {
    const w = this.sung.ngumingiti;
    const head = toWorld(place, figure(pose).head), fwd = rotY([0, 0, 1], place.yaw);
    const facing = smoothstep(0.35, 0.8, dotV(norm(sub(b.pos, head)), fwd));
    const a = facing * smoothstep(w.start - 0.6, w.start + 0.2, t);
    if (a <= 0) return;
    const curv = lerp(0.25, 1, ease.inOutSine(prog(t, w.start, w.end + 0.3)));
    const r = 0.052, c0 = madd(madd(head, b.U, -0.045 + 0.022 * curv), fwd, 0.02);
    const pts: V3[] = [];
    for (let k = 0; k <= 10; k++) {
      const ang = lerp(-2.55, -0.59, k / 10);
      pts.push(madd(madd(c0, b.R, Math.cos(ang) * r), b.U, (Math.sin(ang) + 0.55) * r * curv));
    }
    this.smile.clear();
    this.smile.poly(pts, 1.25, mul(SELF_INK, 1.25), a);
    this.smile.draw(out, b, { nearFade: 0.1 });
  }

  /** SUMIKAT: over the proscenium, a letter standing up with each spot */
  private wordSumikat(t: number, b: Basis) {
    const w = this.sung.sumikat;
    if (t < w.start - 0.1) return;
    const pos: V3 = [0, 7.5, -9.0];
    // world-fixed, readable only from the hall side
    const front = smoothstep(-0.1, 0.25, dotV(norm(sub(b.pos, pos)), [0, 0, 1]));
    if (front <= 0) return;
    let aSum = 0;
    this.W.word(this.sumikat, {
      pos, right: [1, 0, 0], up: [0, 1, 0], height: 1.95, col: mul(lin('paper'), 1.35), alpha: front,
      each: (i) => {
        const k = Lyrics.charProgress(w, i, t), up = ease.outBack(clamp(k * 1.4));
        const a = t - (w.c[i] ?? w.start);
        const flick = a < 0.12 ? (hash(frameIdx(t), i, 7) < 0.55 ? 1 : 0.2) : 1;
        const glow = 1 + 1.4 * Math.exp(-Math.max(a, 0) / 0.18);
        const alpha = smoothstep(0, 0.04, k) * flick;
        aSum += alpha;
        return { off: [0, (up - 1) * 1.6 + 0.04 * Math.sin(t * 2.1 + i), 0], tilt: (1 - up) * 0.9, alpha, col: mul(lin('paper'), 1.35 * glow) };
      },
    });
    LyricTrack.mark(this.ln.l1, w, b, pos, [1, 0, 0], 1.95, this.sumikat, (front * aSum) / 7);
  }

  /** lihim: the self's word, small, beside the light */
  private wordLihim(t: number, b: Basis) {
    const w = this.sung.lihim;
    if (t < w.start - 0.05) return;
    const wb = basis(this.selfCam(this.T.next - 0.05));
    const pos = madd(madd(SELF_CHEST, wb.R, 0.26), wb.U, 0.07);
    let aSum = 0;
    this.W.word(this.lihim, {
      pos, right: wb.R, up: wb.U, height: 0.09, align: 0, col: mul(lin('paper'), 0.9),
      // the whole word has to be there before the cut, which comes before it's fully sung
      each: (i) => {
        const at = lerp(w.start, Math.min(w.end, w.start + 0.3, this.T.next - 0.3), i / 4);
        const k = ease.outCubic(prog(t, at - 0.04, at + 0.16));
        aSum += k;
        return { off: mul(wb.U, (k - 1) * 0.02), alpha: k };
      },
    });
    const mid = madd(pos, wb.R, ((this.lihim.w / this.lihim.r) * 0.09) / 2);
    LyricTrack.mark(this.ln.l4, w, b, mid, wb.R, 0.09, this.lihim, aSum / 5, wb.U);
  }
}

const dotV = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** a line's words other than `keep` (to skip them) */
const but = (l: Line, ...keep: Word[]) => l.words.filter((w) => !keep.includes(w)).map((w) => w.w);

/** the kit's heat: 1 while sung, fading after */
const heat = (w: Word, t: number) => (t < w.start ? 0 : t <= w.end ? 1 : Math.exp(-(t - w.end) / 0.35));
