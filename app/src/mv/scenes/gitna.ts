// 18 · GITNA (the beat before "Baka sa tahimik" → the bar after "Mag-stand out din ako").
// Out of BUO's light, LABAS in full: the self walks down the lane into the centre of a
// crowd that has turned to face them, head coming up as they go, and stops. On
// "Mag-stand" fireflies burst out of the chest and a ring runs out through the crowd
// tinting every line warm; on "ako" (LIWANAG 1.0) the big one: a second ring out to the
// horizon, the crowd throwing their arms up as it passes, thousands of lights thrown over
// the whole world, and the camera cranes away to planet scale until the ground curls
// into a little world with one light at its centre. WAKAS carries on from this camera.
// "Baka sa tahimik kong paraan" rises word by word out of the faces, round the ring above
// their heads and turned in to the self: "Baka sa" and "tahimik" either side of their head
// in the close shot, the whole line across the top of the high one.

import { sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics, type Line, type Word } from '../../engine/lyrics';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, hash, lerp, prog } from '../../engine/util';
import { basis, type Basis } from '../../engine/3d/camera';
import { add, dist, madd, mul, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { decay, DIVE_COL, diveIn, Fill, impact, mergePost, towardDive } from './_fx';
import { gitnaWorld } from './_gitna_world';
import { GOLD, lightOf } from './_self';
import { LyricTrack, TONE, VOICE, type Place } from './_lyric';

/** the ring the first line stands on: radius, height (m), em */
const RING_R = 8, RING_Y = 2.3, RING_S = 0.68;
/** where the self's head is, from the close shot, on the ring (rad), and the room left for it (m) */
const HEAD_A = -0.087, HEAD_GAP = 0.85;
/** how far the line swings round the ring in the whip to the high shot, so it sits across it (rad) */
const SWING = -0.33;

/** glyphs [i0, i1) of a shape: their centre across the shape (em) and their shape */
function part(s: WordShape, i0: number, i1: number): [number, WordShape] {
  let l = Infinity, r = -Infinity;
  for (const { g, i, cx } of s.glyphs) if (i >= i0 && i < i1) (l = Math.min(l, cx - g.w / 2)), (r = Math.max(r, cx + g.w / 2));
  return [((l + r) / 2 - s.w / 2) / s.r, { ...s, w: r - l }];
}

export default class Gitna extends Scene {
  maxSamples = 108;
  private W = new Words();
  private fill = new Fill();
  private line1!: WordShape;
  private line2!: WordShape;
  private track!: LyricTrack;
  private sung!: Line;

  async init() {
    gitnaWorld().init(this.lyrics, this.audio, this.params.cut);
    this.line1 = this.W.shape('MAG-STAND OUT', sans(100, 800, 'extra-condensed', 4));
    this.line2 = this.W.shape('DIN AKO', sans(100, 800, 'extra-condensed', 4));
    this.sung = this.lyrics.find('Mag-stand out');
    this.stage(this.lyrics.find('Baka sa tahimik'));
  }

  /** the first line along the ring, left to right as the self sees it, clear of their head */
  private stage(p: Line) {
    const T = gitnaWorld().T, V = VOICE.soft;
    const w = p.words.map((x) => (this.W.shape(x.w, V.font, V.raster).w / V.raster) * RING_S);
    const gap = 0.45 * RING_S, s: number[] = [];
    let run = 0, head = 0;
    w.forEach((x, k) => {
      s.push(run + x / 2);
      run += x + (k === 1 ? HEAD_GAP : gap);
      if (k === 1) head = run - HEAD_GAP / 2;
    });
    const at = (k: number, t: number): Place => {
      const a = HEAD_A - (s[k] - head) / RING_R + SWING * prog(t, T.bar1, T.bar1 + 0.55, ease.inOutCubic);
      return { pos: [Math.sin(a) * RING_R, RING_Y, Math.cos(a) * RING_R], right: [-Math.cos(a), 0, Math.sin(a)], up: [0, 1, 0] };
    };
    this.track = new LyricTrack(this.W).add(p, {
      voice: V, size: RING_S, at: at(0, 0), wordAt: (k, t) => at(k, t), tone: TONE.loob, out: T.stop, exit: 'fade', exitDur: 0.35,
    });
  }

  render(f: Frame, out: RT): Post {
    const G = gitnaWorld(), T = G.T, t = f.t;
    const b = basis(G.cam(t), 0.02);
    const s = { t, beat: f.beat, b, light: lightOf(this.liwanag(t)) };

    G.back(out, s);
    this.W.clear();
    this.track.draw(t, b);
    this.heroes(t, b);
    this.W.draw(out, b);
    G.front(out, s);

    // the two hits land as light
    const pulse = 0.06 * decay(t, [T.mag], 0.06) + 0.14 * decay(t, [T.ako], 0.07);
    this.fill.draw(out, mul(GOLD, 0.5), pulse, 'add');
    // BUO's flare, opening
    const k = diveIn(t, this.params.cut, 0.45);
    this.fill.draw(out, DIVE_COL, k, 'over');

    return towardDive(
      mergePost(
        G.post(b, t),
        impact(t, [T.mag], { ca: 0.5, shake: 5, tau: 0.25 }),
        impact(t, [T.ako], { ca: 1.1, shake: 12, tau: 0.35, seed: 3 }),
      ),
      k,
    );
  }

  /** the hero words, hung at the self facing the camera; left behind as it cranes away */
  private heroes(t: number, b: Basis) {
    const G = gitnaWorld(), T = G.T, w = T.w;
    if (t < w.mag.start - 0.2 || t > T.ako + 1.6) return;
    const tf = Math.min(t, T.ako + 0.35), D = dist(G.cam(tf).pos, G.chest(tf));
    const C = G.chest(t), R = b.R, U = b.U;
    const gone = prog(t, T.ako + 0.95, T.ako + 1.55, ease.inCubic);
    const drift = (i: number, line: number): V3 => {
      const a = hash(i, line, 1) * 6.283, r = D * (0.05 + 0.1 * hash(i, line, 2)) * gone;
      return add(mul(R, Math.cos(a) * r), mul(U, Math.sin(a) * r * 0.6 + D * 0.04 * gone));
    };
    const paper = mul(lin('paper'), 0.9);
    // for the audit: how much of each word is in place (letters lit and landed)
    const set = [0, 0, 0, 0];
    const land = (j: number, k: number, a: number) => (set[j] += a * Math.min(1, k / 0.6) * (1 - gone));

    const H1 = 0.15 * D, P1 = madd(C, U, 0.24 * D);
    this.W.word(this.line1, {
      pos: P1, right: R, up: U, height: H1, col: paper,
      each: (i) => {
        const k = i < 9 ? Lyrics.charProgress(w.mag, i, t) : Lyrics.charProgress(w.out, i - 10, t);
        land(i < 9 ? 0 : 1, k, Math.min(1, k * 3) / (i < 9 ? 9 : 3));
        if (k <= 0) return { alpha: 0 };
        const e = ease.outBack(k);
        return { off: add(mul(U, -0.35 * H1 * (1 - e)), drift(i, 1)), scale: lerp(0.5, 1, e), alpha: Math.min(1, k * 3) * (1 - gone) };
      },
    });

    const H2 = 0.3 * D, P2 = madd(C, U, -0.2 * D);
    const ka = prog(t, w.ako.start - 0.02, w.ako.start + 0.28, ease.outExpo), near = D * (1 - 1 / lerp(2.4, 1, ka));
    this.W.word(this.line2, {
      pos: P2, right: R, up: U, height: H2, col: paper,
      each: (i) => {
        if (i < 3) {
          const k = Lyrics.charProgress(w.din, i, t);
          land(2, k, Math.min(1, k * 3) / 3);
          if (k <= 0) return { alpha: 0 };
          return { off: add(mul(U, -0.25 * H2 * (1 - ease.outBack(k))), drift(i, 2)), alpha: Math.min(1, k * 3) * (1 - gone) };
        }
        // AKO slams in from the lens, all at once, in the light's colour
        const k = ka;
        land(3, k, Math.min(1, k * 4) / 3);
        if (k <= 0) return { alpha: 0 };
        return { off: add(mul(b.F, -near), drift(i, 3)), alpha: Math.min(1, k * 4) * (1 - gone), col: mul(GOLD, 2.6) };
      },
    });

    const mark = (word: Word, shape: WordShape, i0: number, i1: number, pos: V3, H: number, a: number) => {
      const [x, s] = part(shape, i0, i1);
      LyricTrack.mark(this.sung, word, b, madd(pos, R, x * H), R, H, s, a, U);
    };
    mark(w.mag, this.line1, 0, 9, P1, H1, set[0]);
    mark(w.out, this.line1, 10, 13, P1, H1, set[1]);
    mark(w.din, this.line2, 0, 3, P2, H2, set[2]);
    mark(w.ako, this.line2, 4, 7, madd(P2, b.F, -near), H2, set[3]);
  }
}
