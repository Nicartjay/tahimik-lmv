// 18 · GITNA (the beat before "Baka sa tahimik" → the bar after "Mag-stand out din ako").
// Out of BUO's light, LABAS in full: the self walks down the lane into the centre of a
// crowd that has turned to face them, head coming up as they go, and stops. On
// "Mag-stand" fireflies burst out of the chest and a ring runs out through the crowd
// tinting every line warm; on "ako" (LIWANAG 1.0) the big one: a second ring out to the
// horizon, the crowd throwing their arms up as it passes, thousands of lights thrown over
// the whole world, and the camera cranes away to planet scale until the ground curls
// into a little world with one light at its centre. WAKAS carries on from this camera.

import { sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { Lyrics } from '../../engine/lyrics';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, hash, lerp, prog } from '../../engine/util';
import { basis, type Basis } from '../../engine/3d/camera';
import { add, dist, madd, mul, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { decay, DIVE_COL, diveIn, Fill, impact, mergePost, towardDive } from './_fx';
import { gitnaWorld } from './_gitna_world';
import { GOLD, lightOf } from './_self';

export default class Gitna extends Scene {
  maxSamples = 108;
  private W = new Words();
  private fill = new Fill();
  private line1!: WordShape;
  private line2!: WordShape;

  async init() {
    gitnaWorld().init(this.lyrics, this.audio, this.params.cut);
    this.line1 = this.W.shape('MAG-STAND OUT', sans(100, 800, 'extra-condensed', 4));
    this.line2 = this.W.shape('DIN AKO', sans(100, 800, 'extra-condensed', 4));
  }

  render(f: Frame, out: RT): Post {
    const G = gitnaWorld(), T = G.T, t = f.t;
    const b = basis(G.cam(t), 0.02);
    const s = { t, beat: f.beat, b, light: lightOf(this.liwanag(t)) };

    G.back(out, s);
    this.words(out, t, b);
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
  private words(out: RT, t: number, b: Basis) {
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
    this.W.clear();

    const H1 = 0.15 * D;
    this.W.word(this.line1, {
      pos: madd(C, U, 0.24 * D), right: R, up: U, height: H1, col: paper,
      each: (i) => {
        const k = i < 9 ? Lyrics.charProgress(w.mag, i, t) : Lyrics.charProgress(w.out, i - 10, t);
        if (k <= 0) return { alpha: 0 };
        const e = ease.outBack(k);
        return { off: add(mul(U, -0.35 * H1 * (1 - e)), drift(i, 1)), scale: lerp(0.5, 1, e), alpha: Math.min(1, k * 3) * (1 - gone) };
      },
    });

    const H2 = 0.3 * D;
    this.W.word(this.line2, {
      pos: madd(C, U, -0.2 * D), right: R, up: U, height: H2, col: paper,
      each: (i) => {
        if (i < 3) {
          const k = Lyrics.charProgress(w.din, i, t);
          if (k <= 0) return { alpha: 0 };
          return { off: add(mul(U, -0.25 * H2 * (1 - ease.outBack(k))), drift(i, 2)), alpha: Math.min(1, k * 3) * (1 - gone) };
        }
        // AKO slams in from the lens, all at once, in the light's colour
        const k = prog(t, w.ako.start - 0.02, w.ako.start + 0.28, ease.outExpo);
        if (k <= 0) return { alpha: 0 };
        const near = D * (1 - 1 / lerp(2.4, 1, k));
        return { off: add(mul(b.F, -near), drift(i, 3)), alpha: Math.min(1, k * 4) * (1 - gone), col: mul(GOLD, 2.6) };
      },
    });
    this.W.draw(out, b);
  }
}
