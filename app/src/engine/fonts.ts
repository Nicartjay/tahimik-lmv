// Three voices:
//   serif  Fraunces        the inner voice: lyrics, sung, soft and warm (roman + italic)
//   sans   Archivo         the world outside: crowds, stage, the loud; width 62–125 %
//   mono   IBM Plex Mono   field notes: labels, marginalia, meters, the HUD

const BASE = import.meta.env.BASE_URL + 'fonts/';

const FACES: [string, string, FontFaceDescriptors][] = [
  ['Fraunces', 'Fraunces.ttf', { weight: '100 900', style: 'normal' }],
  ['Fraunces', 'Fraunces-Italic.ttf', { weight: '100 900', style: 'italic' }],
  ['Archivo', 'Archivo.ttf', { weight: '100 900', stretch: '62% 125%', style: 'normal' }],
  ['Archivo', 'Archivo-Italic.ttf', { weight: '100 900', stretch: '62% 125%', style: 'italic' }],
  ['Plex Mono', 'IBMPlexMono-Light.ttf', { weight: '300', style: 'normal' }],
  ['Plex Mono', 'IBMPlexMono-Regular.ttf', { weight: '400', style: 'normal' }],
  ['Plex Mono', 'IBMPlexMono-Medium.ttf', { weight: '500', style: 'normal' }],
  ['Plex Mono', 'IBMPlexMono-LightItalic.ttf', { weight: '300', style: 'italic' }],
  ['Plex Mono', 'IBMPlexMono-Italic.ttf', { weight: '400', style: 'italic' }],
];

export async function loadFonts() {
  await Promise.all(
    FACES.map(async ([family, file, desc]) => {
      const f = new FontFace(family, `url(${BASE}${file})`, desc);
      await f.load();
      document.fonts.add(f);
    }),
  );
  await document.fonts.ready;
}

export type Family = 'serif' | 'sans' | 'mono';
export type Stretch = CanvasFontStretch;

export interface FontSpec {
  family: Family;
  size: number;
  weight?: number;
  italic?: boolean;
  /** Archivo only: 'extra-condensed' (62.5 %) … 'expanded' (125 %) */
  stretch?: Stretch;
  /** letter-spacing in logical px */
  tracking?: number;
}

const NAMES: Record<Family, string> = {
  serif: 'Fraunces, Georgia, serif',
  sans: 'Archivo, Helvetica, sans-serif',
  mono: '"Plex Mono", ui-monospace, monospace',
};

export const fontCss = (f: FontSpec) =>
  `${f.italic ? 'italic ' : ''}${Math.round(f.weight ?? 400)} ${f.size}px ${NAMES[f.family]}`;

export function applyFont(c: CanvasRenderingContext2D, f: FontSpec) {
  c.font = fontCss(f);
  c.fontStretch = f.stretch ?? 'normal';
  c.letterSpacing = `${f.tracking ?? 0}px`;
}

/** shorthand constructors */
export const serif = (size: number, weight = 360, italic = false, tracking = 0): FontSpec => ({
  family: 'serif', size, weight, italic, tracking,
});
export const sans = (size: number, weight = 500, stretch: Stretch = 'normal', tracking = 0): FontSpec => ({
  family: 'sans', size, weight, stretch, tracking,
});
export const mono = (size: number, weight = 400, italic = false, tracking = 0): FontSpec => ({
  family: 'mono', size, weight, italic, tracking,
});

// ---- measurement ---------------------------------------------------------

let mctx: CanvasRenderingContext2D | null = null;
const measurer = () => (mctx ??= document.createElement('canvas').getContext('2d')!);
const cache = new Map<string, TextLayout>();

export interface TextLayout {
  /** glyph start x for each UTF-16 char index (kerning preserved: measured by prefix) */
  xs: number[];
  /** total advance */
  w: number;
  ascent: number;
  descent: number;
}

/** per-glyph layout of a string; draw glyph i at x + xs[i] to keep the font's kerning */
export function layout(text: string, f: FontSpec): TextLayout {
  const key = fontCss(f) + '|' + (f.stretch ?? '') + '|' + (f.tracking ?? 0) + '|' + text;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = measurer();
  applyFont(c, f);
  const xs: number[] = [];
  for (let i = 0; i < text.length; i++) xs.push(i === 0 ? 0 : c.measureText(text.slice(0, i)).width);
  const m = c.measureText(text || ' ');
  const res = { xs, w: m.width, ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
  cache.set(key, res);
  return res;
}

export const measure = (text: string, f: FontSpec) => layout(text, f).w;

/** advance of one glyph at index i */
export function glyphW(L: TextLayout, i: number) {
  return (i + 1 < L.xs.length ? L.xs[i + 1] : L.w) - L.xs[i];
}
