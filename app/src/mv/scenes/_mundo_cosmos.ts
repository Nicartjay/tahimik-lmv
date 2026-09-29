// The world MUNDO II hands to HAKBANG: one layout and one camera for both, so the cut
// between them (CONT) is the same frame on either side. The self stands on the sea at O
// (a spot the LOOB islands leave clear, with islands out towards the dawn at −z); the
// constellation of the self hangs in the sky behind it at +z, MUNDO forms over the sea
// ahead, and the camera falls out through the constellation's chest star down to the self.

import type { AudioData } from '../../engine/audio';
import { sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics } from '../../engine/lyrics';
import { cam, type Basis, type Cam } from '../../engine/3d/camera';
import { add, madd, mix3, mul, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { clamp, ease, hash, lerp, prog } from '../../engine/util';
import { lerpPose, POSE, toWorld, figure } from './_labas';
import { Flies, type LoobOpts } from './_loob';
import { Swarm, toFrame, wordPoints, type SwarmFrame } from './_mundo_fx';
import { EMBER, GOLD } from './_self';

/** where HAKBANG's self stands (checked clear of islands: see isleClearance) */
export const O: V3 = [204, 0, 120];
const at = (x: number, y: number, z: number): V3 => [O[0] + x, O[1] + y, O[2] + z];

/** the self on the sea: feet just above the calm swell, facing the dawn (−z) */
export const SELF_POS: V3 = at(0, 0.22, 0);
export const SELF_YAW = Math.PI;
export const SELF_POSE = POSE.shy;
export const SELF_CHEST: V3 = toWorld({ pos: SELF_POS, yaw: SELF_YAW }, figure(SELF_POSE).chest);

/** the constellation: the self 100× life size, arms opening, facing +z */
export const CON_POSE = lerpPose(POSE.stand, POSE.cheer, 0.4);
export const CON = { pos: at(0, 40, 380), yaw: 0, scale: 100 };
export const CHEST: V3 = toWorld(CON, figure(CON_POSE).chest);

/** MUNDO over the sea ahead of the self, facing back along +z */
export const W2: V3 = at(0, 70, -180);
export const W2_EM = 110;
const W2_FRAME: SwarmFrame = { o: W2, r: [W2_EM, 0, 0], u: [0, W2_EM, 0], n: [0, 0, W2_EM] };
export const HERO = sans(100, 800, 'extra-condensed', 4);

/** LOOB of the handover: the default night, a calm-ish sea */
export const LOOB_TAIL: Partial<LoobOpts> = { wave: 0.5, isleY: 18, isles: 0.45, haze: 0.006, lum: 0.6, stars: 0.6, dawn: 0, sunI: 0.25, sun: [0.15, 0.06, -1] };

/** the flies of the handover (same field either side of the cut) */
export const FLIES_TAIL = { n: 6000, box: 70, seed: 13, rise: 0.35 };

/** LOOB once the camera is through the star: the night of the handover, lit by the self */
export const tailLoob = (light: number): Partial<LoobOpts> => ({ ...LOOB_TAIL, steps: 80, glow: SELF_CHEST, glowI: light * 1.2, glowR: 0.1 });

export interface Tail {
  /** the frame the camera passes through the chest star (on "mundo") */
  thru: number;
  /** the camera comes to rest behind the self (on "lakas-loob") */
  land: number;
}

export function tailTimes(L: Lyrics, _A: AudioData): Tail {
  const m = L.find('May sarili rin', 138);
  const bridge = L.find('Baka isang araw');
  return { thru: toFrame(Lyrics.word(m, 'mundo').start - 0.05), land: Lyrics.word(bridge, 'lakas').start - 0.1 };
}

/** where the fall ends: low behind the self, looking past it at the horizon */
export const LAND_POS: V3 = at(0.7, 1.75, 6.2);
export const LAND_TGT: V3 = at(-0.2, 1.9, -30);

/** the camera from the chest star down to the self: one bezier, fast out of the star, easing to rest */
export function tailCam(t: number, T: Tail): Cam {
  const u = clamp((t - T.thru) / (T.land - T.thru));
  const s = ease.outCubic(u);
  const P0 = CHEST, P1 = add(CHEST, [0, -8, -190]), P2 = at(0, 34, 46), P3 = LAND_POS;
  const pos = mix3(mix3(mix3(P0, P1, s), mix3(P1, P2, s), s), mix3(mix3(P1, P2, s), mix3(P2, P3, s), s), s);
  // look ahead along the fall, then down over MUNDO at the light on the sea, then past it
  const ahead = madd(CHEST, [0, -0.03, -1], 600);
  const k1 = ease.inOutSine(clamp(u / 0.35)), k2 = ease.inOutSine(clamp((u - 0.3) / 0.7));
  const tgt = mix3(mix3(ahead, mix3(W2, at(0, 1.3, 0), 0.45), k1), LAND_TGT, k2);
  return cam(pos, tgt, lerp(58, 40, ease.inOutSine(u)), lerp(0.05, 0, s));
}

/** MUNDO's letters, 0..1 each: flown in from the sea on "mundo", flown back from ~145.6 */
export function mundoK(t: number, L: Lyrics): number[] {
  const w = Lyrics.word(L.find('May sarili rin', 138), 'mundo');
  const gone = prog(t, w.end + 1.8, w.end + 4, ease.inOutSine);
  return w.c.slice(0, 5).map((c) => prog(t, c - 1.1, c + 0.4, ease.outCubic) * (1 - gone));
}

/**
 * What both sides of the MUNDO II → HAKBANG cut draw besides LOOB and the self: the
 * firefly field and the swarm that makes MUNDO over the sea. `tw` is the (possibly
 * slowed) time the flies live in.
 */
export class Handover {
  flies = new Flies(FLIES_TAIL.n, FLIES_TAIL.box, FLIES_TAIL.seed);
  private swarm = new Swarm(3000);
  private W = new Words();
  private shape: WordShape;
  constructor() {
    const fly = mul(GOLD, 2.2), ember = mul(EMBER, 2.2);
    wordPoints('MUNDO', HERO, 2800, 21).pts.forEach((q, i) =>
      this.swarm.add(q.p, q.g, -0.8 - 0.9 * hash(i, 21, 5), hash(i, 21, 6) < 0.2 ? ember : fly, 0.7 + 0.5 * hash(i, 21, 7), 21, i),
    );
    this.shape = this.W.shape('MUNDO', HERO);
  }
  draw(out: RT, b: Basis, depth: RT, tw: number, k: number[], density = 1) {
    this.flies.draw(out, b, { t: tw, centre: b.pos, depth, fog: [25, 0.012], rise: FLIES_TAIL.rise, density });
    if (Math.max(...k) <= 0) return;
    this.swarm.draw(out, b, { t: tw, frame: W2_FRAME, k, src: [W2[0], 1, W2[2]], spread: [180, 1, 120], arc: 0.55, jit: 1.2, flare: 0.6, depth });
    // the glyphs' own glow, so the flies read as a word once they are in
    this.W.clear().word(this.shape, { pos: W2, height: W2_EM, col: mul(GOLD, 0.5), each: (i) => ({ alpha: 0.3 * (k[i] ?? 0) ** 2 }) });
    this.W.draw(out, b, { depth, blend: 'add' });
  }
}
