// TALA 03 · LALAMUNAN — "May sagot na sa isipan / Pero ’di makalusot sa lalamunan /
// Nagpapaliban na naman / Baka pagtawanan lang".
// A pencil cross-section of the quiet one's head. The answer writes itself in the mind;
// on "makalusot" its letters drop into the throat and jam at a closing knot; on
// "Nagpapaliban" they climb back and get boxed away for later (again); on "pagtawanan"
// imagined laughter pencils itself in at the edge of the page.

import { MARGIN, W } from '../engine/config';
import { applyFont, layout, mono, sans, serif, type Stretch } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { typed } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { mix, rgba, type PalName } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, hash, lerp, pointAt, polyLengths, prog, smoothstep, TAU, type Pt } from '../engine/util';
import { callout, chestI, firefly, GROUND, lyricStack, paperBg, pencil, SELF } from './_motifs';

// the figure is drawn in its own units, placed at (OX, OY) and scaled by S
const OX = 190, OY = 118, S = 1.1;
const sp = (x: number, y: number) => ({ x: OX + x * S, y: OY + y * S });

/** Catmull-Rom through the control points */
function spline(pts: Pt[], n = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// profile facing right: crown → brow → nose → lips → chin → throat
const FRONT = spline([
  [160, 0], [240, 12], [306, 50], [338, 110], [346, 160], [340, 188], [362, 228], [378, 270], [356, 290], [344, 298],
  [350, 318], [340, 334], [347, 348], [338, 366], [346, 392], [334, 418], [300, 432], [262, 452], [244, 500], [238, 600], [240, 700],
]);
const BACK = spline([[160, 0], [80, 20], [28, 80], [4, 170], [16, 270], [52, 350], [78, 405], [90, 470], [90, 580], [88, 700]]);
const EAR = spline([[198, 222], [178, 216], [164, 234], [165, 262], [176, 284], [194, 292]], 6);
const PALATE = spline([[338, 312], [290, 300], [230, 296], [190, 302], [170, 324]], 6);
const TONGUE = spline([[332, 338], [290, 332], [240, 322], [206, 334], [194, 372], [198, 424]], 6);

const ANSWER = 'sa tingin ko…';
const AF = serif(30, 380, true);
const AX = 70, AY = 140;
const HAHA = ['haha', 'hahaha', 'HAHA', 'ha ha ha', 'HA', 'hahah', 'ha', 'HAHAHA', 'haha'];
const STRETCH: Stretch[] = ['condensed', 'normal', 'expanded', 'semi-condensed', 'semi-expanded'];

/** pencil stroke whose alpha can vary along y (for lines that fade out) */
function stroke(c: CanvasRenderingContext2D, pts: Pt[], col: PalName, w: number, a: (y: number) => number, seed: number, wob = 0.8, upto = 1) {
  const n = Math.floor((pts.length - 1) * clamp(upto));
  for (let i = 0; i < n; i += 4) {
    const seg = pts.slice(i, Math.min(n, i + 4) + 1);
    const al = a(seg[0][1]);
    if (al > 0.01 && seg.length > 1) pencil(c, seg, rgba(col, al), w, seed + i, wob);
  }
}

export default class Lalamunan extends Scene {
  lines = this.lyrics.between(this.ctx.start, this.ctx.end - 0.5).filter((l) => l.start > this.ctx.start - 1);
  l4 = this.lyrics.find('May sagot');
  sagot = Lyrics.word(this.l4, 'sagot');
  isipan = Lyrics.word(this.l4, 'isipan');
  l5 = this.lyrics.find('makalusot');
  lusot = Lyrics.word(this.l5, 'makalusot');
  lalamunan = Lyrics.word(this.l5, 'lalamunan');
  l6 = this.lyrics.find('Nagpapaliban');
  paliban = Lyrics.word(this.l6, 'Nagpapaliban');
  naman = Lyrics.word(this.l6, 'naman');
  tawanan = Lyrics.word(this.lyrics.find('pagtawanan'), 'pagtawanan');
  aL = layout(ANSWER, AF);
  /** letters of the answer that travel (not spaces, not the ellipsis) */
  moving = [...ANSWER].map((ch, i) => ({ ch, i })).filter((o) => o.ch !== ' ' && o.ch !== '…');

  /** how shut the throat is, 0..1 */
  private closed(t: number) {
    const shut = prog(t, this.lusot.start + 0.5, this.lalamunan.start + 0.4, ease.inOutCubic);
    const ease1 = 0.35 * prog(t, this.paliban.start, this.naman.end, ease.inOutSine);
    const fear = 0.35 * prog(t, this.tawanan.start, this.tawanan.end, ease.inOutCubic);
    return clamp(shut - ease1 + fear);
  }

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const cut = this.params.cut as number, next = this.params.next as number;
    const liw = this.liwanag(t);

    paperBg(out, { grid: 1, age: 0.6 });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    const closed = this.closed(t);
    const pulse = A.beatPulse(t, 0.1);
    const hwMin = 15 - 11 * closed - 2 * pulse * closed;
    const cx = (y: number) => 178 + 4 * Math.sin((y - 330) / 120);
    const hw = (y: number) => 21 - (21 - hwMin) * Math.exp(-(((y - 520) / 26) ** 2));

    // ---- the figure (local units) -------------------------------------------------------
    c.save();
    c.translate(OX, OY);
    c.scale(S, S);
    const neck = (y: number) => 1 - smoothstep(560, 700, y);
    const second = prog(t, this.ctx.start, cut + 2, ease.inOutSine);
    stroke(c, FRONT, 'pencil', 1.5, (y) => 0.8 * neck(y), 3);
    stroke(c, BACK, 'pencil', 1.5, (y) => 0.8 * neck(y), 5);
    stroke(c, FRONT, 'pencil', 0.7, (y) => 0.35 * neck(y), 13, 2.2, second);
    stroke(c, BACK, 'pencil', 0.7, (y) => 0.35 * neck(y), 17, 2.2, second);
    stroke(c, EAR, 'pencil', 1, () => 0.4, 7);
    stroke(c, PALATE, 'pencil', 1, () => 0.5, 9);
    stroke(c, TONGUE, 'pencil', 1, () => 0.5, 11);

    // brain: dashed region, the mind
    c.strokeStyle = rgba('graphite', 0.5);
    c.lineWidth = 1;
    c.setLineDash([5, 6]);
    c.beginPath();
    c.ellipse(160, 118, 120, 84, -0.08, 0, TAU);
    c.stroke();
    c.setLineDash([]);

    // spine, behind the throat
    c.strokeStyle = rgba('pencil', 0.22);
    for (let y = 384; y < 680; y += 40) {
      c.beginPath();
      c.roundRect(110, y, 30, 30, 5);
      c.stroke();
    }

    // pharynx: two walls with a knot at y = 520
    const wall = (side: 1 | -1): Pt[] => {
      const pts: Pt[] = [];
      for (let y = 322; y <= 700; y += 6) pts.push([cx(y) + side * hw(y), y]);
      return pts;
    };
    stroke(c, wall(-1), 'pencil', 1.1, (y) => 0.6 * neck(y), 21, 0.5);
    stroke(c, wall(1), 'pencil', 1.1, (y) => 0.6 * neck(y), 23, 0.5);
    // trachea rings
    c.strokeStyle = rgba('pencil', 0.28);
    for (let y = 572; y < 690; y += 22) {
      c.beginPath();
      c.ellipse(cx(y), y, hw(y) - 2, 3, 0, 0, Math.PI);
      c.stroke();
    }
    // the knot: hatching squeezes in from both walls as it shuts
    if (closed > 0.02) {
      c.strokeStyle = rgba('pencil', 0.55 * closed);
      c.beginPath();
      for (let k = -3; k <= 3; k++) {
        const y = 520 + k * 7;
        const w = hw(y);
        c.moveTo(cx(y) - 21 - 4, y + 3);
        c.lineTo(cx(y) - w, y - 3);
        c.moveTo(cx(y) + 21 + 4, y + 3);
        c.lineTo(cx(y) + w, y - 3);
      }
      c.stroke();
    }

    // ---- the answer ---------------------------------------------------------------------
    const nType = prog(t, this.sagot.start, this.isipan.end, ease.linear) * ANSWER.length * 1.02;
    const tBox = this.naman.start - 0.35;
    const boxed = prog(t, tBox, tBox + 0.5, ease.inOutCubic);
    const inkA = 0.9 - 0.4 * boxed;
    // the ellipsis never leaves: it's what remains in the mind
    applyFont(c, AF);
    c.textAlign = 'left';
    const homeOf = (i: number): Pt => [AX + this.aL.xs[i], AY];
    const dots = ANSWER.length - 1;
    c.fillStyle = rgba('pencil');
    c.globalAlpha = inkA * clamp(nType - dots);
    c.fillText('…', homeOf(dots)[0], AY);
    c.globalAlpha = 1;
    const nM = this.moving.length;
    for (let o = 0; o < nM; o++) {
      const { ch, i } = this.moving[o];
      const vis = clamp(nType - i);
      if (vis <= 0) continue;
      const d0 = this.lusot.start - 0.05 + o * 0.075;
      const r0 = this.paliban.start + (nM - 1 - o) * 0.04;
      const go = prog(t, d0, d0 + 1.1, ease.inOutCubic);
      const back = prog(t, r0, r0 + 0.7, ease.inOutCubic);
      const jamY = 506 - o * 11;
      const home = homeOf(i);
      const path: Pt[] = [home, [168 + o * 2, 240], [176, 338], [cx(jamY) + (o % 2 ? 3 : -3), jamY]];
      const L = polyLengths(path);
      const s = go * (1 - back);
      const P = pointAt(path, L, s * L[L.length - 1]);
      const jam = smoothstep(0.85, 1, go) * (1 - back);
      const shake = (hash(o, Math.floor(t * 10)) - 0.5) * 1.6 * jam * closed;
      c.save();
      c.translate(P.x + shake, P.y + pulse * 3 * jam * closed);
      c.rotate((hash(o, 11) - 0.5) * 0.9 * jam + (1 - jam) * Math.sin(s * Math.PI) * 0.4);
      c.scale(1, 1 - 0.36 * jam * closed);
      c.globalAlpha = vis * (jam > 0 || s > 0 ? 0.9 : inkA);
      c.fillStyle = rgba('pencil');
      c.fillText(ch, 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;

    // boxed for later (dashed box drawn around the answer)
    if (boxed > 0) {
      const x0 = AX - 12, y0 = AY - 30, x1 = AX + this.aL.w + 12, y1 = AY + 12;
      const per = 2 * (x1 - x0 + y1 - y0);
      c.strokeStyle = rgba('pencil', 0.7);
      c.lineWidth = 1.1;
      c.setLineDash([6, 4]);
      c.lineDashOffset = 0;
      c.beginPath();
      c.moveTo(x0, y0);
      const legs: Pt[] = [[x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      let left = per * boxed, px = x0, py = y0;
      for (const [qx, qy] of legs) {
        const d = Math.hypot(qx - px, qy - py);
        const k = clamp(left / d);
        c.lineTo(lerp(px, qx, k), lerp(py, qy, k));
        left -= d;
        if (left <= 0) break;
        px = qx;
        py = qy;
      }
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();

    // ---- field notes (screen units) ------------------------------------------------------
    const k = (a: number, d = 1.1) => prog(t, a, a + d, ease.outCubic);
    const brain = sp(262, 64), ans = sp(AX + this.aL.w + 14, AY - 10);
    callout(c, brain.x, brain.y, 690, 170, 'ISIPAN', { color: 'pencil', alpha: 0.7, p: 1 });
    callout(c, ans.x, ans.y, 690, 250, 'SAGOT', { color: 'pencil', alpha: 0.7, p: k(this.isipan.start) * (1 - prog(t, this.paliban.start - 0.1, this.paliban.start + 0.3)) });
    callout(c, ans.x, ans.y + 14, 690, 330, 'MAMAYA NA', { color: 'pencil', alpha: 0.75, p: k(this.paliban.start + 0.2) });
    // tally: again, and again ("na naman")
    const tally = [prog(t, this.paliban.start + 0.9, this.paliban.start + 1.1), prog(t, this.paliban.start + 1.0, this.paliban.start + 1.2),
      prog(t, this.paliban.start + 1.1, this.paliban.start + 1.3), prog(t, this.naman.start, this.naman.start + 0.25, ease.outCubic)];
    tally.forEach((p, j) => {
      if (p <= 0) return;
      const x = 842 + j * 9, y0 = 320, y1 = 342;
      pencil(c, [[x, y0], [x + 1, lerp(y0, y1, p)]], rgba('pencil', j === 3 ? 0.85 : 0.5), 1.3, 40 + j, 0.6);
    });
    if (tally[3] > 0) {
      const F = mono(11, 400, false, 1.6);
      typed(c, 'NA NAMAN', (t - this.naman.start - 0.2) * 20, 884, 336, F, rgba('pencil'), 0.6);
    }

    // the knot, measured
    const knot = sp(cx(520) + hwMin + 2, 520);
    if (t > this.lusot.start + 0.4) {
      const d = Math.round(hwMin * 2);
      callout(c, knot.x, knot.y, 690, 640, `LALAMUNAN  ·  Ø ${String(d).padStart(2, '0')}`, { color: 'pencil', alpha: 0.75, p: k(this.lusot.start + 0.4, 1.4) });
      const shutA = smoothstep(0.86, 0.96, closed);
      if (shutA > 0) typed(c, 'SARADO', (t - this.lalamunan.start) * 14, 698, 664, mono(11, 500, false, 2), mix('pencil', 'ember', 0.6), 0.85 * shutA);
      // dimension ticks across the knot
      const a = sp(cx(520) - hwMin, 520), b = sp(cx(520) + hwMin, 520);
      c.strokeStyle = rgba('pencil', 0.7);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(a.x, a.y - 6);
      c.lineTo(a.x, a.y + 6);
      c.moveTo(b.x, b.y - 6);
      c.lineTo(b.x, b.y + 6);
      c.stroke();
    }

    // imagined laughter pencils itself in at the page edge
    for (let j = 0; j < HAHA.length; j++) {
      const t0 = this.tawanan.start - 0.1 + j * 0.13;
      const a = prog(t, t0, t0 + 0.3) * (1 - prog(t, next - 0.3, next + 0.3));
      if (a <= 0) continue;
      // a loose 3 × 3 grid so no two collide
      const x = 1010 + (j % 3) * 250 + hash(j, 1) * 110, y = 700 + Math.floor(j / 3) * 70 + hash(j, 2) * 26 - 18 * prog(t, t0, t0 + 1.6, ease.outCubic);
      const F = sans(Math.round(16 + hash(j, 3) * 16), 500 + Math.round(hash(j, 4) * 2) * 100, STRETCH[j % STRETCH.length], 0.5);
      c.save();
      c.translate(x, y);
      c.rotate((hash(j, 5) - 0.5) * 0.14);
      typed(c, HAHA[j], 99, 0, 0, F, mix('ash', 'graphite', 0.45), a * (0.32 + 0.16 * hash(j, 6)));
      c.restore();
    }

    // caption
    typed(c, 'FIG. 03  —  HIWA NG ULO AT LALAMUNAN', 99, 520, 902, mono(11, 400, false, 1.6), rgba('pencil'), 0.55);

    // the chest light, low in the drawing: ink dot + ring, a small true glow on the light layer
    // it arrives from where the stone's light was in the last plate
    const h1 = sp(165, 706), arrive = prog(t, this.ctx.start, cut + 0.7, ease.inOutCubic);
    const heart = { x: lerp(SELF.x, h1.x, arrive), y: lerp(GROUND - 48, h1.y, arrive) };
    const I = chestI(liw);
    c.fillStyle = mix('glow', 'ember', 0.35);
    c.beginPath();
    c.arc(heart.x, heart.y, 3.5, 0, TAU);
    c.fill();
    c.strokeStyle = rgba('pencil', 0.5);
    c.beginPath();
    c.arc(heart.x, heart.y, 8 + 1.5 * pulse, 0, TAU);
    c.stroke();
    firefly(g, heart.x, heart.y, { I: I * 0.6, r: 0.35, t, seed: 3, flicker: 0.25 });

    // ---- lyrics, right margin --------------------------------------------------------------
    lyricStack(c, this.lines, t, {
      x: W - MARGIN - 24, y: 560, align: 'right', font: serif(54, 340), lh: 70, keep: 1, maxW: 900, olderDim: 0.45,
      style: {
        color: 'pencil', dim: 0.25, hot: 'ember', hotAmt: 0.45,
        // "lalamunan" catches as it's sung
        fx: (q) => {
          const onset = q.t - q.since;
          if (onset < this.lalamunan.start - 0.05 || onset > this.lalamunan.end || q.p <= 0) return;
          return { dx: (hash(q.gi, Math.floor(q.t * 12)) - 0.5) * 1.6 * (1 - q.wp * 0.5), scale: 1 - 0.04 * closed };
        },
      },
    });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 1.1 }] });
    return { hudInk: true, vignette: 0.3, zoom: 1 + 0.006 * Math.sin((t - cut) * TAU * 0.03) };
  }
}
