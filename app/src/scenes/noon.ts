// TALA · SIMULA NOON — "Sadyang mahiyain lang talaga ako / Ganito na yata ’ko simula noon".
// An album page: old prints drop in on the beat, each a pictogram group scene (class
// photo, birthday, sports day, family). In every one the young self is at the edge;
// on "ako" each is circled in pencil and called out, AKO. A timeline ruler under the
// prints; on "simula noon" a pencil line runs back along it to a tick marked NOON.
// v2: the row fills up to the present — the last print, NGAYON, is the only one where
// the self carries a small gold mark.

import { MARGIN, SCALE } from '../engine/config';
import { layout, mono, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { text, typed } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { rgb, rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, hash, lerp, prog, TAU } from '../engine/util';
import { chestI, firefly, lyricStack, paperBg, pencil, person, type PersonOpts } from './_motifs';

// ---------------------------------------------------------------------------
// the prints: image area IW×IH (local px, y down), border B

const IW = 300, IH = 220, B = 12;
const INK = 'pencil';
const PAPER_HEX = '#EEE9DE', PENCIL_HEX = '#3A3833';

type C2 = CanvasRenderingContext2D;
interface Me {
  x: number;
  /** feet */
  y: number;
  h: number;
  chest?: { x: number; y: number };
  head?: { x: number; y: number };
}

/** sRGB mix of two palette colours as #rrggbb (the Canvas helpers want hex) */
function hexMix(a: string, b: string, k: number) {
  const A = rgb(a), Bc = rgb(b);
  return '#' + A.map((v, i) => Math.round((v + (Bc[i] - v) * k) * 255).toString(16).padStart(2, '0')).join('');
}

/** a figure knocked out of the photo tone so overlaps stay readable */
function fig(c: C2, tone: string, x: number, y: number, h: number, o: PersonOpts = {}) {
  person(c, x, y, h, { ...o, color: tone, alpha: 1, outline: 3.5 });
  return person(c, x, y, h, { alpha: 0.52, ...o, color: INK });
}
const self = (c: C2, tone: string, x: number, y: number, h: number, o: PersonOpts = {}): Me => {
  const p = fig(c, tone, x, y, h, { shrink: 0.4, alpha: 0.6, ...o });
  return { x, y, h: p.h, chest: p.chest, head: p.head };
};

function partyHat(c: C2, hx: number, hy: number, h: number) {
  const r = h * 0.105;
  c.fillStyle = rgba(INK, 0.42);
  c.beginPath();
  c.moveTo(hx - r * 0.75, hy - r * 0.6);
  c.lineTo(hx + r * 0.2, hy - r * 2.6);
  c.lineTo(hx + r * 0.85, hy - r * 0.5);
  c.fill();
}
function mortarboard(c: C2, hx: number, hy: number, h: number) {
  const r = h * 0.105;
  c.fillStyle = rgba(INK, 0.6);
  c.beginPath();
  c.moveTo(hx - r * 1.5, hy - r * 0.9);
  c.lineTo(hx, hy - r * 1.45);
  c.lineTo(hx + r * 1.5, hy - r * 0.9);
  c.lineTo(hx, hy - r * 0.4);
  c.fill();
  c.strokeStyle = rgba(INK, 0.5);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(hx + r * 0.2, hy - r * 1.0);
  c.lineTo(hx + r * 1.3, hy - r * 0.3);
  c.stroke();
}
function rectLine(c: C2, x: number, y: number, w: number, h: number, a: number) {
  c.strokeStyle = rgba(INK, a);
  c.lineWidth = 1.2;
  c.strokeRect(x, y, w, h);
}

interface Photo {
  year: number;
  label: string;
  draw: (c: C2, tone: string) => Me;
}

const PHOTOS: Photo[] = [
  {
    year: 2008, label: 'KINDER',
    draw: (c, tn) => {
      c.fillStyle = rgba(INK, 0.1);
      c.fillRect(52, 22, 196, 64);
      rectLine(c, 52, 22, 196, 64, 0.22);
      c.fillStyle = rgba(INK, 0.2);
      c.fillRect(40, 156, 230, 2);
      fig(c, tn, 34, 222, 136, { alpha: 0.46 });
      [96, 132, 168, 204, 240].forEach((x, i) => fig(c, tn, x, 156, 70, { nod: (hash(i, 3) - 0.5) * 3 }));
      [80, 116, 152, 188, 224].forEach((x, i) => fig(c, tn, x, 222, 66, { nod: (hash(i, 5) - 0.5) * 3 }));
      return self(c, tn, 280, 222, 62);
    },
  },
  {
    year: 2010, label: 'KAARAWAN',
    draw: (c, tn) => {
      // bunting
      c.fillStyle = rgba(INK, 0.24);
      for (let x = 70; x < 300; x += 26) {
        const y = 22 + Math.sin(((x - 70) / 230) * Math.PI) * 14;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 18, y + 1);
        c.lineTo(x + 9, y + 16);
        c.fill();
      }
      [98, 134, 196, 232].forEach((x, i) => {
        const p = fig(c, tn, x, 198, 86, { nod: (hash(i, 8) - 0.5) * 5 });
        partyHat(c, p.head.x, p.head.y, 86);
      });
      // table + cake (no flame: the only light in this album comes later)
      c.fillStyle = rgba(INK, 0.5);
      c.fillRect(74, 152, 184, 5);
      c.fillRect(84, 157, 3, 60);
      c.fillRect(246, 157, 3, 60);
      c.fillStyle = rgba(INK, 0.36);
      c.fillRect(140, 126, 52, 26);
      c.fillStyle = rgba(INK, 0.55);
      for (const x of [151, 166, 181]) c.fillRect(x, 113, 2, 13);
      return self(c, tn, 24, 222, 76);
    },
  },
  {
    year: 2012, label: 'ARAW NG PALARO',
    draw: (c, tn) => {
      c.fillStyle = rgba(INK, 0.22);
      c.fillRect(0, 176, IW, 1.5);
      c.fillRect(0, 208, IW, 1.5);
      c.fillStyle = rgba(INK, 0.4);
      c.fillRect(284, 120, 2, 100);
      [140, 192, 240].forEach((x, i) => {
        fig(c, tn, x, 200 - i * 3, 82, { lean: 0.26, alpha: 0.5 });
        c.fillStyle = rgba(INK, 0.22);
        for (let j = 0; j < 3; j++) c.fillRect(x - 46 - j * 5, 150 + j * 12 - i * 3, 18, 1.2);
      });
      // bench, and the self sitting on it
      c.fillStyle = rgba(INK, 0.45);
      c.fillRect(4, 160, 60, 4);
      c.fillRect(10, 164, 3, 30);
      c.fillRect(56, 164, 3, 30);
      return seated(c, tn, 34, 160, 72);
    },
  },
  {
    year: 2014, label: 'PAMILYA',
    draw: (c, tn) => {
      rectLine(c, 118, 26, 70, 52, 0.2);
      c.fillStyle = rgba(INK, 0.16);
      c.fillRect(0, 196, IW, 1.5);
      fig(c, tn, 146, 222, 138, { alpha: 0.5 });
      fig(c, tn, 190, 222, 128, { alpha: 0.5 });
      fig(c, tn, 112, 222, 90);
      fig(c, tn, 224, 222, 84);
      // the self, half out of frame
      return self(c, tn, 290, 222, 100, { shrink: 0.3 });
    },
  },
  {
    year: 2017, label: 'LAKBAY-ARAL',
    draw: (c, tn) => {
      c.fillStyle = rgba(INK, 0.12);
      c.beginPath();
      c.roundRect(14, 64, 214, 104, 12);
      c.fill();
      c.strokeStyle = rgba(INK, 0.36);
      c.lineWidth = 1.4;
      c.stroke();
      c.fillStyle = rgba(INK, 0.22);
      for (let i = 0; i < 5; i++) c.fillRect(28 + i * 38, 78, 28, 26);
      c.fillStyle = rgba(INK, 0.5);
      for (const x of [58, 186]) {
        c.beginPath();
        c.arc(x, 168, 13, 0, TAU);
        c.fill();
      }
      [56, 92, 128, 164, 200].forEach((x, i) => fig(c, tn, x, 222, 82, { nod: (hash(i, 17) - 0.5) * 4 }));
      return self(c, tn, 272, 222, 84, { shrink: 0.35 });
    },
  },
  {
    year: 2019, label: 'PAGTATAPOS',
    draw: (c, tn) => {
      c.fillStyle = rgba(INK, 0.1);
      c.fillRect(54, 18, 210, 26);
      c.fillStyle = rgba(INK, 0.28);
      c.fillRect(92, 30, 136, 2);
      [104, 144, 184, 224, 264].forEach((x, i) => {
        const p = fig(c, tn, x, 222, 110, { nod: (hash(i, 23) - 0.5) * 4 });
        mortarboard(c, p.head.x, p.head.y, 110);
      });
      const me = self(c, tn, 30, 222, 106, { shrink: 0.3 });
      mortarboard(c, me.head!.x, me.head!.y, 106);
      return me;
    },
  },
  {
    year: 2022, label: 'BARKADA',
    draw: (c, tn) => {
      c.fillStyle = rgba(INK, 0.16);
      c.fillRect(0, 150, IW, 1.5);
      c.fillStyle = rgba(INK, 0.4);
      c.fillRect(270, 96, 4, 124);
      c.strokeStyle = rgba(INK, 0.3);
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(272, 78, 34, 0, TAU);
      c.stroke();
      [104, 140, 176, 212].forEach((x, i) => fig(c, tn, x, 222, 112, { lean: [0.07, 0.03, -0.03, -0.07][i], alpha: 0.5 }));
      return self(c, tn, 30, 222, 108, { shrink: 0.3 });
    },
  },
  {
    year: 2026, label: 'NGAYON',
    draw: (c, tn) => {
      [172, 214, 256].forEach((x, i) => fig(c, tn, x, 222, [110, 104, 112][i], { nod: (hash(i, 31) - 0.5) * 5, alpha: 0.48 }));
      c.fillStyle = rgba(INK, 0.5);
      c.fillRect(140, 168, 160, 5);
      c.fillStyle = rgba(INK, 0.4);
      for (const x of [180, 232, 262]) c.fillRect(x, 158, 9, 10);
      // the self stands a little taller now
      return self(c, tn, 50, 222, 112, { shrink: 0.12, alpha: 0.66 });
    },
  },
];

/** the self sitting on a bench, facing right: seat at (x, y) */
function seated(c: C2, tone: string, x: number, y: number, h: number): Me {
  const draw = (col: string, a: number, grow: number) => {
    const r = h * 0.12, bw = h * 0.3;
    c.fillStyle = rgba(col, a);
    c.strokeStyle = rgba(col, a);
    c.beginPath();
    const top = y - h * 0.5;
    c.moveTo(x - bw * 0.46 - grow, y);
    c.lineTo(x - bw * 0.5 - grow, top + bw * 0.5);
    c.arc(x, top + bw * 0.5, bw * 0.5 + grow, Math.PI, 0);
    c.lineTo(x + bw * 0.46 + grow, y);
    c.closePath();
    c.fill();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = bw * 0.5 + grow * 2;
    c.beginPath();
    c.moveTo(x + bw * 0.1, y - bw * 0.2);
    c.lineTo(x + h * 0.3, y - bw * 0.2);
    c.lineTo(x + h * 0.32, y + h * 0.4);
    c.stroke();
    c.beginPath();
    c.arc(x + h * 0.02, top - r - h * 0.03, r + grow, 0, TAU);
    c.fill();
  };
  draw(tone, 1, 1.8);
  draw(INK, 0.6, 0);
  return { x: x + h * 0.08, y: y + h * 0.4, h: h * 0.95 };
}

// ---------------------------------------------------------------------------
// layout

interface Slot {
  x: number;
  y: number;
  s: number;
  rot: number;
}
const L1: Slot[] = [
  { x: 430, y: 352, s: 1, rot: -0.036 },
  { x: 800, y: 364, s: 1, rot: 0.026 },
  { x: 1170, y: 348, s: 1, rot: -0.018 },
  { x: 1540, y: 360, s: 1, rot: 0.04 },
];
const L2: Slot[] = Array.from({ length: 8 }, (_, i) => ({
  x: 250 + i * 205,
  y: 356 + (i % 2 ? 8 : -6),
  s: 0.55,
  rot: [-0.04, 0.03, -0.022, 0.036, -0.03, 0.02, -0.034, 0.028][i],
}));
const lerpSlot = (a: Slot, b: Slot, k: number): Slot => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k), rot: lerp(a.rot, b.rot, k) });

// timeline: x = X0 + (year − 2007) · k
const TL1 = { x0: 245, k: 185, span: 8 };
const TL2 = { x0: 200, k: 77, span: 20 };
const RULER_Y = 604;

const FONT = serif(56, 340);
const LX = MARGIN + 60;

export default class Noon extends Scene {
  private v = (this.params.v as number) ?? 1;
  private cut = this.params.cut as number;
  private next = this.params.next as number;
  private lineA = this.lyrics.find('Sadyang mahiyain', this.cut - 1);
  private lineB = this.lyrics.find('Ganito na yata', this.cut);
  private lines = [this.lineA, this.lineB];
  private tones = PHOTOS.map((p) => hexMix(hexMix(PAPER_HEX, PENCIL_HEX, 0.13), '#CDBB93', clamp((2026 - p.year) / 18) * 0.55));

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio, v = this.v;
    const n = v === 1 ? 4 : 8;
    const ako = Lyrics.word(this.lineA, 'ako');
    const gan = this.lineB.words[0];
    const sim = Lyrics.word(this.lineB, 'simula');
    const noon = Lyrics.word(this.lineB, 'noon');
    const b0 = Math.round(A.beatAt(this.cut));
    const half = A.period(ako.start) * 0.5;

    // v2: the first four slide from the old layout into the long row over the first bar
    const m = v === 1 ? 0 : prog(t, this.cut, A.timeOfBeat(b0 + 4), ease.inOutCubic);
    const TL = { x0: lerp(TL1.x0, TL2.x0, m), k: lerp(TL1.k, TL2.k, m), span: lerp(TL1.span, TL2.span, m) };
    const yearX = (y: number) => TL.x0 + (y - 2007) * TL.k;

    // lift the page a touch on the way out
    const lift = prog(t, this.next - 1.0, this.next + 0.4, ease.inOutSine);
    paperBg(out, { grid: 1, age: 0.6, off: [0, lift * 14] });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();
    c.translate(0, -lift * 14);
    g.translate(0, -lift * 14);

    // ---- header, top right ----------------------------------------------------
    const hp = v === 1 ? prog(t, this.ctx.start, this.cut + 0.6) : 1;
    const head = v === 1 ? 'ALBUM  ·  2008 — 2014' : 'ALBUM  ·  2008 — 2026';
    const hf = mono(12, 500, false, 3);
    const hw = layout(head, hf).w;
    typed(c, head, hp * head.length, 1824 - hw, 150, hf, rgba(INK, 0.75));
    c.fillStyle = rgba(INK, 0.4);
    c.fillRect(1824 - hw * hp, 164, hw * hp, 1);
    text(c, 'mga litrato, mula noon', 1824, 188, mono(12, 300, true, 0.4), rgba(INK, 0.5 * hp), 'right');

    // ---- the ruler ------------------------------------------------------------
    const rp = v === 1 ? prog(t, this.cut, A.timeOfBeat(b0 + 2), ease.inOutCubic) : 1;
    const x1 = lerp(TL1.x0 + TL1.span * TL1.k, TL2.x0 + TL2.span * TL2.k, m);
    c.lineWidth = 1;
    rulerLine(c, TL.x0, x1, RULER_Y, TL.k / 4, rgba(INK, 0.5), rp);

    // ---- prints ---------------------------------------------------------------
    const drops = PHOTOS.slice(0, n).map((_, i) => {
      if (v === 2 && i < 4) return 1;
      const tb = A.timeOfBeat(b0 + (v === 1 ? i : 4 + (i - 4)));
      return prog(t, tb - 0.04, tb + 0.42);
    });
    const circ = PHOTOS.slice(0, n).map((_, i) => (v === 2 && i < 4 ? -99 : ako.start + (v === 1 ? i : i - 4) * half));
    const notes: (() => void)[] = [];
    for (let i = 0; i < n; i++) {
      const k = drops[i];
      if (k <= 0) continue;
      const sl = v === 1 ? L1[i] : i < 4 ? lerpSlot(L1[i], L2[i], m) : L2[i];
      notes.push(this.print(c, g, i, sl, k, t, circ[i], yearX(PHOTOS[i].year)));
    }
    notes.forEach((d) => d());

    // ---- "ganito" : the tally --------------------------------------------------
    const tally = `NASA GILID  ·  ${n} SA ${n} LITRATO`;
    const tf = mono(12, 500, false, 2.6);
    const tw = layout(tally, tf).w;
    typed(c, tally, (t - gan.start) * 26, 1824 - tw, 700, tf, rgba(INK, 0.8));
    const ul = prog(t, gan.start + 0.9, gan.start + 1.5, ease.inOutCubic);
    if (ul > 0) pencil(c, [[1824 - tw - 4, 712], [lerp(1824 - tw - 4, 1826, ul), 713.5]], rgba(INK, 0.55), 1.3, 7, 0.8);

    // ---- "simula noon": back along the ruler to NOON ----------------------------
    const last = PHOTOS[n - 1].year;
    const xa = yearX(last), xb = TL.x0;
    const ap = prog(t, sim.start, noon.start + 0.05, ease.inOutCubic);
    const ay = RULER_Y - 20;
    if (ap > 0) {
      const xe = lerp(xa, xb, ap);
      c.fillStyle = rgba(INK, 0.8);
      c.beginPath();
      c.arc(xa, ay, 3, 0, TAU);
      c.fill();
      pencil(c, [[xa, ay], [lerp(xa, xe, 0.33), ay + 0.8], [lerp(xa, xe, 0.66), ay - 0.6], [xe, ay]], rgba(INK, 0.8), 1.8, 13, 1.2);
      const hk = prog(ap, 0.85, 1);
      if (hk > 0) pencil(c, [[xe + 12 * hk, ay - 6 * hk], [xe, ay], [xe + 12 * hk, ay + 6 * hk]], rgba(INK, 0.8), 1.8, 14, 0.6);
      if (v === 2) typed(c, 'NGAYON', (t - sim.start) * 16, xa - 22, ay - 12, mono(11, 500, false, 1.6), rgba(INK, 0.7));
    }
    // the NOON tick
    const np = prog(t, noon.start - 0.1, noon.start + 0.3, ease.outCubic);
    if (np > 0) {
      c.fillStyle = rgba(INK, 0.85);
      c.fillRect(xb - 1, RULER_Y - 16 * np, 2, 16 * np);
      const nf = mono(14, 600, false, 3);
      const nw = typed(c, 'NOON', (t - noon.start) * 14, xb - 20, RULER_Y + 34, nf, rgba(INK, 0.9));
      const cp = prog(t, noon.start + 0.25, noon.start + 0.85, ease.inOutSine);
      if (cp > 0) ring(c, xb - 20 + nw / 2, RULER_Y + 29, nw / 2 + 16, 17, cp, 29);
    }

    // ---- lyrics, bottom-left margin ---------------------------------------------
    lyricStack(c, this.lines, t, {
      x: LX, y: 880, font: FONT, lh: 72, keep: 1, maxW: 1100, olderDim: 0.42,
      style: { color: INK, dim: 0.22, hot: 'ember', hotAmt: 0.4 },
    });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });
    return { hudInk: true, vignette: 0.3, zoom: 1 + 0.006 * Math.sin((t - this.cut) * TAU * 0.03) };
  }

  /** draw print i; returns a closure that draws its page notes (caption, leader, AKO) on top */
  private print(c: C2, g: C2, i: number, sl: Slot, k: number, t: number, tc: number, yx: number): () => void {
    const ph = PHOTOS[i];
    const e = ease.outCubic(k);
    const y = sl.y - (1 - e) * 46;
    const rot = sl.rot + (1 - e) * (i % 2 ? -0.08 : 0.08);
    const s = sl.s;
    const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    const toPage = (lx: number, ly: number) => ({ x: sl.x + cs * (lx - IW / 2) - sn * (ly - IH / 2), y: y + sn * (lx - IW / 2) + cs * (ly - IH / 2) });
    const alpha = clamp(k * 2.6);
    const tone = this.tones[i];

    c.save();
    c.globalAlpha = alpha;
    c.translate(sl.x, y);
    c.rotate(rot);
    c.scale(s, s);
    c.shadowColor = 'rgba(58,56,51,0.2)';
    c.shadowBlur = (6 + 10 * e) * s * SCALE;
    c.shadowOffsetY = (2 + 3 * e) * s * SCALE;
    c.fillStyle = '#F5F1E8';
    c.fillRect(-IW / 2 - B, -IH / 2 - B, IW + 2 * B, IH + 2 * B);
    c.shadowColor = 'transparent';
    c.fillStyle = tone;
    c.fillRect(-IW / 2, -IH / 2, IW, IH);
    const gr = c.createLinearGradient(0, -IH / 2, 0, IH / 2);
    gr.addColorStop(0, 'rgba(255,250,238,0.18)');
    gr.addColorStop(1, 'rgba(58,56,51,0.06)');
    c.fillStyle = gr;
    c.fillRect(-IW / 2, -IH / 2, IW, IH);
    c.save();
    c.beginPath();
    c.rect(-IW / 2, -IH / 2, IW, IH);
    c.clip();
    c.translate(-IW / 2, -IH / 2);
    const me = ph.draw(c, tone);
    c.restore();
    // album photo-corners
    c.fillStyle = 'rgba(46,44,40,0.78)';
    const L = 26, ox = IW / 2 + B + 3, oy = IH / 2 + B + 3;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      c.beginPath();
      c.moveTo(sx * ox, sy * oy);
      c.lineTo(sx * (ox - L), sy * oy);
      c.lineTo(sx * ox, sy * (oy - L));
      c.fill();
    }
    // the pencil circle around the self (drawn on the print, over the edge if need be)
    const cp = prog(t, tc, tc + 0.34, ease.inOutSine);
    const mx = me.x - IW / 2, my = me.y - me.h * 0.5 - IH / 2;
    const rx = me.h * 0.3 + 12, ry = me.h * 0.58 + 10;
    if (cp > 0) ring(c, mx, my, rx, ry, cp, 50 + i * 3, 1.6 / s);
    c.restore();

    // gold mark: the firefly, only in the present
    if (ph.year === 2026 && me.chest) {
      const p = toPage(me.chest.x, me.chest.y);
      const liw = this.liwanag(t);
      const on = prog(t, tc + 0.4, tc + 1.2, ease.outCubic) * alpha;
      c.fillStyle = rgba('ember', 0.9 * on);
      c.beginPath();
      c.arc(p.x, p.y, 3.2, 0, TAU);
      c.fill();
      firefly(g, p.x, p.y, { I: chestI(liw) * 1.3 * on, r: 0.42, t, seed: 3, flicker: 0.25 });
    }

    return () => {
      const capY = sl.y + (IH / 2 + B) * s + 26 * lerp(0.75, 1, s);
      const f = mono(s < 0.8 ? 10 : 12, 500, false, s < 0.8 ? 1.6 : 2.4);
      const cap = `${ph.year}  ·  ${ph.label}`;
      const capA = prog(k, 0.5, 1);
      text(c, cap, sl.x, capY, f, rgba(INK, 0.72 * capA), 'center');
      // leader: caption → its year on the ruler
      const la = 0.28 * capA;
      if (la > 0.01) {
        c.strokeStyle = rgba(INK, la);
        c.setLineDash([3, 4]);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(sl.x, capY + 10);
        c.lineTo(yx, RULER_Y - 12);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = rgba(INK, 0.6 * capA);
        c.fillRect(yx - 0.75, RULER_Y - 12, 1.5, 12);
        text(c, String(ph.year), yx, RULER_Y + 20, mono(10, 400, false, 1.2), rgba(INK, 0.6 * capA), 'center');
      }
      // AKO: straight up from the ring, out past the print's top edge
      const ap = prog(t, tc + 0.12, tc + 0.8);
      if (ap > 0) {
        const a = toPage(me.x, me.y - me.h * 0.5 - ry * 1.04);
        const top = toPage(me.x, -B).y - 14 * lerp(0.7, 1, s);
        tag(c, a.x, a.y, Math.min(top, a.y - 16), 'AKO', ap, mono(s < 0.8 ? 11 : 12, 600, false, 2));
      }
    };
  }
}

/** a vertical callout: dot on the ring, a lead straight up, the label centred above it */
function tag(c: C2, ax: number, ay: number, by: number, label: string, p: number, f: ReturnType<typeof mono>) {
  const col = rgba(INK, 0.85);
  c.fillStyle = col;
  c.beginPath();
  c.arc(ax, ay, 2.2, 0, TAU);
  c.fill();
  const k = clamp(p * 1.6);
  c.strokeStyle = rgba(INK, 0.6);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(ax, lerp(ay, by, k));
  c.stroke();
  const tp = clamp((p - 0.45) / 0.55);
  if (tp > 0) typed(c, label, tp * label.length, ax - layout(label, f).w / 2, by - 7, f, rgba(INK), 0.85);
}

/** a wobbly, slightly overshooting pencil ellipse drawn on to fraction p */
function ring(c: C2, x: number, y: number, rx: number, ry: number, p: number, seed: number, w = 1.5) {
  const N = 44, turns = 1.12, a0 = -2.2 + hash(seed) * 0.6;
  const pts: [number, number][] = [];
  const m = Math.max(2, Math.ceil(N * p));
  for (let j = 0; j <= m; j++) {
    const u = (j / N) * turns;
    const a = a0 + u * TAU;
    const wob = 1 + 0.05 * Math.sin(u * 7 + seed) + 0.04 * u;
    pts.push([x + Math.cos(a) * rx * wob, y + Math.sin(a) * ry * wob]);
  }
  pencil(c, pts, rgba(INK, 0.78), w, seed, 0.9);
}

/** the album ruler: base line, ticks every `step`, a longer one each year (every 4) */
function rulerLine(c: C2, x0: number, x1: number, y: number, step: number, color: string, p: number) {
  const xe = lerp(x0, x1, clamp(p));
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(xe, y);
  for (let x = x0, i = 0; x <= xe + 0.01; x += step, i++) {
    const h = i % 4 === 0 ? 8 : 3.5;
    c.moveTo(x, y);
    c.lineTo(x, y - h);
  }
  c.stroke();
}
