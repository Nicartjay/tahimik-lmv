// TALA 08 · BULSA — "May mga kwento sa dibdib / Nakatupi sa bulsa ng pantalon /
// Gustong-gusto kong ilabas / Pero nanahimik na lang".
// A paper plate: a jeans back pocket drawn in pencil, lower-left, stuffed with folded
// notes. They are counted on "kwento" (7). On "Gustong-gusto" one note tugs twice,
// rises on "kong" and half-unfolds on "ilabas" — little stories inside — then on
// "nanahimik" it folds shut and slides back into the pocket by "lang".

import { MARGIN, W } from '../engine/config';
import { applyFont, layout, mono, serif, type FontSpec } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { text } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, hash, keys, lerp, noise1, prog, smoothstep, TAU, type Pt } from '../engine/util';
import { callout, hairline, lyricStack, paperBg, pencil } from './_motifs';

// ---------------------------------------------------------------------------
// geometry

const PK = { x0: 232, x1: 688, y0: 566, y2: 846, y3: 918 };
const XM = (PK.x0 + PK.x1) / 2;
const POCKET: Pt[] = [[PK.x0, PK.y0], [PK.x1, PK.y0], [PK.x1 - 12, PK.y2], [XM, PK.y3], [PK.x0 + 12, PK.y2]];
/** bottom edge of the notes, hidden inside the pocket */
const BASE = PK.y0 + 90;

interface Note {
  x: number;
  w: number;
  h: number;
  rot: number;
  tint: string;
  seed: number;
  /** dog-eared corner: -1 left, 1 right */
  dog?: -1 | 1;
}

// back → front; the hero (the one that rises) is drawn separately
const NOTES: Note[] = [
  { x: 350, w: 96, h: 150, rot: -0.3, tint: '#E6E0D2', seed: 1 },
  { x: 632, w: 92, h: 156, rot: 0.3, tint: '#EDE7DA', seed: 2, dog: 1 },
  { x: 296, w: 116, h: 196, rot: -0.15, tint: '#F3EEE3', seed: 3 },
  { x: 586, w: 118, h: 182, rot: 0.19, tint: '#E9E3D6', seed: 4 },
  { x: 376, w: 104, h: 244, rot: -0.05, tint: '#F6F1E7', seed: 5, dog: -1 },
  { x: 540, w: 108, h: 228, rot: 0.1, tint: '#EFE9DC', seed: 6 },
];
const HERO: Note = { x: 462, w: 132, h: 210, rot: 0.025, tint: '#F7F2E8', seed: 7 };
/** counted left to right on "kwento" */
const COUNT = [...NOTES, HERO].map((n, i) => ({ n, i })).sort((a, b) => a.n.x - b.n.x);

const HAND = serif(14, 380, true);
const HAND_S = serif(12, 380, true);
const RULE = 22;
// what is written inside the hero note (row index on the ruled lines → text)
const INSIDE_A: [number, string][] = [
  [0, 'yung aso naming'],
  [1, 'si Bantay…'],
  [3, 'pangarap kong'],
  [4, 'maging'],
  [6, 'sana sinabi ko…'],
];
const INSIDE_B: [number, string][] = [
  [1, 'ika-3 ng Hulyo'],
  [3, 'ang dami kong'],
  [4, 'gustong sabihin'],
];

// ---------------------------------------------------------------------------
// drawing helpers

/** inward offset of a convex polygon */
function inset(P: Pt[], d: number): Pt[] {
  const n = P.length;
  let A = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n];
    A += x0 * y1 - x1 * y0;
  }
  const s = A > 0 ? 1 : -1;
  const L = P.map((p, i) => {
    const q = P[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    return { x: p[0] + (-dy / len) * s * d, y: p[1] + (dx / len) * s * d, dx, dy };
  });
  return L.map((b, i) => {
    const a = L[(i - 1 + n) % n];
    const cr = a.dx * b.dy - a.dy * b.dx;
    const k = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / cr;
    return [a.x + a.dx * k, a.y + a.dy * k] as Pt;
  });
}

function poly(c: CanvasRenderingContext2D, P: Pt[], close = true) {
  c.beginPath();
  P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
}

/** handwriting-ish: italic serif, glyphs nudged off the baseline deterministically */
function hand(c: CanvasRenderingContext2D, s: string, x: number, y: number, f: FontSpec, seed: number, alpha: number) {
  const L = layout(s, f);
  applyFont(c, f);
  c.fillStyle = rgba('pencil', alpha);
  for (let i = 0; i < s.length; i++) {
    const dy = (hash(i, seed) - 0.5) * 1.6 + Math.sin(i * 0.7 + seed) * 0.5;
    c.save();
    c.translate(x + L.xs[i], y + dy);
    c.rotate((hash(i, seed + 5) - 0.5) * 0.08);
    c.fillText(s[i], 0, 0);
    c.restore();
  }
  c.letterSpacing = '0px';
  return L.w;
}

/** ruled notebook lines across a panel [x0,x1] × [y0,y1] */
function rules(c: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, step: number, a: number) {
  c.fillStyle = rgba('sea', a);
  for (let y = y0 + step; y < y1 - 2; y += step) c.fillRect(x0, y, x1 - x0, 0.8);
}

/** the outside of a folded note (local: origin at bottom-centre, fold along the top edge) */
function packet(c: CanvasRenderingContext2D, n: Note) {
  const { w, h } = n;
  const x0 = -w / 2;
  c.fillStyle = n.tint;
  c.fillRect(x0, -h, w, h);
  rules(c, x0, x0 + w, -h, 0, 14, 0.16);
  // the fold is the top edge: a little shadow under it, and a quarter-fold crease
  let g = c.createLinearGradient(0, -h, 0, -h + 34);
  g.addColorStop(0, rgba('pencil', 0.13));
  g.addColorStop(1, rgba('pencil', 0));
  c.fillStyle = g;
  c.fillRect(x0, -h, w, 34);
  const cy = -h * 0.52;
  g = c.createLinearGradient(0, cy, 0, cy + 26);
  g.addColorStop(0, rgba('pencil', 0.1));
  g.addColorStop(1, rgba('pencil', 0));
  c.fillStyle = g;
  c.fillRect(x0, cy, w, 26);
  c.fillStyle = rgba('pencil', 0.22);
  c.fillRect(x0, cy, w, 0.8);
  // stacked paper layers along one side
  c.fillStyle = rgba('pencil', 0.2);
  const side = n.seed % 2 ? 1 : -1;
  for (let k = 1; k <= 2; k++) c.fillRect(side > 0 ? x0 + w + k * 1.6 - 0.5 : x0 - k * 1.6, -h + 3 * k, 0.8, h - 3 * k);
  c.strokeStyle = rgba('pencil', 0.6);
  c.lineWidth = 1;
  c.strokeRect(x0, -h, w, h);
  if (n.dog) {
    const d = 18, xc = n.dog > 0 ? x0 + w : x0;
    c.fillStyle = '#DAD3C3';
    c.beginPath();
    c.moveTo(xc, -h + d);
    c.lineTo(xc - n.dog * d, -h);
    c.lineTo(xc - n.dog * d, -h + d);
    c.closePath();
    c.fill();
    c.stroke();
  }
}

// ---------------------------------------------------------------------------

export default class Bulsa extends Scene {
  lines = this.lyrics.between(this.ctx.start, this.ctx.end - 0.5).filter((l) => l.start > this.ctx.start - 1);
  lKwento = this.lyrics.find('May mga kwento', this.ctx.start - 2);
  lTupi = this.lyrics.find('Nakatupi', this.ctx.start - 2);
  lGusto = this.lyrics.find('Gustong-gusto', this.ctx.start - 2);
  lTahimik = this.lyrics.find('Pero nanahimik', this.ctx.start - 2);

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const kwento = Lyrics.word(this.lKwento, 'kwento');
    const tupi = Lyrics.word(this.lTupi, 'Nakatupi');
    const bulsa = Lyrics.word(this.lTupi, 'bulsa');
    const gusto = Lyrics.word(this.lGusto, 'Gustong-gusto');
    const kong = Lyrics.word(this.lGusto, 'kong');
    const ilabas = Lyrics.word(this.lGusto, 'ilabas');
    const nanahimik = Lyrics.word(this.lTahimik, 'nanahimik');
    const lang = Lyrics.word(this.lTahimik, 'lang');

    paperBg(out, { grid: 0.85, age: 0.55 });
    const c = this.layer(0).begin();
    const pulse = A.beatPulse(t, 0.16);

    // -- the hero's journey: tugs, rise, half-unfold, refold, back in ------------
    const bump = (t0: number, d = 0.45) => Math.sin(clamp((t - t0) / d) * Math.PI);
    const tug = 24 * bump(gusto.start) + 30 * bump(gusto.c[8] ?? gusto.start + 0.6);
    const u = keys(t, [
      [kong.start - 0.1, 0],
      [ilabas.start + 0.45, 1, ease.inOutCubic],
      [nanahimik.start + 0.5, 1],
      [lang.end - 0.02, 0, ease.inOutCubic],
    ]);
    const open = keys(t, [
      [ilabas.start - 0.08, 0],
      [ilabas.start + 0.7, 0.64 * Math.PI, ease.outCubic],
      [nanahimik.start, 0.58 * Math.PI, ease.inOutSine],
      [nanahimik.start + 0.6, 0, ease.inOutCubic],
    ]);
    const openW = smoothstep(0.1, 0.5, open / Math.PI);
    const phi = open + 0.035 * Math.PI * Math.sin((t - ilabas.start) * TAU * 2.2) * openW * (1 - prog(t, nanahimik.start - 0.2, nanahimik.start));
    const lift = 118;
    const yb = lerp(BASE, BASE - lift, smoothstep(0, 0.4, u));
    const hero = {
      x: lerp(HERO.x, 846, smoothstep(0.25, 1, u)),
      y: lerp(yb, 700, smoothstep(0.3, 1, u)) - Math.sin(smoothstep(0.3, 1, u) * Math.PI) * 60 - tug,
      s: lerp(1, 1.7, smoothstep(0.3, 1, u)),
      rot: lerp(HERO.rot, -0.04, smoothstep(0.3, 1, u)) + 0.006 * Math.sin(t * TAU * 4.5) * openW,
      inPocket: u < 0.35,
    };
    const busy = smoothstep(0.02, 0.3, u); // annotations step back while the note is out

    // -- the jeans around the pocket: yoke seam + side seam, faint ------------
    const faint = rgba('pencil', 0.28);
    c.setLineDash([5, 4]);
    pencil(c, [[150, 456], [330, 432], [520, 410], [700, 392], [930, 376]], faint, 1, 11, 1.4);
    pencil(c, [[150, 466], [330, 442], [520, 420], [700, 402], [930, 386]], faint, 1, 12, 1.4);
    c.setLineDash([]);
    pencil(c, [[150, 446], [330, 422], [520, 400], [700, 382], [930, 366]], rgba('pencil', 0.36), 1.1, 13, 1.2);
    pencil(c, [[922, 368], [928, 520], [936, 700], [942, 880]], rgba('pencil', 0.3), 1.1, 14, 1.2);

    // -- notes in the pocket (clipped at the opening) ---------------------------
    const counted = COUNT.map((e, k) => {
      const k0 = Math.ceil(A.beatAt(kwento.start) * 2) / 2;
      return { ...e, at: A.timeOfBeat(k0 + k * 0.5) };
    });
    const liftOf = (i: number) => {
      const e = counted.find((q) => q.i === i)!;
      return 10 * bump(e.at, 0.5);
    };
    c.save();
    c.beginPath();
    c.rect(0, 0, W, PK.y0);
    c.clip();
    NOTES.forEach((n, i) => {
      const dy = -pulse * 2.4 * (0.5 + hash(n.seed)) - liftOf(i);
      c.save();
      c.translate(n.x, BASE + dy);
      c.rotate(n.rot + noise1(t * 0.4, n.seed) * 0.012);
      packet(c, n);
      c.restore();
    });
    if (hero.inPocket) this.drawHero(c, hero.x, hero.y - pulse * 2 - liftOf(NOTES.length), hero.s, hero.rot, phi);
    c.restore();

    // -- the pocket -------------------------------------------------------------
    poly(c, POCKET);
    c.fillStyle = rgba('sea', 0.09);
    c.fill();
    c.save();
    poly(c, POCKET);
    c.clip();
    // denim twill
    c.strokeStyle = rgba('pencil', 0.075);
    c.lineWidth = 0.8;
    c.beginPath();
    for (let k = -40; k < 110; k++) {
      const x = PK.x0 - 200 + k * 7;
      c.moveTo(x, PK.y3 + 10);
      c.lineTo(x + 210, PK.y0 - 10);
    }
    c.stroke();
    // depth under the opening
    const g = c.createLinearGradient(0, PK.y0, 0, PK.y0 + 26);
    g.addColorStop(0, rgba('pencil', 0.16));
    g.addColorStop(1, rgba('pencil', 0));
    c.fillStyle = g;
    c.fillRect(PK.x0, PK.y0, PK.x1 - PK.x0, 26);
    c.restore();
    c.lineJoin = 'round';
    poly(c, POCKET);
    c.strokeStyle = rgba('pencil', 0.82);
    c.lineWidth = 1.5;
    c.stroke();
    // hem at the opening
    hairline(c, PK.x0 + 1, PK.y0 + 26, PK.x1 - 1, PK.y0 + 26, rgba('pencil', 0.3));
    // double top-stitch, and the decorative arcs
    c.setLineDash([6, 4]);
    c.lineWidth = 0.9;
    c.strokeStyle = rgba('pencil', 0.55);
    for (const d of [9, 15]) {
      const P = inset(POCKET, d);
      poly(c, P);
      c.stroke();
    }
    c.strokeStyle = rgba('pencil', 0.34);
    for (const d of [0, 7]) {
      c.beginPath();
      c.moveTo(PK.x0 + 40, PK.y0 + 150 + d);
      c.bezierCurveTo(PK.x0 + 140, PK.y0 + 214 + d, XM - 30, PK.y0 + 190 + d, XM, PK.y0 + 150 + d);
      c.bezierCurveTo(XM + 30, PK.y0 + 190 + d, PK.x1 - 140, PK.y0 + 214 + d, PK.x1 - 40, PK.y0 + 150 + d);
      c.stroke();
    }
    c.setLineDash([]);
    // rivets
    for (const x of [PK.x0 + 14, PK.x1 - 14]) {
      c.strokeStyle = rgba('pencil', 0.75);
      c.lineWidth = 1.1;
      c.beginPath();
      c.arc(x, PK.y0 + 13, 6.5, 0, TAU);
      c.stroke();
      c.fillStyle = rgba('pencil', 0.55);
      c.beginPath();
      c.arc(x, PK.y0 + 13, 2.2, 0, TAU);
      c.fill();
    }

    // -- field notes ---------------------------------------------------------------
    const k = (a: number, d = 1.1) => prog(t, a, a + d, ease.outCubic);
    const ann = 0.75 * (1 - 0.8 * busy);
    // the count: each note gets its number as it is counted, on eighth notes
    let n = 0;
    counted.forEach((e) => {
      if (t < e.at) return;
      n++;
      const a = prog(t, e.at, e.at + 0.18) * ann * (1 - 0.6 * prog(t, e.at + 2.5, e.at + 4));
      const isHero = e.i === NOTES.length;
      const r = isHero ? hero.rot : e.n.rot, hh = isHero ? HERO.h * hero.s + 16 : e.n.h + 16;
      const bx = isHero ? hero.x : e.n.x, by = isHero ? hero.y : BASE - liftOf(e.i);
      c.globalAlpha = a * (isHero ? 1 - busy : 1);
      text(c, String(n), bx + Math.sin(r) * hh, by - Math.cos(r) * hh + 4, mono(11, 500), rgba('pencil', 0.8), 'center');
      c.globalAlpha = 1;
    });
    const kn = COUNT.find((q) => q.i === 5)!.n;
    callout(c, kn.x + 20, BASE - kn.h - 6, kn.x + 170, BASE - kn.h - 86, `KWENTO  ·  ${Math.max(1, n)}`, {
      p: k(kwento.start - 0.15), color: 'pencil', alpha: ann,
    });
    const tn = NOTES[2];
    const creaseY = BASE - tn.h * 0.52;
    callout(c, tn.x - 26, creaseY + 4, 150, creaseY - 150, 'NAKATUPI', { p: k(tupi.start), color: 'pencil', alpha: ann });

    // pocket depth, dimensioned on "bulsa"
    const dp = prog(t, bulsa.start, bulsa.start + 1.0, ease.inOutCubic);
    if (dp > 0) {
      const dx = PK.x1 + 48, col = rgba('pencil', 0.6 * (1 - 0.8 * busy));
      const y1 = lerp(PK.y0, PK.y3, dp);
      hairline(c, dx, PK.y0, dx, y1, col);
      hairline(c, dx - 6, PK.y0, dx + 6, PK.y0, col);
      if (dp >= 1) hairline(c, dx - 6, PK.y3, dx + 6, PK.y3, col);
      c.globalAlpha = prog(t, bulsa.start + 0.6, bulsa.start + 1.2) * (1 - 0.8 * busy);
      text(c, 'LALIM  ·  16 CM', dx + 14, (PK.y0 + PK.y3) / 2 + 4, mono(12, 400, false, 1.6), rgba('pencil', 0.7));
      c.globalAlpha = 1;
    }
    c.globalAlpha = 0.6;
    text(c, 'FIG. 08  ·  BULSA NG PANTALON, KALIWA', XM + 44, PK.y3 + 24, mono(11, 400, false, 1.8), rgba('pencil', 0.8));
    c.globalAlpha = 1;

    if (!hero.inPocket) this.drawHero(c, hero.x, hero.y, hero.s, hero.rot, phi);

    // -- lyrics, right margin -----------------------------------------------------
    lyricStack(c, this.lines, t, {
      x: W - MARGIN - 44, y: 742, font: serif(56, 360), lh: 72, align: 'right', keep: 1, maxW: 780, olderDim: 0.45,
      style: { color: 'pencil', dim: 0.2, hot: 'ember', hotAmt: 0.4 },
    });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }] });
    const cut = this.params.cut as number;
    return {
      hudInk: true,
      vignette: 0.26,
      grain: 0.035,
      zoom: 1 + 0.008 * Math.sin((t - cut) * TAU * 0.04) + 0.022 * smoothstep(0.4, 1, u),
    };
  }

  /**
   * The hero note at (x, y) = bottom-centre, scale s. phi = unfold angle of the top
   * flap B about the hinge (0 = folded shut, π = flat open). Panel A (below the hinge)
   * shows its written inside; B shows its outside until it passes vertical.
   */
  private drawHero(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, phi: number) {
    const { w, h } = HERO;
    const x0 = -w / 2;
    const cp = Math.cos(phi);
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(s, s);
    // soft drop shadow once it is out and near the viewer
    const lift = clamp((s - 1) / 0.7);
    if (lift > 0) {
      c.fillStyle = rgba('pencil', 0.07 * lift);
      c.fillRect(x0 + 5, -h + 7, w, h);
      if (cp < 0) c.fillRect(x0 + 5, -h + 7 - h * -cp, w, h * -cp);
    }

    // panel A: the inside
    c.fillStyle = HERO.tint;
    c.fillRect(x0, -h, w, h);
    rules(c, x0, x0 + w, -h, 0, RULE, 0.24);
    if (cp < 0.98) {
      for (const [row, s1] of INSIDE_A) {
        const by = -h + RULE * (row + 1) - 3;
        const ww = hand(c, s1, x0 + 10, by, HAND, row * 7 + 1, 0.82);
        if (s1 === 'maging') {
          // crossed out: second thoughts
          pencil(c, [[x0 + 6, by - 5], [x0 + 12 + ww * 0.5, by - 3], [x0 + 16 + ww, by - 6], [x0 + 20 + ww, by - 4]], rgba('pencil', 0.8), 1.4, 3, 1.5);
          pencil(c, [[x0 + 8, by - 2], [x0 + 18 + ww, by - 7]], rgba('pencil', 0.7), 1.2, 4, 1.2);
        }
        if (s1 === 'pangarap kong') {
          // the one gold mark: a tiny star in the alitaptap's colour
          const sx = x0 + 18 + ww, sy = by - 5;
          const gr = c.createRadialGradient(sx, sy, 0, sx, sy, 14);
          gr.addColorStop(0, rgba('ember', 0.16));
          gr.addColorStop(1, rgba('ember', 0));
          c.fillStyle = gr;
          c.fillRect(sx - 14, sy - 14, 28, 28);
          c.fillStyle = rgba('#D9A932', 0.95);
          c.beginPath();
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 1.8 : 4.6, a = -Math.PI / 2 + (i * Math.PI) / 5;
            c.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
          }
          c.closePath();
          c.fill();
        }
      }
    }
    c.strokeStyle = rgba('pencil', 0.6);
    c.lineWidth = 1 / s;
    c.strokeRect(x0, -h, w, h);

    // panel B about the hinge at y = -h
    c.save();
    c.translate(0, -h);
    if (cp >= 0) {
      // still closing over A: the outside, foreshortened downwards
      if (cp > 0.01) {
        c.scale(1, cp);
        c.fillStyle = HERO.tint;
        c.fillRect(x0, 0, w, h);
        rules(c, x0, x0 + w, 0, h, 14, 0.16);
        c.fillStyle = rgba('pencil', 0.05 + 0.18 * (1 - cp));
        c.fillRect(x0, 0, w, h);
        const cy = h * 0.52;
        c.fillStyle = rgba('pencil', 0.2);
        c.fillRect(x0, cy, w, 0.8 / cp);
        c.strokeStyle = rgba('pencil', 0.6);
        c.lineWidth = 1 / s;
        c.strokeRect(x0, 0, w, h);
        c.setTransform(c.getTransform());
      }
    } else {
      // past vertical: B's inside, foreshortened upwards
      const k = -cp;
      c.scale(1, k);
      c.fillStyle = HERO.tint;
      c.fillRect(x0, -h, w, h);
      rules(c, x0, x0 + w, -h, 0, RULE, 0.24);
      for (const [row, s1] of INSIDE_B) hand(c, s1, x0 + 10, -h + RULE * (row + 1) - 3, row === 1 ? HAND_S : HAND, row * 5 + 40, 0.78);
      c.fillStyle = rgba('pencil', 0.16 * (1 - k));
      c.fillRect(x0, -h, w, h);
      c.strokeStyle = rgba('pencil', 0.6);
      c.lineWidth = 1 / s;
      c.strokeRect(x0, -h, w, h);
    }
    c.restore();
    // the fold line itself, and a shadow B casts on A while it is lifting
    if (cp > 0.01 && cp < 0.99) {
      const ey = -h + h * cp;
      const gr = c.createLinearGradient(0, ey, 0, ey + 16);
      gr.addColorStop(0, rgba('pencil', 0.18 * (1 - cp)));
      gr.addColorStop(1, rgba('pencil', 0));
      c.fillStyle = gr;
      c.fillRect(x0, ey, w, 16);
    }
    c.fillStyle = rgba('pencil', 0.45);
    c.fillRect(x0, -h - 0.5, w, 1);
    c.restore();
  }
}
