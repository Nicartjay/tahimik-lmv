// Night-and-paper palette. Only `glow` / `ember` are allowed to bloom: the one warm
// light in the video is the quiet person's own. Everyone else is cool and neutral.
export const PAL = {
  ink: '#0A0B0F', //    night / primary ground
  ink2: '#13151B', //   panels, far planes
  slate: '#262A33', //  faint structure on dark
  graphite: '#585D68', // hairlines on dark
  ash: '#9A9EA6', //    secondary type, other people
  paper: '#EEE9DE', //  paper, lyric type, light fields
  pencil: '#3A3833', // ink on paper
  sea: '#6E93A0', //    cool accent: water, crowd shimmer, stage light
  glow: '#FFD66B', //   alitaptap gold: the self (the only hot colour)
  ember: '#FF9F43', //  warm halo of the glow
  dawn: '#C9A7A0', //   bridge only: first light
} as const;

export type PalName = keyof typeof PAL;
export type RGB = [number, number, number];

export function hex2rgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

export const srgb2lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const resolve = (c: PalName | string) => (c in PAL ? PAL[c as PalName] : c);

/** sRGB 0..1 */
export const rgb = (c: PalName | string): RGB => hex2rgb(resolve(c));
/** linear 0..1, for GL uniforms */
export const lin = (c: PalName | string): RGB => rgb(c).map(srgb2lin) as RGB;

/** CSS colour string for Canvas2D */
export function rgba(c: PalName | string, a = 1): string {
  const [r, g, b] = rgb(c);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

/** mix two palette colours in sRGB, as a CSS string */
export function mix(a: PalName | string, b: PalName | string, t: number, alpha = 1): string {
  const A = rgb(a), B = rgb(b);
  const k = Math.min(1, Math.max(0, t));
  const c = A.map((v, i) => Math.round((v + (B[i] - v) * k) * 255));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export const GLSL_PALETTE = Object.entries(PAL)
  .map(([k, v]) => `const vec3 C_${k.toUpperCase()} = vec3(${lin(v).map((x) => x.toFixed(5)).join(',')});`)
  .join('\n');
