// Shared bits for the chorus plates (dami, sulok): the cool spotlight, the crowd's
// chatter fragments (the loud world, in Archivo) and a hex colour mix for person().

import { applyFont, layout, sans } from '../engine/fonts';
import type { AudioData } from '../engine/audio';
import { Pass, type RT } from '../engine/gl';
import { rgb, rgba, type PalName } from '../engine/palette';
import { clamp, ease, hash, lerp } from '../engine/util';

/** hex mix of two palette colours (person()/talk() want a hex or a palette name) */
export function hexMix(a: PalName | string, b: PalName | string, k: number): string {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], clamp(k)) * 255).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// spotlight: a pale, cool beam from off-frame onto an elliptical pool on the ground.
// Deliberately far below the bloom threshold: the only light that blooms is the self's.

const SPOT = /* glsl */ `
uniform vec2 uSrc, uTgt, uPool;
uniform float uI, uT, uCone, uPoolW;
void main() {
  vec2 p = fragPx();
  vec2 d = uTgt - uSrc;
  float L = max(1., length(d));
  vec2 u = d / L, n = vec2(-u.y, u.x);
  vec2 rp = p - uSrc;
  float s = dot(rp, u), r = abs(dot(rp, n));
  float k = clamp(s / L, 0., 1.);
  float w = mix(14., uPool.x * .92, k);
  float cone = (1. - smoothstep(w * .3, w, r)) * smoothstep(0., 160., s) * (1. - smoothstep(L - uPool.y, L + uPool.y * .6, s));
  cone *= (.45 + .75 * fbm(p * .0032 + vec2(uT * .02, -uT * .05))) * mix(.7, 1., k);
  vec2 q = (p - uTgt) / uPool;
  float pool = 1. - smoothstep(.3, 1., length(q));
  vec3 col = mix(C_PAPER, C_SEA, .32);
  fragColor = vec4(col * uI * (cone * uCone * .048 + pool * uPoolW * .13), 0.);
}`;

let spotPass: Pass | null = null;

export interface Spot {
  src: [number, number];
  tgt: [number, number];
  /** pool radii (rx, ry), logical px */
  pool: [number, number];
  I: number;
}

/** additive; call with part 'pool' before the Canvas layers and 'cone' after them */
export function drawSpot(out: RT, s: Spot, t: number, part: 'pool' | 'cone') {
  if (s.I <= 0.002) return;
  spotPass ??= new Pass(SPOT);
  spotPass.draw(
    out,
    { uSrc: s.src, uTgt: s.tgt, uPool: s.pool, uI: s.I, uT: t, uCone: part === 'cone' ? 1 : 0, uPoolW: part === 'pool' ? 1 : 0 },
    'add',
  );
}

/** 0..1: how much a point on the ground (x, y) sits inside the pool */
export function litBy(s: Spot, x: number, y: number) {
  const d = Math.hypot((x - s.tgt[0]) / s.pool[0], (y - s.tgt[1]) / (s.pool[1] * 1.7));
  return s.I * (1 - clamp((d - 0.45) / 0.6));
}

// ---------------------------------------------------------------------------
// chatter: the crowd's words, popping in on the beat grid. Each slot shows a new
// fragment (or nothing) every two beats, staggered so they never all switch at once.

export const CHATTER = ['HAHAHA', 'UY!', 'GRABE', 'TARA!', 'SIGE NA', 'HOY', 'ANG SAYA', 'SABAY!', 'PICTURE!', 'GO!', 'ANO BA', 'HAHA', 'ISA PA!', 'LAKASAN!'];

export interface ChatSlot {
  x: number;
  y: number;
  /** font size */
  s: number;
}

export function chatter(
  c: CanvasRenderingContext2D, A: AudioData, t: number, slots: ChatSlot[], seed: number,
  o: { density?: number; alpha?: number; color?: PalName | string; words?: string[]; drift?: number } = {},
) {
  const words = o.words ?? CHATTER;
  const dens = o.density ?? 0.4;
  const alpha = o.alpha ?? 0.55;
  if (alpha <= 0.003) return;
  const b = A.beatAt(t);
  slots.forEach((sl, i) => {
    const bb = b / 2 + hash(i, seed, 1);
    const k = Math.floor(bb), ph = bb - k;
    if (hash(k, i, seed) > dens) return;
    const w = words[Math.floor(hash(k, i, seed, 2) * words.length)];
    const pop = ease.outBackSoft(clamp(ph / 0.1));
    const a = alpha * clamp(ph / 0.05) * (1 - clamp((ph - 0.55) / 0.4));
    if (a <= 0.003) return;
    const f = sans(sl.s, 640, 'semi-condensed', sl.s * 0.04);
    const L = layout(w, f);
    const x = sl.x + (hash(k, i, seed, 3) - 0.5) * 60 + (o.drift ?? 0);
    const y = sl.y + (hash(k, i, seed, 4) - 0.5) * 24 - ph * 6;
    c.save();
    c.translate(x, y);
    c.scale(pop, pop);
    c.rotate((hash(k, i, seed, 5) - 0.5) * 0.12);
    applyFont(c, f);
    c.fillStyle = rgba(o.color ?? 'ash', a);
    c.fillText(w, -L.w / 2, 0);
    c.restore();
  });
  c.letterSpacing = '0px';
  c.fontStretch = 'normal';
}
