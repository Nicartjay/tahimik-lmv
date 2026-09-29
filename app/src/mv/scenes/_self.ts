// The quiet one: a line figure like everyone else's except for the light in the chest,
// the only warm thing in LABAS. Scenes pose them per frame; `chest()` is the world point
// every dive and match cut goes through. The light's brightness is the film's LIWANAG
// arc (`lightOf`), so the self can't shine more than the song has earned yet.

import type { RT } from '../../engine/gl';
import { lin, type RGB } from '../../engine/palette';
import type { Basis } from '../../engine/3d/camera';
import type { DrawOpts } from '../../engine/3d/geo';
import { LineBatch } from '../../engine/3d/lines';
import { mul, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { noise1 } from '../../engine/util';
import { addFigure, figure, FIGURE_GLSL, INK, POSE, toWorld, type Place, type Pose } from './_labas';

export interface SelfOpts extends Place {
  pose?: Pose;
  col?: RGB;
  alpha?: number;
  /** line width, logical px */
  w?: number;
  /** firefly brightness: 0 = out, ~1 blooms hard (see lightOf) */
  light?: number;
  /** firefly core σ and halo σ, metres */
  core?: number;
  halo?: number;
  /** draw only the light (a figure seen from inside, or already dissolved) */
  noBody?: boolean;
}

/** LIWANAG (0..1) → firefly brightness: always a spark, never more than the song allows */
export const lightOf = (liw: number) => 0.35 + 2.4 * liw;

export const GOLD = lin('glow');
export const EMBER = lin('ember');

export class Self {
  private body = new LineBatch(64, FIGURE_GLSL);
  private glow = new GlowPoints(8);

  /** world position of the chest light */
  chest(o: SelfOpts): V3 {
    return toWorld(o, figure(o.pose ?? POSE.shy).chest);
  }

  draw(out: RT, b: Basis, t: number, o: SelfOpts, d: DrawOpts = {}) {
    const fig = figure(o.pose ?? POSE.shy);
    if (!o.noBody) {
      this.body.clear();
      addFigure(this.body, fig, o, 0, o.w ?? 1.15, o.col ?? INK.bright, o.alpha ?? 1);
      this.body.draw(out, b, { ...d, uniforms: { uBeat: 0, uSway: 0, uBob: 0, uGroundY: o.pos[1], ...(d.uniforms ?? {}) } });
    }
    const I = (o.light ?? 1) * (1 + 0.07 * noise1(t * 7.3, 11) + 0.04 * noise1(t * 19.1, 12));
    if (I <= 0) return;
    const c = toWorld(o, fig.chest), s = o.scale ?? 1;
    const core = (o.core ?? 0.022) * s, halo = (o.halo ?? 0.09) * s;
    this.glow.clear();
    this.glow.point(c, -core, mul(GOLD, 3), I);
    this.glow.point(c, -halo, EMBER, I * 0.12);
    this.glow.point(c, -halo * 4, EMBER, I * 0.018);
    this.glow.draw(out, b, { ...d, uniforms: undefined });
  }
}
