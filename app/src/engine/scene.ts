import type { AudioData } from './audio';
import { clearRT, makeRT, Pass, type RT } from './gl';
import { Layer2D } from './layer';
import type { Lyrics } from './lyrics';
import { lin, type PalName, type RGB } from './palette';

export interface Frame {
  /** absolute song time, seconds */
  t: number;
  /** local time since the entry started */
  lt: number;
  /** 0→1 progress through the entry window */
  p: number;
  beat: number;
  bar: number;
  beatPhase: number;
  barPhase: number;
  /** output frame index (constant across motion-blur sub-frames) */
  frame: number;
  /** 0→1 while this entry fades in over the previous one; 1 otherwise */
  tin: number;
  /** previous entry's output during a transition (only when handlesTransition) */
  under: RT | null;
}

/** per-frame post overrides a scene may return from render() */
export interface Post {
  exposure?: number;
  bloom?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  grain?: number;
  vignette?: number;
  /** chromatic aberration, ~0..1 */
  ca?: number;
  /** 0..1 fade to black */
  fade?: number;
  /** 0..1 flash to paper */
  flash?: number;
  /** camera shake in logical px */
  shake?: [number, number];
  zoom?: number;
  /** HUD opacity 0..1 */
  hud?: number;
  /** override the LIWANAG (glow) readout */
  liwanag?: number;
  /** HUD ink for bright (paper) plates */
  hudInk?: boolean;
}

export const POST_DEFAULTS: Required<Omit<Post, 'liwanag'>> & { liwanag: number | undefined } = {
  exposure: 1,
  bloom: 0.55,
  bloomThreshold: 1.0,
  bloomRadius: 1,
  grain: 0.045,
  vignette: 0.35,
  ca: 0,
  fade: 0,
  flash: 0,
  shake: [0, 0],
  zoom: 1,
  hud: 1,
  liwanag: undefined,
  hudInk: false,
};

export interface Entry {
  scene: string;
  start: number;
  end: number;
  /** "04 · DAMI NG TAO" — shown in the HUD */
  label: string;
  /** crossfade duration into this entry (overlap with the previous one) */
  xf: number;
  params: Record<string, any>;
}

/** Layers / RTs shared by every scene rendering in the same compositing slot */
export class SlotPool {
  slot = 0;
  private layers: Layer2D[][] = [[], [], []];
  private rts: RT[][] = [[], [], []];
  layer(i: number) {
    return (this.layers[this.slot][i] ??= new Layer2D());
  }
  rt(i: number) {
    return (this.rts[this.slot][i] ??= makeRT());
  }
}

export interface SceneCtx {
  name: string;
  entry: Entry;
  start: number;
  end: number;
  params: Record<string, any>;
  lyrics: Lyrics;
  audio: AudioData;
  pool: SlotPool;
  /** the film-wide LIWANAG arc (0..1): how bright the self's light is allowed to be */
  liwanag: (t: number) => number;
}

export type ColorLike = PalName | string | RGB;
export interface LayerSpec {
  l: Layer2D;
  /** 'over' = normal alpha compositing; 'add' = additive light (use gain > 1 to bloom) */
  mode?: 'over' | 'add';
  gain?: number;
  opacity?: number;
}

let composePass: Pass | null = null;
const COMPOSE = /* glsl */ `
uniform sampler2D uTex; uniform float uGain, uOpacity, uAdd;
void main() {
  vec4 c = texture(uTex, vUv);
  vec3 rgb = c.a > 0. ? c.rgb / c.a : vec3(0.);
  vec3 l = srgb2lin(rgb) * c.a;
  fragColor = vec4(l * uGain * uOpacity, c.a * uOpacity * (1. - uAdd));
}`;

export abstract class Scene {
  /** set when the scene composites f.under itself during its fade-in */
  handlesTransition = false;
  constructor(public ctx: SceneCtx) {}

  async init(): Promise<void> {}
  abstract render(f: Frame, out: RT): Post | void;

  get params() {
    return this.ctx.params;
  }
  get lyrics() {
    return this.ctx.lyrics;
  }
  get audio() {
    return this.ctx.audio;
  }
  liwanag(t: number) {
    return this.ctx.liwanag(t);
  }
  /** shared Canvas2D layer #i for this slot (call .begin() every frame) */
  layer(i = 0): Layer2D {
    return this.ctx.pool.layer(i);
  }
  /** shared full-frame HDR render target #i for this slot */
  rt(i = 0): RT {
    return this.ctx.pool.rt(i);
  }

  /**
   * Fill `out`: optional background colour (skip with bg: null when a shader already
   * drew into out), then Canvas2D layers in order.
   */
  compose(out: RT, o: { bg?: ColorLike | null; layers: LayerSpec[] }) {
    if (o.bg !== null) {
      const c = o.bg ?? 'ink';
      clearRT(out, Array.isArray(c) ? c : lin(c));
    }
    composePass ??= new Pass(COMPOSE);
    for (const L of o.layers) {
      const add = L.mode === 'add';
      composePass.draw(
        out,
        { uTex: L.l.upload(), uGain: L.gain ?? 1, uOpacity: L.opacity ?? 1, uAdd: add ? 1 : 0 },
        'over',
      );
    }
  }
}

export type SceneClass = new (ctx: SceneCtx) => Scene;
