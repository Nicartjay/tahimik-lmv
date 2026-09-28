// Shared visual vocabulary for every plate.
//
//   grounds     nightBg (ink + fog + graph-paper grid), paperBg (warm paper + grid)
//   people      person() pictogram (head + tombstone body), crowd layouts
//   the self    firefly() — the alitaptap: the only warm, blooming light in the film
//   notes       callout(), ruler(), tick marks, plate corners, handwritten-ish marks
//   lyrics      lyricStack(): the default margin-placed karaoke block
//
// Canvas2D helpers draw in logical px. Glow helpers draw into an *additive* layer
// (compose it with mode 'add' and gain ≈ 2–3 so it clears the bloom threshold).

import { H, MARGIN, W } from '../engine/config';
import { applyFont, layout, mono, type FontSpec } from '../engine/fonts';
import { Pass, type RT } from '../engine/gl';
import { drawLine, lineAlpha, wrap, type KStyle } from '../engine/karaoke';
import type { Line } from '../engine/lyrics';
import { lin, rgba, type PalName } from '../engine/palette';
import { clamp, hash, lerp, mulberry32, noise1, smoothstep, TAU } from '../engine/util';

// ---------------------------------------------------------------------------
// grounds

const NIGHT = /* glsl */ `
uniform float uT, uGrid, uFog;
uniform vec3 uTop, uBot, uWarm; // warm = (x, y, strength): a faint pool of light around the firefly
uniform vec2 uOff;              // grid scroll, logical px
void main() {
  vec2 p = fragPx();
  vec2 uv = p / vec2(${W}., ${H}.);
  vec3 c = mix(uTop, uBot, smoothstep(0., 1., uv.y));
  float n = fbm(p * .0014 + vec2(uT * .012, uT * .004));
  c *= 1. + (n - .5) * uFog;
  vec2 q = p + uOff;
  vec2 g = abs(fract(q / 48. + .5) - .5) * 48.;
  vec2 G = abs(fract(q / 240. + .5) - .5) * 240.;
  float minor = pxLine(min(g.x, g.y), 1.);
  float major = pxLine(min(G.x, G.y), 1.);
  c = mix(c, C_SLATE, (minor * .28 + major * .55) * uGrid);
  float d = length(p - uWarm.xy);
  c += C_EMBER * uWarm.z * .05 * exp(-d / 320.);
  fragColor = vec4(c, 1.);
}`;

const PAPER = /* glsl */ `
uniform float uGrid, uAge;
uniform vec2 uOff;
void main() {
  vec2 p = fragPx();
  vec2 uv = p / vec2(${W}., ${H}.);
  vec3 c = C_PAPER;
  float fib = fbm(p * vec2(.004, .02)) * .6 + fbm(p * .03) * .4;
  c *= .955 + fib * .07;
  c = mix(c, c * vec3(.93, .87, .76), uAge * smoothstep(.35, 1.2, length(uv - .5) * 1.6));
  vec2 q = p + uOff;
  vec2 g = abs(fract(q / 32. + .5) - .5) * 32.;
  float minor = pxLine(min(g.x, g.y), 1.);
  c = mix(c, C_SEA * 1.1, minor * .16 * uGrid);
  fragColor = vec4(c, 1.);
}`;

let nightPass: Pass | null = null;
let paperPass: Pass | null = null;

export interface NightOpts {
  t: number;
  grid?: number;
  fog?: number;
  top?: PalName | string;
  bot?: PalName | string;
  warm?: [number, number, number];
  off?: [number, number];
}
export function nightBg(out: RT, o: NightOpts) {
  nightPass ??= new Pass(NIGHT);
  nightPass.draw(out, {
    uT: o.t, uGrid: o.grid ?? 0.35, uFog: o.fog ?? 0.35,
    uTop: lin(o.top ?? 'ink'), uBot: lin(o.bot ?? 'ink2'),
    uWarm: o.warm ?? [0, 0, 0], uOff: o.off ?? [0, 0],
  });
}

export function paperBg(out: RT, o: { grid?: number; age?: number; off?: [number, number] } = {}) {
  paperPass ??= new Pass(PAPER);
  paperPass.draw(out, { uGrid: o.grid ?? 1, uAge: o.age ?? 0.6, uOff: o.off ?? [0, 0] });
}

// ---------------------------------------------------------------------------
// people

/** where the quiet one usually stands: the left edge, on the ground line */
export const SELF = { x: 250, y: 812, h: 180 };
export const GROUND = 812;
/** chest-light intensity for the self at a given LIWANAG */
export const chestI = (liw: number) => 0.18 + liw * 0.9;

export interface PersonOpts {
  color?: PalName | string;
  alpha?: number;
  /** body lean, radians (positive leans right) */
  lean?: number;
  /** head tilt offset px */
  nod?: number;
  /** 0 = standing, 1 = hunched / small */
  shrink?: number;
  /** draw as an outline instead of filled */
  outline?: number;
}

/**
 * Pictogram person, feet at (x, y), height h. Returns the chest point (where the
 * firefly lives) and the head centre.
 */
export function person(c: CanvasRenderingContext2D, x: number, y: number, h: number, o: PersonOpts = {}) {
  const sh = o.shrink ?? 0;
  const hh = h * (1 - 0.08 * sh);
  const r = hh * 0.105;
  const bw = hh * (0.34 - 0.03 * sh);
  const bodyTop = y - hh * 0.7;
  c.save();
  c.translate(x, y);
  c.rotate(o.lean ?? 0);
  c.translate(-x, -y);
  c.globalAlpha *= o.alpha ?? 1;
  const col = rgba(o.color ?? 'ash');
  c.fillStyle = col;
  c.strokeStyle = col;
  // body: rounded-top tombstone, slightly tapered
  const top = bodyTop + hh * 0.04 * sh;
  c.beginPath();
  c.moveTo(x - bw * 0.44, y);
  c.lineTo(x - bw * 0.5, top + bw * 0.5);
  c.arc(x, top + bw * 0.5, bw * 0.5, Math.PI, 0);
  c.lineTo(x + bw * 0.44, y);
  c.closePath();
  if (o.outline) {
    c.lineWidth = o.outline;
    c.stroke();
  } else c.fill();
  // head
  const hx = x + (o.nod ?? 0) * 0.4;
  const hy = top - r - hh * 0.035 + Math.abs(o.nod ?? 0) * 0.15 + sh * hh * 0.03;
  c.beginPath();
  c.arc(hx, hy, r, 0, TAU);
  if (o.outline) c.stroke();
  else c.fill();
  c.restore();
  // chest point in the un-rotated frame (lean is small; good enough)
  const lean = o.lean ?? 0;
  const cy = top + bw * 0.62;
  return { chest: { x: x + Math.sin(lean) * (y - cy), y: cy }, head: { x: hx + Math.sin(lean) * (y - hy), y: hy }, h: hh };
}

export interface Placed {
  x: number;
  y: number;
  s: number;
  seed: number;
}

/** deterministic scatter of n people in a rect, min spacing d, sorted back to front */
export function scatter(seed: number, n: number, x0: number, y0: number, x1: number, y1: number, d: number): Placed[] {
  const rnd = mulberry32(seed);
  const pts: Placed[] = [];
  let tries = 0;
  while (pts.length < n && tries++ < n * 60) {
    const x = lerp(x0, x1, rnd()), y = lerp(y0, y1, rnd());
    if (pts.every((p) => Math.hypot((p.x - x) * 0.7, (p.y - y) * 1.6) > d)) pts.push({ x, y, s: 1, seed: Math.floor(rnd() * 1e6) });
  }
  return pts.sort((a, b) => a.y - b.y);
}

/** perspective size for a ground-plane y (horizon at hy, reference size at H) */
export const depthScale = (y: number, hy = H * 0.45, near = H) => clamp((y - hy) / (near - hy), 0.05, 2);

/** idle motion for a crowd member: small sway + bob, pure function of t */
export function idle(p: Placed, t: number, amt = 1) {
  const s = p.seed;
  return {
    dx: noise1(t * 0.35, s) * 5 * amt,
    lean: noise1(t * 0.5, s + 3) * 0.05 * amt,
    nod: noise1(t * 0.9, s + 7) * 4 * amt,
  };
}

/** talk marks: little arcs next to a head, for people who are speaking/laughing */
export function talk(c: CanvasRenderingContext2D, hx: number, hy: number, r: number, t: number, seed: number, o: { color?: string; alpha?: number; dir?: 1 | -1 } = {}) {
  const dir = o.dir ?? 1;
  const on = 0.5 + 0.5 * Math.sin(t * 7 + seed);
  c.save();
  c.strokeStyle = rgba(o.color ?? 'ash', (o.alpha ?? 0.6) * (0.35 + 0.65 * on));
  c.lineWidth = Math.max(1, r * 0.12);
  c.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const rr = r * (1.35 + i * 0.5 + on * 0.15);
    c.beginPath();
    c.arc(hx, hy, rr, dir > 0 ? -0.5 : Math.PI - 0.5, dir > 0 ? 0.5 : Math.PI + 0.5);
    c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------------------
// the alitaptap

export interface FlyOpts {
  /** 0..1+ intensity */
  I?: number;
  /** size multiplier */
  r?: number;
  seed?: number;
  t?: number;
  /** 0..1 slow breathing flicker */
  flicker?: number;
}

/** radial light into an additive glow layer: halo (ember) → body (glow) → pale core */
export function firefly(g: CanvasRenderingContext2D, x: number, y: number, o: FlyOpts = {}) {
  const r = o.r ?? 1;
  const fl = o.flicker ?? 0.2;
  const t = o.t ?? 0;
  const I = Math.max(0, (o.I ?? 1) * (1 - fl + fl * (0.5 + 0.5 * noise1(t * 1.3, o.seed ?? 0))));
  if (I <= 0.002) return;
  const blob = (rad: number, col: string, a: number) => {
    // a linear ramp to 0 at `rad` leaves a visible disc edge once the glow gain lifts it, so
    // the tail eases into 0 instead, reaching 25% further to keep about the same light inside
    const R = rad * 1.25;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, rgba(col, clamp(a)));
    for (const s of [0.35, 0.5, 0.65, 0.8, 0.9]) gr.addColorStop(s, rgba(col, clamp(a * 0.45 * ((1 - s) / 0.65) ** 1.8)));
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr;
    g.fillRect(x - R, y - R, R * 2, R * 2);
  };
  blob(90 * r * (0.6 + 0.4 * I), 'ember', 0.16 * I);
  blob(26 * r, 'glow', 0.55 * I);
  blob(6 * r, '#FFF6DC', Math.min(1, 1.2 * I));
}

/** a wandering path for a free-flying firefly (smooth, deterministic) */
export function flyPath(t: number, seed: number, cx: number, cy: number, rx: number, ry: number) {
  return {
    x: cx + rx * (noise1(t * 0.23, seed) * 0.7 + noise1(t * 0.61, seed + 1) * 0.3),
    y: cy + ry * (noise1(t * 0.19, seed + 2) * 0.7 + noise1(t * 0.53, seed + 3) * 0.3),
  };
}

// ---------------------------------------------------------------------------
// field-note marks

export function hairline(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 1) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/** dot at (ax, ay), elbow leader to a mono label at (bx, by). p = 0..1 draw-on */
export function callout(
  c: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, label: string,
  o: { color?: PalName | string; alpha?: number; p?: number; font?: FontSpec; align?: 'left' | 'right' } = {},
) {
  const p = clamp(o.p ?? 1);
  if (p <= 0) return;
  const col = rgba(o.color ?? 'ash', o.alpha ?? 0.8);
  const f = o.font ?? mono(12, 400, false, 1.4);
  c.fillStyle = col;
  c.beginPath();
  c.arc(ax, ay, 2.5, 0, TAU);
  c.fill();
  const mx = bx, my = by;
  const k = clamp(p * 1.6);
  c.strokeStyle = col;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(lerp(ax, mx, k), lerp(ay, my, k));
  c.stroke();
  const tp = clamp((p - 0.45) / 0.55);
  if (tp > 0) {
    const L = layout(label, f);
    const n = tp * label.length;
    const right = o.align === 'right';
    const x = right ? bx - L.w - 8 : bx + 8;
    applyFont(c, f);
    for (let i = 0; i < Math.min(label.length, Math.ceil(n)); i++) {
      c.globalAlpha = (o.alpha ?? 0.8) * clamp(n - i);
      c.fillStyle = rgba(o.color ?? 'ash');
      c.fillText(label[i], x + L.xs[i], by + f.size * 0.35);
    }
    c.globalAlpha = 1;
    c.letterSpacing = '0px';
  }
}

/** horizontal measuring rule with ticks every `step` px */
export function ruler(c: CanvasRenderingContext2D, x0: number, x1: number, y: number, step: number, color: string, p = 1) {
  const xe = lerp(x0, x1, clamp(p));
  hairline(c, x0, y, xe, y, color);
  c.strokeStyle = color;
  c.beginPath();
  for (let x = x0, i = 0; x <= xe + 0.01; x += step, i++) {
    const h = i % 5 === 0 ? 9 : 4;
    c.moveTo(x, y);
    c.lineTo(x, y - h);
  }
  c.stroke();
}

/** registration crosses in the plate corners (field-notes plate) */
export function plateCorners(c: CanvasRenderingContext2D, color: string, inset = 40, s = 9) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  for (const [x, y] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]]) {
    c.moveTo(x - s, y);
    c.lineTo(x + s, y);
    c.moveTo(x, y - s);
    c.lineTo(x, y + s);
  }
  c.stroke();
}

/** a slightly wobbly pencil stroke through points (deterministic wobble) */
export function pencil(c: CanvasRenderingContext2D, pts: [number, number][], color: string, w = 1.4, seed = 1, wob = 1.2) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  pts.forEach(([x, y], i) => {
    const dx = (hash(i, seed) - 0.5) * wob, dy = (hash(i, seed + 9) - 0.5) * wob;
    if (i === 0) c.moveTo(x + dx, y + dy);
    else c.lineTo(x + dx, y + dy);
  });
  c.stroke();
}

// ---------------------------------------------------------------------------
// lyrics

export interface StackOpts {
  x: number;
  /** baseline of the newest line */
  y: number;
  font: FontSpec;
  lh?: number;
  align?: 'left' | 'center' | 'right';
  maxW?: number;
  /** older lines move up by lh and dim by this factor per step */
  olderDim?: number;
  /** how many older lines stay visible */
  keep?: number;
  style?: Partial<KStyle>;
  glow?: CanvasRenderingContext2D | null;
  /** global alpha */
  alpha?: number;
  lead?: number;
  /** direction older lines travel: -1 up (default), +1 down */
  dir?: -1 | 1;
}

/**
 * The default karaoke block: the newest line sits at (x, y); as a new line arrives
 * the older ones glide up one line-height and dim. Wraps long lines to maxW.
 */
export function lyricStack(c: CanvasRenderingContext2D, lines: Line[], t: number, o: StackOpts) {
  const lh = o.lh ?? o.font.size * 1.3;
  const lead = o.lead ?? 0.4;
  const keep = o.keep ?? 1;
  const dimK = o.olderDim ?? 0.4;
  const dir = o.dir ?? -1;
  const maxW = o.maxW ?? W - 2 * MARGIN;
  const vis = lines.filter((l) => t >= l.start - lead - 0.6);
  // rows per line (wrapping) so older lines move by the right amount
  const rowsOf = (l: Line) => wrap(l, o.font, maxW);
  for (let k = 0; k < vis.length; k++) {
    const l = vis[k];
    // continuous "age" = how many later lines have arrived (smoothly), in rows
    let shift = 0, age = 0;
    for (let j = k + 1; j < vis.length; j++) {
      const a = smoothstep(vis[j].start - lead - 0.45, vis[j].start - lead + 0.1, t);
      shift += a * rowsOf(vis[j]).length;
      age += a;
    }
    const env = lineAlpha(l, t, 0.35, 99, 0.5, lead);
    const out = 1 - smoothstep(keep, keep + 1, age);
    const fadeEnd = 1 - smoothstep(l.end + 6, l.end + 7, t);
    const a = env * out * fadeEnd * Math.pow(dimK, Math.min(age, keep + 1)) * (o.alpha ?? 1);
    if (a <= 0.003) continue;
    const rows = rowsOf(l);
    const y0 = o.y + dir * shift * lh - (dir < 0 ? (rows.length - 1) * lh : 0);
    rows.forEach((r, i) =>
      drawLine(c, l, t, o.x, y0 + i * lh, { font: o.font, align: o.align, lead, glow: o.glow, ...o.style, alpha: a }, r),
    );
  }
}

/** a firefly-coloured dot that sits on the glyph currently being sung (for glow layers) */
export function singDot(g: CanvasRenderingContext2D, x: number, y: number, I: number) {
  if (I <= 0) return;
  firefly(g, x, y, { I: I * 0.6, r: 0.5, flicker: 0 });
}

export const inkOn = (paper: boolean) => (paper ? 'pencil' : 'paper');
