// 19 · WAKAS (the bar after "Mag-stand out din ako" → the end). GITNA's camera, still
// moving: then the little world folds back into the one light, the far side first,
// spiralling in (the ground, the town, the crowd, every firefly, the self's own body)
// while the camera comes back down to it, until there is a single firefly in the dark,
// as at the very start. The title under it; the last light goes out; black.

import { H } from '../../engine/config';
import { sans, serif } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { ease, noise1, prog } from '../../engine/util';
import { basis, type Basis } from '../../engine/3d/camera';
import { dist, madd, mix3, mul } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { bars, mergePost } from './_fx';
import { gitnaWorld } from './_gitna_world';
import { EMBER, GOLD, lightOf } from './_self';

/** how close the camera comes back to the light */
const END_D = 5;

export default class Wakas extends Scene {
  maxSamples = 108;
  private W = new Words();
  private title!: WordShape;
  private sub!: WordShape;
  /** the fold completes on this downbeat */
  private tFold = 0;
  private pushMax = 0;

  async init() {
    const G = gitnaWorld();
    G.init(this.lyrics, this.audio);
    const cut = this.params.cut;
    this.tFold = bars(this.audio, cut + 0.5, cut + 6)[0] ?? cut + 2.7;
    this.pushMax = Math.log(dist(G.cam(cut).pos, G.chest(cut)) / END_D);
    this.title = this.W.shape('TAHIMIK', sans(100, 800, 'extra-condensed', 10));
    this.sub = this.W.shape('PERO AKO ’TO', serif(100, 380, true, 2));
  }

  render(f: Frame, out: RT): Post {
    const G = gitnaWorld(), t = f.t, cut = this.params.cut, Tf = this.tFold;
    const fold = prog(t, cut + 0.12, Tf, ease.inOutSine);
    const push = this.pushMax * prog(t, cut, Tf + 0.6, ease.inOutSine);
    const b = basis(G.cam(t, push), 0.02);

    // the light: brightest as everything arrives in it, then out
    const flare = 1.4 * prog(t, Tf - 0.7, Tf, ease.inQuad) * (1 - prog(t, Tf, Tf + 1, ease.outCubic));
    const out01 = 1 - prog(t, Tf + 0.75, Tf + 1.4, ease.inQuad);
    const flick = 1 - 0.5 * prog(t, Tf + 0.5, Tf + 1.3) * Math.max(0, noise1(t * 11, 21));
    const light = lightOf(this.liwanag(t)) * (1 + flare) * out01 * flick;

    G.back(out, { t, beat: f.beat, b, light, fold });
    G.front(out, { t, beat: f.beat, b, light, fold });
    this.words(out, t, b);

    return mergePost(G.post(b, t, fold), { fade: prog(t, Tf + 1.2, Tf + 1.75, ease.inOutSine) });
  }

  /** the title, held on the screen under the light */
  private words(out: RT, t: number, b: Basis) {
    const Tf = this.tFold, t0 = Tf - 1.37;
    if (t < t0) return;
    const gone = prog(t, Tf + 0.95, Tf + 1.45, ease.inOutSine);
    if (gone >= 1) return;
    const z = 10, fh = (z * H) / b.focal;
    const at = (y: number) => madd(madd(b.pos, b.F, z), b.U, y * fh);
    this.W.clear();
    this.W.word(this.title, {
      pos: at(-0.2), right: b.R, up: b.U, height: 0.12 * fh, col: mul(lin('paper'), 0.9),
      each: (i) => {
        const a = t0 + i * 0.17, k = prog(t, a, a + 0.5, ease.outCubic);
        return { off: mul(b.U, -0.02 * fh * (1 - k)), alpha: k * (1 - gone) };
      },
    });
    const k = prog(t, Tf + 0.13, Tf + 0.55, ease.inOutSine);
    this.W.word(this.sub, {
      pos: at(-0.3), right: b.R, up: b.U, height: 0.05 * fh, col: mul(mix3(GOLD, EMBER, 0.4), 1.3),
      alpha: k * (1 - gone), each: () => ({ off: mul(b.U, -0.01 * fh * (1 - k)) }),
    });
    this.W.draw(out, b);
  }
}
