// 14 · ISANG HAKBANG — "Baka isang araw, konting lakas-loob / Kahit isang hakbang lang paabante /
// ’Di naman kailangang magbago agad / Pwede namang dahan-dahan lang".
// Out of MUNDO II's fall (CONT: its last frame's camera, sea, flies and self) the camera comes
// to rest behind the self on the sea. On "lakas-loob" the light in its chest swells and the
// word rises off the water; a whip down to its feet for ISANG HAKBANG; "paabante" in slow
// motion as the right foot lifts, and it lands on the downbeat: a camera slam, and a
// shockwave out across the sea that lifts every line of the outer world (grid, crowd,
// school) into view as it passes. The dawn comes up; on "dahan-dahan" time slows again and
// the camera cranes slowly back and up until LOOB has become LABAS at daybreak: grey lines,
// a pale warm sky, and the one light (IMPACT to DAMI III).

import { sans, serif, type FontSpec } from '../../engine/fonts';
import { clearRT, type RT } from '../../engine/gl';
import { Lyrics, type Word } from '../../engine/lyrics';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, ease, keys, lerp, prog } from '../../engine/util';
import { basis, cam, handheld, shake, shots, type Cam } from '../../engine/3d/camera';
import { dist, madd, mix3, mul, norm, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { decay, impact, mergePost } from './_fx';
import { DAWN_SKY, OuterWorld, plantFoot, Spray, stepAt, warpTime, type Slow, type StepTimes } from './_hakbang_world';
import { INK, LABAS_FOG, Sky } from './_labas';
import { Loob, type LoobOpts } from './_loob';
import { Handover, HERO, LAND_POS, LAND_TGT, LOOB_TAIL, mundoK, O, tailCam, tailTimes, type Tail } from './_mundo_cosmos';
import { Blend, toFrame } from './_mundo_fx';
import { GOLD, lightOf, Self } from './_self';

let loob: Loob | null = null, self: Self | null = null, sky: Sky | null = null, blend: Blend | null = null;

const at = (x: number, y: number, z: number): V3 => [O[0] + x, O[1] + y, O[2] + z];
/** the same post as MUNDO II, so the cut is invisible */
const POST: Post = { bloom: 0.9, grain: 0.035, vignette: 0.3 };
/** the self once it has come to rest: a touch brighter than the crowd's ash */
const SELF_INK = mul(lin('ash'), 1.45);
/** LOOB's words are light */
const WORD_COL = mul(lin('paper'), 1.5), WORD_HOT = mul(GOLD, 2.2);
const QUIET = serif(100, 360, true);

// where the words stand (the self is at O facing −z)
const P_LAKAS = at(-0.4, 11, -50);
const P_HAKBANG = at(-16, 3.3, -3.6);
const P_DAHAN = at(0, 9.5, -92);
const P_ECHO = at(0, 6.5, -10);

interface Times extends StepTimes {
  cut: number;
  next: number;
  tail: Tail;
  lakasW: Word;
  isang: Word;
  hak: Word;
  dahan: Word;
  echo: [Word, Word];
  /** the dawn starts on "’Di naman", the crane on "Pwede", LABAS takes over from lab0 to lab1 */
  dawn0: number;
  crane0: number;
  lab0: number;
  lab1: number;
  foot: V3;
}

export default class Hakbang extends Scene {
  maxSamples = 36;
  private W = new Words();
  private shapes = new Map<string, WordShape>();
  private hand!: Handover;
  private world!: OuterWorld;
  private spray!: Spray;
  private T!: Times;
  private slows: Slow[] = [];

  private shape(text: string, f: FontSpec = HERO) {
    const k = text + '|' + f.family + f.weight + (f.italic ? 'i' : '');
    if (!this.shapes.has(k)) this.shapes.set(k, this.W.shape(text, f));
    return this.shapes.get(k)!;
  }

  async init() {
    loob ??= new Loob();
    self ??= new Self();
    sky ??= new Sky();
    blend ??= new Blend();
    const L = this.lyrics, A = this.audio;
    const bridge = L.find('Baka isang araw'), kahit = L.find('Kahit isang hakbang'), di = L.find('naman kailangang');
    const pw = L.find('Pwede namang'), echo = L.find('dahan-dahan lang', pw.end);
    const paab = Lyrics.word(kahit, 'paabante');
    const lakasW = Lyrics.word(bridge, 'lakas');
    this.T = {
      cut: this.params.cut, next: this.params.next, tail: tailTimes(L, A),
      lakasW, isang: Lyrics.word(kahit, 'isang'), hak: Lyrics.word(kahit, 'hakbang'), dahan: Lyrics.word(pw, 'dahan'),
      echo: [echo.words[0], echo.words[1]],
      lakas: lakasW.start, paab: paab.start,
      // the foot comes down on the first downbeat of "paabante"
      plant: toFrame(A.timeOfBar(Math.round(A.barAt(paab.start + 1)))),
      pwede: pw.start,
      dawn0: di.start, crane0: pw.start - 0.2, lab0: echo.start - 0.45, lab1: echo.start + 1.2,
      foot: [0, 0, 0],
    };
    this.T.foot = plantFoot(this.T);
    const T = this.T;
    this.slows = [
      { a: T.paab, b: T.plant - 0.07, r: 0.18, depth: 0.65 },
      { a: T.crane0, b: T.lab0 + 0.2, r: 1.2, depth: 0.6 },
    ];
    this.hand = new Handover();
    this.world = new OuterWorld();
    this.spray = new Spray();
    for (const s of ['LAKAS-LOOB', 'ISANG HAKBANG', 'DAHAN-DAHAN']) this.shape(s);
    this.shape('dahan-dahan lang', QUIET);
  }

  // ---------------------------------------------------------------- camera

  private camAt(t: number): Cam {
    const T = this.T, land = T.tail.land;
    if (t < land) return tailCam(t, T.tail);
    let c = shots(t, [
      { t: land, cam: (t) => this.camRest(t) },
      { t: T.isang.start, cam: (t) => this.camFeet(t), snap: 0.35, mode: 'pan', kick: 0.05 },
      // the foot seen down for two frames of the hit, then thrown back off it
      { t: T.plant + 2 / 60, cam: (t) => this.camWide(t), snap: 1.5, ease: ease.outExpo, mode: 'orbit', kick: 0.1 },
      { t: T.crane0, cam: (t) => this.camCrane(t), snap: 1.6, ease: ease.inOutCubic, mode: 'pan' },
    ]);
    // the operator's hand only once the fall has come to rest (so the CONT frame is exact)
    c = handheld(c, t, 0.003 * prog(t, land, land + 1.5), 0.5, 14);
    // the slam: the frame blown open, a hard shake
    const hit = decay(t, [T.plant], 0.18);
    return shake({ ...c, fov: c.fov + 9 * hit }, t, 0.012 * hit, 3);
  }

  /** at rest behind the self: a slow push over its shoulder towards LAKAS-LOOB */
  private camRest(t: number): Cam {
    const u = prog(t, this.T.tail.land, this.T.isang.start, ease.inOutSine);
    return cam(mix3(LAND_POS, at(1.2, 1.55, 3.7), u), mix3(LAND_TGT, at(-0.3, 2.8, -30), u), lerp(40, 36, u));
  }

  /** low at its side: the feet, ISANG HAKBANG over the sea beyond, creeping in to the foot */
  private camFeet(t: number): Cam {
    const T = this.T, u = prog(t, T.isang.start, T.plant, ease.inOutSine);
    return cam(mix3(at(2.7, 0.62, -0.2), at(1.9, 0.55, -1.0), u), mix3(at(-0.4, 0.75, -0.7), madd(T.foot, [0, 0.35, 0.25], 1), u), lerp(46, 42, u));
  }

  /** blown up and back by the step, then a slow drift round towards the dawn */
  private camWide(t: number): Cam {
    const T = this.T;
    const yaw = keys(t, [[T.plant, 0.62], [T.dawn0, 0.82, ease.outCubic], [T.crane0, -0.25, ease.inOutSine]]);
    const r = keys(t, [[T.plant, 11], [T.dawn0, 15, ease.outCubic], [T.crane0, 12, ease.inOutSine]]);
    const h = keys(t, [[T.plant, 5], [T.dawn0, 8.5, ease.outCubic], [T.crane0, 5, ease.inOutSine]]);
    const tgt = mix3(at(-1, 0.6, -9), at(0, 2.2, -40), prog(t, T.dawn0 - 1, T.crane0 - 0.6, ease.inOutSine));
    return cam(at(Math.sin(yaw) * r, h, Math.cos(yaw) * r), tgt, lerp(50, 42, prog(t, T.dawn0, T.crane0, ease.inOutSine)));
  }

  /** "dahan-dahan": from over its shoulder, slowly back and up until it is small in the dawn */
  private camCrane(t: number): Cam {
    const T = this.T, e = ease.inOutSine(clamp((t - T.crane0) / (T.next + 0.3 - T.crane0)));
    const d = 3.3 * Math.pow(46 / 3.3, e);
    const dir = norm(mix3([0.36, 0.05, 1], [0.1, 0.3, 1], e));
    return cam(madd(at(0, 1.6, 0), dir, d), at(0, lerp(1.7, 3.2, e), -lerp(25, 80, e)), lerp(38, 44, e));
  }

  // ---------------------------------------------------------------- light and world

  private swellAt(t: number) {
    const T = this.T;
    return prog(t, T.lakas - 0.3, T.lakas + 1.4, ease.inOutSine) * (1 - 0.4 * prog(t, T.isang.start - 0.4, T.isang.start + 0.6, ease.inOutSine));
  }

  private lightAt(t: number) {
    return lightOf(this.liwanag(t)) * (1 + 1.5 * this.swellAt(t) + 2.5 * decay(t, [this.T.plant], 0.3));
  }

  /**
   * The light as LOOB's haze sees it: less of the swell, and scaled with the camera's
   * distance, so the in-scatter of a light a metre from the lens doesn't fog the frame.
   */
  private hazeLight(t: number, camD: number) {
    const k = 1 + 0.35 * this.swellAt(t) + 0.8 * decay(t, [this.T.plant], 0.3);
    return lightOf(this.liwanag(t)) * k * clamp(camD / 6.3, 0.2, 1);
  }

  private dawnAt(t: number) {
    return prog(t, this.T.dawn0, this.T.lab0 + 0.5, ease.inOutSine);
  }

  private sunAt(t: number): V3 {
    return [0.15, lerp(0.06, 0.13, this.dawnAt(t)), -1];
  }

  private loobAt(t: number, light: number, chest: V3): Partial<LoobOpts> {
    const T = this.T, dawn = this.dawnAt(t);
    // the sea calms as the self stands up, goes still after the step, glassy by day
    const calm = prog(t, T.tail.land - 1, T.lakasW.end, ease.inOutSine);
    const still = prog(t, T.plant + 0.1, T.plant + 1.2, ease.inOutSine);
    return {
      ...LOOB_TAIL, steps: 80,
      glow: chest, glowI: light * 1.2, glowR: 0.1,
      wave: lerp(lerp(lerp(LOOB_TAIL.wave!, 0.16, calm), 0.06, still), 0.04, dawn),
      dawn, sunI: lerp(0.25, 1.4, dawn), sun: this.sunAt(t),
      // (the bioluminescence all but goes out with it: from the crane its noise reads as squares)
      stars: 0.6 * (1 - dawn), lum: lerp(lerp(0.6, 0.02, prog(t, T.plant, T.plant + 0.6, ease.outCubic)), 0, dawn),
      // the islands lift away into the morning
      isleY: 18 + 27 * prog(t, T.pwede + 2, T.lab1, ease.inOutSine),
    };
  }

  // ---------------------------------------------------------------- render

  render(f: Frame, out: RT): Post {
    const t = f.t, T = this.T, tw = warpTime(t, this.slows);
    const b = basis(this.camAt(t));
    const depth = this.rt(0);
    const st = stepAt(t, T);
    const chest = self!.chest({ pos: st.pos, yaw: st.yaw, pose: st.pose });
    const light = this.lightAt(t);
    const lab = prog(t, T.lab0, T.lab1, ease.inOutSine);

    const dawnSky = { ...DAWN_SKY, warmDir: this.sunAt(t) };
    if (lab < 1) {
      loob!.draw(out, depth, b, tw, this.loobAt(t, this.hazeLight(t, dist(b.pos, chest)), chest));
      this.hand.draw(out, b, depth, tw, mundoK(t, this.lyrics), 1 - prog(t, T.pwede + 2, T.lab1, ease.inOutSine));
      // LABAS at daybreak, over everything LOOB was
      if (lab > 0) {
        sky!.draw(this.rt(1), b, dawnSky);
        blend!.draw(out, this.rt(1), lab);
      }
    } else {
      // all LABAS now: no march under it (and nothing left in the way of the lines)
      sky!.draw(out, b, dawnSky);
      clearRT(depth, [0, 0, 0], 1e4);
    }

    // the outer world: lit by the shock front, seen in its wake, kept faintly, then for good
    const hold = Math.max(0.14 * prog(t, T.plant + 2.5, T.plant + 5, ease.inOutSine), lab);
    const wake = 1 - prog(t, T.plant + 1.2, T.plant + 4, ease.inOutSine);
    if (t >= T.plant || hold > 0) {
      const fog: [number, number] = [lerp(30, LABAS_FOG[0], lab), lerp(0.01, LABAS_FOG[1], lab)];
      this.world.draw(out, b, { now: t, plant: T.plant, foot: T.foot, hold, wake, fog, depth });
    }
    this.spray.draw(out, b, { now: t, plant: T.plant, foot: T.foot, depth });

    this.words(t, out, b, depth);

    const colK = prog(t, T.tail.land - 1.5, T.lakas + 0.5, ease.inOutSine);
    // the light stays findable as the crane leaves it small in the dawn
    const big = lerp(1, 3.5, prog(t, T.crane0 + 1, T.next, ease.inOutSine));
    self!.draw(out, b, t, { pos: st.pos, yaw: st.yaw, pose: st.pose, light, col: mix3(INK.shade, SELF_INK, colK), core: 0.022 * big, halo: 0.09 * big }, { depth });

    this.echo(t, out, b);

    // the world holds its breath through "paabante", then the hit
    const held = t < T.plant ? prog(t, T.paab, T.plant, ease.inOutSine) : 0;
    return mergePost({ ...POST, exposure: 1 - 0.14 * held }, impact(t, [T.plant], { flash: 0.1, tau: 0.1, ca: 1.1, shake: 14 }));
  }

  private words(t: number, out: RT, b: ReturnType<typeof basis>, depth: RT) {
    const T = this.T, W = this.W.clear();
    let any = false;
    // LAKAS-LOOB rising off the sea, letter by letter, warming with the light
    const outL = 1 - prog(t, T.isang.start - 0.4, T.isang.start + 0.05, ease.inCubic);
    if (outL > 0 && t > T.lakas - 0.3) {
      const w = T.lakasW, glow = prog(t, T.lakas, w.end, ease.inOutSine);
      W.word(this.shape('LAKAS-LOOB'), {
        pos: P_LAKAS, height: 6.5, col: mix3(WORD_COL, WORD_HOT, 0.35 * glow),
        each: (i) => {
          const c = w.c[i] ?? w.start, k = prog(t, c - 0.12, c + 0.55, ease.outBack);
          return { off: [0, -5 * (1 - k), 0], scale: 0.7 + 0.3 * k, alpha: prog(t, c - 0.12, c + 0.12) * outL };
        },
      });
      any = true;
    }
    // ISANG HAKBANG slammed down letter by letter, over the sea beyond the feet
    const outH = 1 - prog(t, T.paab + 0.1, T.paab + 0.7, ease.inOutSine);
    if (outH > 0 && t > T.isang.start - 0.1) {
      const cI = (i: number) => (i < 5 ? T.isang.c[i] : i > 5 ? T.hak.c[i - 6] : T.isang.end) ?? T.isang.start;
      W.word(this.shape('ISANG HAKBANG'), {
        pos: P_HAKBANG, right: [0, 0, -1], height: 2.8, col: WORD_COL,
        each: (i) => {
          const c = cI(i), k = prog(t, c - 0.05, c + 0.3, ease.outCubic);
          return { off: [0, 2.2 * (1 - k), 0], spin: 0.35 * (1 - k) * (i % 2 ? 1 : -1), scale: 1.25 - 0.25 * k, alpha: prog(t, c - 0.05, c + 0.06) * outH };
        },
      });
      any = true;
    }
    // DAHAN-DAHAN at the horizon, surfacing slowly into the dawn
    const outD = 1 - prog(t, T.lab0 + 0.2, T.lab1 - 0.2, ease.inOutSine);
    if (outD > 0 && t > T.dahan.start - 0.2) {
      const w = T.dahan;
      W.word(this.shape('DAHAN-DAHAN'), {
        pos: P_DAHAN, height: 13, col: mix3(WORD_COL, WORD_HOT, 0.25),
        each: (i) => {
          const k = prog(t, (w.c[i] ?? w.start) - 0.1, (w.c[i] ?? w.start) + 1.3, ease.outCubic);
          return { off: [0, -2.5 * (1 - k), 0], alpha: k * outD };
        },
      });
      any = true;
    }
    if (any) W.draw(out, b, { depth, blend: 'add' });
  }

  /** the echo, quiet and grey, over the self once it is LABAS again */
  private echo(t: number, out: RT, b: ReturnType<typeof basis>) {
    const [e1, e2] = this.T.echo;
    if (t < e1.start - 0.1) return;
    const cI = (i: number) => (i < 11 ? e1.c[i] : i > 11 ? e2.c[i - 12] : e1.end) ?? e1.start;
    this.W.clear().word(this.shape('dahan-dahan lang', QUIET), {
      pos: P_ECHO, height: 3.2, col: SELF_INK,
      each: (i) => {
        const k = prog(t, cI(i) - 0.05, cI(i) + 0.6, ease.outCubic);
        return { off: [0, -0.15 * (1 - k), 0], alpha: 0.85 * k };
      },
    });
    this.W.draw(out, b, { fog: LABAS_FOG });
  }
}
