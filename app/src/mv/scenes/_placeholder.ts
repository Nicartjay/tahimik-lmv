// A stand-in plate so the whole film plays end to end while the real scenes are built:
// a slow orbit round a LABAS schoolyard (grid, a small crowd, the self at the edge) or a
// crane over LOOB (sea, islands, fireflies), with the scene's hero words standing in the
// world one after another. Each scene file just names its world and words.

import { sans } from '../../engine/fonts';
import type { RT } from '../../engine/gl';
import { lin } from '../../engine/palette';
import { Scene, type Frame, type Post } from '../../engine/scene';
import { clamp, smoothstep } from '../../engine/util';
import { basis, handheld, orbit, type Basis } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { mul, type V3 } from '../../engine/3d/math';
import { Words, type WordShape } from '../../engine/3d/words';
import { Crowd, groundGrid, LABAS_FOG, POSE, scatter, Sky } from './_labas';
import { Flies, Loob } from './_loob';
import { lightOf, Self } from './_self';

// shader programs are shared by every placeholder entry
let sky: Sky | null = null, loob: Loob | null = null, self: Self | null = null;

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 9973;

export abstract class Placeholder extends Scene {
  abstract world: 'labas' | 'loob';
  abstract words: string[];
  maxSamples = 36;
  private grid?: LineBatch;
  private crowd?: Crowd;
  private flies?: Flies;
  private W = new Words();
  private shapes: WordShape[] = [];

  async init() {
    const seed = seedOf(this.ctx.name);
    self ??= new Self();
    if (this.world === 'labas') {
      sky ??= new Sky();
      this.grid = new LineBatch(12000);
      groundGrid(this.grid, { extent: 90 });
      this.crowd = new Crowd(scatter(36, { r0: 2, r1: 11, seed, gap: [1.2, 0.5] }));
    } else {
      loob ??= new Loob();
      this.flies = new Flies(4000, 60, seed);
    }
    this.shapes = this.words.map((w) => this.W.shape(w, sans(100, 800, 'extra-condensed', 4)));
  }

  render(f: Frame, out: RT): Post {
    const t = f.t, cut: number = this.params.cut, next: number = this.params.next;
    const k = clamp((t - cut) / Math.max(next - cut, 1e-3));
    const seed = seedOf(this.ctx.name), yaw0 = (seed % 628) / 100;
    const light = lightOf(this.liwanag(t));
    let tgt: V3, b: Basis;

    if (this.world === 'labas') {
      tgt = [0, 1.2, 0];
      b = basis(handheld(orbit(tgt, yaw0 + k * 0.7, 0.14, 15, 38), t, 0.004));
      sky!.draw(out, b);
      this.grid!.draw(out, b, { fog: LABAS_FOG });
      this.crowd!.draw(out, b, { beat: f.beat, sway: 0.05, bob: 0.02 });
      const at: V3 = [Math.sin(1.2) * 12.5, 0, Math.cos(1.2) * 12.5];
      self!.draw(out, b, t, { pos: at, yaw: 1.2 + Math.PI, pose: POSE.shy, light }, { fog: LABAS_FOG });
    } else {
      // under the islands (their roots reach down to ~12 m), looking up into them
      tgt = [0, 11, 0];
      b = basis(handheld(orbit(tgt, yaw0 + k * 0.9, -0.08 + 0.1 * k, 34, 46), t, 0.003));
      const fly: V3 = [Math.sin(t * 0.4) * 5, 10 + Math.sin(t * 0.7), Math.cos(t * 0.4) * 5];
      const depth = this.rt(0);
      loob!.draw(out, depth, b, t, { glow: fly, glowI: light, isleY: 30 });
      this.flies!.draw(out, b, { t, centre: b.pos, depth, fog: [20, 0.02] });
      self!.draw(out, b, t, { pos: [fly[0], fly[1] - 1.33, fly[2]], noBody: true, light: light * 2, scale: 4 }, { depth });
    }

    // hero words, one after another across the shot
    const n = this.shapes.length, u = k * n, i = Math.min(n - 1, Math.floor(u)), v = u - i;
    const a = smoothstep(0, 0.12, v) * (1 - smoothstep(0.88, 1, v));
    this.W.clear().word(this.shapes[i], {
      pos: [tgt[0], tgt[1] + (this.world === 'labas' ? 2.2 : 6), tgt[2]],
      right: b.R, up: b.U, height: this.world === 'labas' ? 1.6 : 5,
      col: mul(lin('paper'), 1.3), alpha: a,
    });
    this.W.draw(out, b, { depth: this.world === 'loob' ? this.rt(0) : undefined });
    return { bloom: 0.9, grain: 0.035, vignette: 0.3 };
  }
}
