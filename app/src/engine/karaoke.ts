// Word-synced lyric typography. Every glyph's look is a pure function of t and the
// aligned char onsets: unsung glyphs sit dim, sung glyphs are full paper, the glyph
// being sung (and a short tail after it) is tinted towards `hot`. Never leads the voice:
// words may appear dimly up to `lead` seconds early, but only colour on their onset.

import { applyFont, layout, measure, type FontSpec, type TextLayout } from './fonts';
import { Lyrics, type Line } from './lyrics';
import { mix, type PalName } from './palette';
import { clamp, smoothstep } from './util';

export interface GlyphCtx {
  ch: string;
  /** word index in the line, char index in the word, glyph index in the line */
  wi: number;
  ci: number;
  gi: number;
  /** glyph origin (baseline-left) and advance, logical px */
  x: number;
  y: number;
  w: number;
  /** char sung-progress 0..1, word progress 0..1 */
  p: number;
  wp: number;
  /** seconds since this char's onset (negative before) */
  since: number;
  /** 0..1 "being sung right now" heat */
  heat: number;
  t: number;
}

export interface GlyphFx {
  dx?: number;
  dy?: number;
  rot?: number;
  scale?: number;
  alpha?: number;
  /** override colour (css) */
  color?: string;
}

export interface KStyle {
  font: FontSpec;
  /** sung colour */
  color?: PalName | string;
  /** alpha of visible-but-unsung glyphs */
  dim?: number;
  /** tint for the glyph being sung; null = none */
  hot?: PalName | string | null;
  hotAmt?: number;
  /** seconds the hot tint lingers after a glyph is sung */
  hotDecay?: number;
  /** how early (s) a word appears, dimly, before its onset; Infinity = whole line visible */
  lead?: number;
  /** global alpha multiplier */
  alpha?: number;
  /** if set, hot glyphs are also painted here (an additive light layer) */
  glow?: CanvasRenderingContext2D | null;
  glowColor?: PalName | string;
  glowAmt?: number;
  /** a glow floor for already-sung glyphs (0 = only hot glyphs glow) */
  glowSung?: number;
  align?: 'left' | 'center' | 'right';
  fx?: (g: GlyphCtx) => GlyphFx | void;
}

export interface LineLayout {
  words: { x: number; L: TextLayout }[];
  w: number;
  space: number;
}

const LL = new Map<string, LineLayout>();

export function lineLayout(line: Line, font: FontSpec, wordIdx?: number[]): LineLayout {
  const idx = wordIdx ?? line.words.map((_, i) => i);
  const key = `${line.i}|${idx.join(',')}|${JSON.stringify(font)}`;
  const hit = LL.get(key);
  if (hit) return hit;
  const space = measure(' ', font);
  const words: LineLayout['words'] = [];
  let x = 0;
  for (const i of idx) {
    const L = layout(line.words[i].w, font);
    words.push({ x, L });
    x += L.w + space;
  }
  const res = { words, w: Math.max(0, x - space), space };
  LL.set(key, res);
  return res;
}

export const lineWidth = (line: Line, font: FontSpec) => lineLayout(line, font).w;

/** greedy wrap into rows of word indices */
export function wrap(line: Line, font: FontSpec, maxW: number): number[][] {
  const space = measure(' ', font);
  const rows: number[][] = [];
  let row: number[] = [];
  let w = 0;
  line.words.forEach((wd, i) => {
    const ww = measure(wd.w, font);
    if (row.length && w + space + ww > maxW) {
      rows.push(row);
      row = [];
      w = 0;
    }
    w += (row.length ? space : 0) + ww;
    row.push(i);
  });
  if (row.length) rows.push(row);
  return rows;
}

/** per-char heat: 1 while being sung, decays after */
function heatOf(p: number, since: number, dur: number, decay: number) {
  if (p <= 0) return 0;
  if (p < 1) return 1;
  return Math.exp(-Math.max(0, since - dur) / Math.max(1e-3, decay));
}

/**
 * Draw one line (or a subset of its words) at baseline (x, y). Returns the drawn span.
 */
export function drawLine(
  c: CanvasRenderingContext2D,
  line: Line,
  t: number,
  x: number,
  y: number,
  s: KStyle,
  wordIdx?: number[],
): { x0: number; w: number } {
  const LY = lineLayout(line, s.font, wordIdx);
  const idx = wordIdx ?? line.words.map((_, i) => i);
  const x0 = s.align === 'center' ? x - LY.w / 2 : s.align === 'right' ? x - LY.w : x;
  const color = s.color ?? 'paper';
  const dim = s.dim ?? 0.3;
  const hot = s.hot === undefined ? 'glow' : s.hot;
  const hotAmt = s.hotAmt ?? 0.5;
  const decay = s.hotDecay ?? 0.35;
  const lead = s.lead ?? 0.4;
  const A = s.alpha ?? 1;
  if (A <= 0.002) return { x0, w: LY.w };

  applyFont(c, s.font);
  c.textAlign = 'left';
  if (s.glow) {
    applyFont(s.glow, s.font);
    s.glow.textAlign = 'left';
  }

  let gi = 0;
  idx.forEach((wi, k) => {
    const word = line.words[wi];
    const wx = x0 + LY.words[k].x;
    const L = LY.words[k].L;
    const appear = lead === Infinity ? 1 : smoothstep(word.start - lead, word.start - lead * 0.2, t);
    const wp = Lyrics.wordProgress(word, t);
    for (let ci = 0; ci < word.w.length; ci++, gi++) {
      const ch = word.w[ci];
      const cs = word.c[ci] ?? word.start;
      const ce = ci + 1 < word.c.length ? word.c[ci + 1] : word.end;
      const p = Lyrics.charProgress(word, ci, t);
      const since = t - cs;
      const heat = heatOf(p, since, ce - cs, decay);
      const gx = wx + L.xs[ci];
      const gw = (ci + 1 < L.xs.length ? L.xs[ci + 1] : L.w) - L.xs[ci];
      const a0 = appear * (dim + (1 - dim) * smoothstep(0, 1, p));
      const fx = s.fx?.({ ch, wi, ci, gi, x: gx, y, w: gw, p, wp, since, heat, t }) ?? undefined;
      const alpha = clamp(a0 * A * (fx?.alpha ?? 1));
      if (alpha <= 0.003 || ch === ' ') continue;
      const col = fx?.color ?? (hot && heat > 0.001 ? mix(color, hot, heat * hotAmt) : mix(color, color, 0));
      const tf = fx && (fx.dx || fx.dy || fx.rot || (fx.scale !== undefined && fx.scale !== 1));
      const paint = (cc: CanvasRenderingContext2D, style: string, al: number) => {
        cc.globalAlpha = al;
        cc.fillStyle = style;
        if (tf) {
          cc.save();
          cc.translate(gx + gw / 2 + (fx!.dx ?? 0), y + (fx!.dy ?? 0));
          if (fx!.rot) cc.rotate(fx!.rot);
          if (fx!.scale !== undefined) cc.scale(fx!.scale, fx!.scale);
          cc.fillText(ch, -gw / 2, 0);
          cc.restore();
        } else cc.fillText(ch, gx, y);
      };
      paint(c, col, alpha);
      if (s.glow) {
        const g = Math.max(heat, p >= 1 ? (s.glowSung ?? 0) : 0) * (s.glowAmt ?? 1) * A * appear;
        if (g > 0.003) paint(s.glow, mix(s.glowColor ?? 'glow', s.glowColor ?? 'glow', 0), clamp(g));
      }
    }
  });
  c.globalAlpha = 1;
  if (s.glow) s.glow.globalAlpha = 1;
  return { x0, w: LY.w };
}

/** wrapped multi-row line; y is the first baseline. Returns row count. */
export function drawBlock(
  c: CanvasRenderingContext2D,
  line: Line,
  t: number,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  s: KStyle,
): number {
  const rows = wrap(line, s.font, maxW);
  rows.forEach((r, i) => drawLine(c, line, t, x, y + i * lh, s, r));
  return rows.length;
}

/** envelope for a line: fades in `fin` before its first word, out `fout` after end + hold */
export function lineAlpha(line: Line, t: number, fin = 0.35, hold = 0.9, fout = 0.5, lead = 0.4) {
  const a = smoothstep(line.start - lead - fin, line.start - lead, t);
  const b = 1 - smoothstep(line.end + hold, line.end + hold + fout, t);
  return Math.min(a, b);
}

/** plain text helper (labels, marginalia) */
export function text(
  c: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  font: FontSpec,
  color: string,
  align: CanvasTextAlign = 'left',
) {
  applyFont(c, font);
  c.textAlign = align;
  c.fillStyle = color;
  c.fillText(s, x, y);
  c.textAlign = 'left';
}

/**
 * typewriter reveal: first n chars (fractional n fades the last char in).
 * Sets globalAlpha itself (and resets it to 1), so fade the text with `alpha`, not the context.
 */
export function typed(
  c: CanvasRenderingContext2D,
  s: string,
  n: number,
  x: number,
  y: number,
  font: FontSpec,
  color: string,
  alpha = 1,
) {
  const L = layout(s, font);
  applyFont(c, font);
  c.textAlign = 'left';
  c.fillStyle = color;
  const k = Math.min(s.length, Math.floor(n));
  for (let i = 0; i < Math.min(s.length, k + 1); i++) {
    c.globalAlpha = alpha * (i < k ? 1 : n - k);
    if (c.globalAlpha > 0.003) c.fillText(s[i], x + L.xs[i], y);
  }
  c.globalAlpha = 1;
  return L.w;
}
