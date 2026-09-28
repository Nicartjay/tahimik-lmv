// TALA 09 · ENTABLADO — "Pinapanood ko silang sumikat / Sa entablado ng ating paaralan /
// Ako nama'y nanonood lang / Nakatalikod, ngumingiti nang lihim".
// A school stage, centre-right, in line art: curtains, a sagging ARAW NG PAARALAN banner,
// three performers in cool spotlights that swell on "sumikat". Rows of heads in the dark
// in front. The self stands at the back by the exit and watches (a dashed TINGIN
// sightline); on "Nakatalikod" it turns away, and on "ngumingiti" a small smile, and the
// chest light swells — the only warm thing in the hall, and nobody sees it.

import { MARGIN } from '../engine/config';
import { mono, sans, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { text } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, hash, lerp, noise1, prog, smoothstep, TAU } from '../engine/util';
import { drawSpot, type Spot } from './_chorus';
import { callout, chestI, firefly, hairline, lyricStack, nightBg, person } from './_motifs';

// ---------------------------------------------------------------------------
// geometry

const ST = {
  l: 912, r: 1708, // proscenium
  top: 206,
  val: 282, // valance bottom
  bl: 1004, br: 1616, by: 566, // back edge of the floor
  fl: 930, fr: 1690, fy: 636, // front edge
  apron: 680,
};
const VP = { x: 1310, y: 300 };
const PERF = [
  { x: 1172, seed: 1 },
  { x: 1310, seed: 2 },
  { x: 1448, seed: 3 },
];
const PFEET = 598, PH = 150;
const SELF_X = 300, SELF_Y = 880, SELF_H = 250;
const DOOR = { x0: 188, x1: 412, y0: 500 };

/** three rows of the audience: backs of heads, back → front */
const ROWS = [
  { y: 676, s: 0.55, x0: 780, x1: 1740, gap: 50 },
  { y: 772, s: 0.76, x0: 700, x1: 1640, gap: 66 },
  { y: 892, s: 1.0, x0: 620, x1: 1580, gap: 88 },
];
const CROWD = ROWS.flatMap((row, ri) => {
  const out: { x: number; y: number; s: number; seed: number; row: number }[] = [];
  let i = 0;
  for (let x = row.x0; x <= row.x1; x += row.gap, i++) {
    const seed = ri * 100 + i;
    out.push({ x: x + (hash(seed, 1) - 0.5) * row.gap * 0.5 + (ri % 2) * row.gap * 0.3, y: row.y + (hash(seed, 2) - 0.5) * 10, s: row.s * (0.9 + 0.2 * hash(seed, 3)), seed, row: ri });
  }
  return out;
});
const SPARK = Array.from({ length: 12 }, (_, k) => ({ x: 1090 + hash(k, 21) * 440, y: 372 + hash(k, 22) * 180, r: 5 + hash(k, 23) * 5 }));

// ---------------------------------------------------------------------------

export default class Entablado extends Scene {
  lines = this.lyrics.between(this.ctx.start, this.ctx.end - 0.5).filter((l) => l.start > this.ctx.start - 1);
  lPanood = this.lyrics.find('Pinapanood', this.ctx.start - 2);
  lEnta = this.lyrics.find('Sa entablado', this.ctx.start - 2);
  lAko = this.lyrics.find('Ako nama', this.ctx.start - 2);
  lTalikod = this.lyrics.find('Nakatalikod', this.ctx.start - 2);

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const cut = this.params.cut as number, next = this.params.next as number;
    const panood = Lyrics.word(this.lPanood, 'Pinapanood');
    const silang = Lyrics.word(this.lPanood, 'silang');
    const sumikat = Lyrics.word(this.lPanood, 'sumikat');
    const enta = Lyrics.word(this.lEnta, 'entablado');
    const ako = Lyrics.word(this.lAko, 'Ako');
    const talikod = Lyrics.word(this.lTalikod, 'Nakatalikod,');
    const ngiti = Lyrics.word(this.lTalikod, 'ngumingiti');
    const lihim = Lyrics.word(this.lTalikod, 'lihim');
    const liw = this.liwanag(t);

    const c = this.layer(0).begin();
    const g = this.layer(1).begin();
    const pulse = A.beatPulse(t, 0.16);
    const shine = prog(t, sumikat.start - 0.15, sumikat.start + 0.5, ease.outCubic);
    const k = (a: number, d = 1.0) => prog(t, a, a + d, ease.outCubic);

    // -- the stage -------------------------------------------------------------
    // back wall and floor
    c.fillStyle = rgba('slate', 0.22 + 0.08 * shine);
    c.fillRect(ST.bl, ST.val, ST.br - ST.bl, ST.by - ST.val);
    c.beginPath();
    c.moveTo(ST.bl, ST.by);
    c.lineTo(ST.br, ST.by);
    c.lineTo(ST.fr, ST.fy);
    c.lineTo(ST.fl, ST.fy);
    c.closePath();
    c.fillStyle = rgba('slate', 0.34 + 0.1 * shine);
    c.fill();
    c.strokeStyle = rgba('graphite', 0.3);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 14; i++) {
      const xf = lerp(ST.fl, ST.fr, i / 14);
      const u = (ST.fy - ST.by) / (ST.fy - VP.y);
      c.moveTo(xf, ST.fy);
      c.lineTo(lerp(xf, VP.x, u), ST.by);
    }
    c.stroke();
    hairline(c, ST.bl, ST.by, ST.br, ST.by, rgba('graphite', 0.45));
    // apron
    c.fillStyle = rgba('ink2', 1);
    c.fillRect(ST.fl, ST.fy, ST.fr - ST.fl, ST.apron - ST.fy);
    hairline(c, ST.fl, ST.fy, ST.fr, ST.fy, rgba('ash', 0.45 + 0.15 * shine));

    // performers, in their pools
    const beatN = A.beatAt(t);
    const perf = PERF.map((p, i) => {
      const sway = 0.04 * Math.sin((beatN + i * 0.66) * Math.PI) + noise1(t * 0.6, p.seed) * 0.01;
      const y = PFEET - 3 * pulse * (0.6 + 0.4 * hash(p.seed));
      const h = PH * (1 + 0.05 * shine);
      person(c, p.x, y, h, { color: 'ash', alpha: 0.92, lean: sway, nod: noise1(t * 0.9, p.seed + 4) * 3 });
      if (shine > 0) person(c, p.x, y, h, { color: 'paper', alpha: 0.5 * shine, lean: sway, nod: noise1(t * 0.9, p.seed + 4) * 3 });
      return { x: p.x, y, h };
    });

    // curtains: soft folds that breathe
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? ST.l : ST.r;
      const inner = side < 0 ? ST.bl - 6 : ST.br + 6;
      c.beginPath();
      c.moveTo(x0, ST.top);
      c.lineTo(inner, ST.top);
      for (let y = ST.top; y <= ST.fy; y += 16) {
        const wob = Math.sin(y * 0.045 + t * 0.9 + side) * 5 + noise1(y * 0.01 + t * 0.2, side + 9) * 5;
        c.lineTo(inner + side * wob, y);
      }
      c.lineTo(x0, ST.fy);
      c.closePath();
      c.fillStyle = rgba('ink2', 1);
      c.fill();
      c.strokeStyle = rgba('graphite', 0.3);
      c.lineWidth = 1;
      c.beginPath();
      for (let j = 1; j <= 4; j++) {
        const fx = lerp(x0, inner, j / 5);
        c.moveTo(fx, ST.top);
        for (let y = ST.top; y <= ST.fy; y += 20) c.lineTo(fx + Math.sin(y * 0.03 + t * 0.7 + j * 1.3) * (2 + j * 0.6), y);
      }
      c.stroke();
    }
    // valance, scalloped
    c.beginPath();
    c.moveTo(ST.l, ST.top);
    c.lineTo(ST.r, ST.top);
    const nS = 11, sw = (ST.r - ST.l) / nS;
    c.lineTo(ST.r, ST.val - 16);
    for (let i = nS - 1; i >= 0; i--) {
      const xa = ST.l + (i + 1) * sw, xb = ST.l + i * sw;
      c.quadraticCurveTo((xa + xb) / 2, ST.val + 14, xb, ST.val - 16);
    }
    c.closePath();
    c.fillStyle = rgba('ink2', 1);
    c.fill();
    c.strokeStyle = rgba('graphite', 0.5);
    c.stroke();
    // proscenium frame
    c.strokeStyle = rgba('graphite', 0.55);
    c.lineWidth = 1.2;
    c.strokeRect(ST.l, ST.top, ST.r - ST.l, ST.apron - ST.top);

    // the banner, on sagging strings
    const bx0 = 1098, bx1 = 1522, byT = 318 + Math.sin(t * 0.8) * 1.5, byB = byT + 46;
    c.strokeStyle = rgba('graphite', 0.55);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(bx0 - 40, ST.val - 4);
    c.quadraticCurveTo(bx0 - 24, byT - 4, bx0, byT);
    c.moveTo(bx1 + 40, ST.val - 4);
    c.quadraticCurveTo(bx1 + 24, byT - 4, bx1, byT);
    c.stroke();
    c.beginPath();
    c.moveTo(bx0, byT);
    c.quadraticCurveTo((bx0 + bx1) / 2, byT + 8, bx1, byT);
    c.lineTo(bx1, byB);
    c.quadraticCurveTo((bx0 + bx1) / 2, byB + 8, bx0, byB);
    c.closePath();
    c.fillStyle = rgba('ink2', 0.9);
    c.fill();
    c.strokeStyle = rgba('ash', 0.5 + 0.2 * shine);
    c.stroke();
    text(c, 'ARAW NG PAARALAN', (bx0 + bx1) / 2, byT + 32, sans(24, 600, 'condensed', 7), rgba('paper', 0.62 + 0.25 * shine), 'center');

    // sparkles on "sumikat": cool, four-pointed, one set per beat
    const spk = shine * (1 - prog(t, ako.start - 0.5, ako.start + 0.5));
    if (spk > 0) {
      const b = Math.floor(beatN), ph = beatN - b;
      c.fillStyle = rgba('paper', 0.75 * spk);
      SPARK.forEach((s, i) => {
        if (hash(b, i, 5) < 0.55) return;
        const r = s.r * (1 - ph) ** 1.4;
        if (r < 0.6) return;
        c.beginPath();
        c.moveTo(s.x, s.y - r * 1.6);
        c.quadraticCurveTo(s.x, s.y, s.x + r, s.y);
        c.quadraticCurveTo(s.x, s.y, s.x, s.y + r * 1.6);
        c.quadraticCurveTo(s.x, s.y, s.x - r, s.y);
        c.quadraticCurveTo(s.x, s.y, s.x, s.y - r * 1.6);
        c.fill();
      });
    }

    // -- the audience: backs of heads, a rim of stage light --------------------------
    for (const m of CROWD) {
      const bob = -pulse * 2.2 * m.s * hash(m.seed, 4) + noise1(t * 0.5, m.seed) * 1.5;
      const r = 22 * m.s, x = m.x + noise1(t * 0.3, m.seed + 50) * 2;
      const hy = m.y - 62 * m.s + bob - 6 * m.s * shine * (hash(m.seed, 6) > 0.6 ? 1 : 0);
      c.fillStyle = rgba('ink', 1);
      c.beginPath();
      c.arc(x, hy, r, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(x - 44 * m.s, 1100);
      c.lineTo(x - 42 * m.s, m.y - 22 * m.s);
      c.quadraticCurveTo(x - 40 * m.s, m.y - 34 * m.s + bob, x - 12 * m.s, m.y - 36 * m.s + bob);
      c.lineTo(x + 12 * m.s, m.y - 36 * m.s + bob);
      c.quadraticCurveTo(x + 40 * m.s, m.y - 34 * m.s + bob, x + 42 * m.s, m.y - 22 * m.s);
      c.lineTo(x + 44 * m.s, 1100);
      c.closePath();
      c.fill();
      // rim light from the stage: stronger near its axis
      const lit = (1 - clamp(Math.abs(x - VP.x) / 760)) * (0.28 + 0.2 * shine) * (1 - 0.25 * m.row);
      c.strokeStyle = rgba('ash', lit);
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(x, hy, r, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    }

    // -- the self: at the back, by the exit ----------------------------------------
    const col = rgba('graphite', 0.4);
    hairline(c, DOOR.x0, SELF_Y, DOOR.x0, DOOR.y0, col);
    hairline(c, DOOR.x0, DOOR.y0, DOOR.x1, DOOR.y0, col);
    hairline(c, DOOR.x1, DOOR.y0, DOOR.x1, SELF_Y, col);
    hairline(c, 120, SELF_Y, 560, SELF_Y, rgba('graphite', 0.3));
    c.strokeStyle = rgba('sea', 0.4);
    c.lineWidth = 1;
    c.strokeRect(260, DOOR.y0 - 30, 80, 20);
    text(c, 'LABASAN', 300, DOOR.y0 - 16, mono(10, 500, false, 1.6), rgba('sea', 0.6), 'center');

    const turnT = talikod.start;
    const turn = smoothstep(turnT, turnT + 0.5, t);
    const squash = 1 - 0.8 * Math.sin(prog(t, turnT, turnT + 0.5) * Math.PI);
    const lean = lerp(0.035, -0.03, turn) + noise1(t * 0.4, 5) * 0.008;
    const nod = lerp(4, -4, turn) + noise1(t * 0.3, 2) * 1.5;
    c.save();
    c.translate(SELF_X, SELF_Y);
    c.scale(squash, 1);
    c.translate(-SELF_X, -SELF_Y);
    const me = person(c, SELF_X, SELF_Y, SELF_H, { color: 'paper', alpha: 0.95, shrink: 0.3, lean, nod });
    c.restore();
    const head = { x: SELF_X + (me.head.x - SELF_X) * squash, y: me.head.y };
    const chest = { x: SELF_X + (me.chest.x - SELF_X) * squash, y: me.chest.y };
    const hr = me.h * 0.105;

    // the smile only we can see
    const sm = prog(t, ngiti.start, ngiti.start + 0.5, ease.outCubic);
    if (sm > 0) {
      c.strokeStyle = rgba('ink', 0.85);
      c.lineWidth = 1.8;
      c.lineCap = 'round';
      c.beginPath();
      const a0 = Math.PI * 0.62, a1 = Math.PI * 0.95;
      c.arc(head.x - hr * 0.42, head.y + hr * 0.05, hr * 0.36, a0, lerp(a0, a1, sm));
      c.stroke();
      c.lineCap = 'butt';
    }

    // chest light: the usual, plus the smile
    const bloom = 0.42 * prog(t, ngiti.start, ngiti.start + 0.9, ease.inOutSine) - 0.2 * prog(t, lihim.start + 0.3, lihim.end + 0.4, ease.inOutSine);
    const I = chestI(liw) + Math.max(0, bloom);
    firefly(g, chest.x, chest.y, { I, r: 0.75 + 0.3 * clamp(bloom / 0.42), t, seed: 9, flicker: 0.2 });

    // -- field notes ---------------------------------------------------------------
    // TINGIN: the sightline, drawn on "Pinapanood", reeled back in on "Nakatalikod"
    const tgt = { x: perf[1].x, y: perf[1].y - PH * 0.62 };
    const on = prog(t, panood.start - 0.05, panood.start + 1.1, ease.inOutCubic);
    const off = prog(t, turnT - 0.1, turnT + 0.45, ease.inCubic);
    const reach = on * (1 - off);
    if (reach > 0) {
      const sx = head.x + 30, sy = head.y - 4;
      const ex = lerp(sx, tgt.x, reach), ey = lerp(sy, tgt.y, reach);
      c.strokeStyle = rgba('paper', 0.42);
      c.lineWidth = 1;
      c.setLineDash([3, 7]);
      c.lineDashOffset = -t * 14;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
      c.stroke();
      c.setLineDash([]);
      c.lineDashOffset = 0;
      if (reach > 0.35) {
        const mx = lerp(sx, tgt.x, 0.3), my = lerp(sy, tgt.y, 0.3);
        c.save();
        c.translate(mx, my - 12);
        c.rotate(Math.atan2(tgt.y - sy, tgt.x - sx));
        c.globalAlpha = smoothstep(0.35, 0.6, reach);
        text(c, 'TINGIN', 0, 0, mono(11, 500, false, 1.8), rgba('paper', 0.6));
        c.restore();
      }
    }
    callout(c, perf[2].x + 18, perf[2].y - PH - 6, 1736, 402, 'SILA  ·  3', { p: k(silang.start - 0.1), alpha: 0.6 * (1 - prog(t, ako.start, ako.start + 0.8)) });

    // ENTABLADO: a dimension line across the proscenium, drawn out from the middle
    const dm = prog(t, enta.start - 0.05, enta.start + 0.9, ease.inOutCubic);
    if (dm > 0) {
      const dy = ST.top - 22, half = ((ST.r - ST.l) / 2) * dm, cx = (ST.l + ST.r) / 2;
      const col2 = rgba('paper', 0.45 * (1 - 0.5 * prog(t, talikod.start, talikod.start + 1.5)));
      hairline(c, cx - half, dy, cx + half, dy, col2);
      if (dm >= 1) {
        hairline(c, ST.l, dy - 6, ST.l, dy + 6, col2);
        hairline(c, ST.r, dy - 6, ST.r, dy + 6, col2);
      }
      c.fillStyle = rgba('ink', 1);
      c.fillRect(cx - 86, dy - 10, 172, 20);
      c.globalAlpha = smoothstep(0.4, 0.9, dm);
      text(c, 'ENTABLADO  ·  12 M', cx, dy + 4, mono(12, 500, false, 1.8), col2, 'center');
      c.globalAlpha = 1;
    }

    const akoA = 1 - prog(t, turnT - 0.2, turnT + 0.3);
    callout(c, head.x + hr + 4, head.y - hr * 0.6, head.x + 150, head.y - 120, 'AKO', { p: k(ako.start - 0.05, 0.8), alpha: 0.62 * akoA });
    callout(c, head.x - hr - 2, head.y - hr * 0.3, 140, head.y - 110, 'NAKATALIKOD', {
      p: k(turnT + 0.45, 1.0), alpha: 0.62 * (1 - prog(t, lihim.start, lihim.start + 0.6) * 0.5),
    });
    callout(c, chest.x + 14, chest.y + 4, chest.x + 140, chest.y + 70, 'LIHIM', { p: k(lihim.start - 0.05, 0.8), alpha: 0.55 });

    // -- lyrics, top-left ------------------------------------------------------------
    lyricStack(c, this.lines, t, {
      x: MARGIN + 60, y: 404, font: serif(54, 330), lh: 70, keep: 1, maxW: 744, glow: g,
      style: { glowAmt: 0.35, hotAmt: 0.35 },
    });

    // -- composite: ground, pools, canvas, beams ---------------------------------------
    nightBg(out, { t, grid: 0.12, fog: 0.42, warm: [chest.x, chest.y, I * 0.5] });
    const spots: Spot[] = perf.map((p, i) => ({
      src: [lerp(1150, 1470, i / 2), 120 + (i === 1 ? -20 : 0)] as [number, number],
      tgt: [p.x, PFEET] as [number, number],
      pool: [78, 20] as [number, number],
      I: (0.42 + 0.5 * shine) * (0.9 + 0.1 * A.beatPulse(t, 0.15)) * (1 - 0.25 * prog(t, turnT, turnT + 2)),
    }));
    for (const s of spots) drawSpot(out, s, t, 'pool');
    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });
    for (const s of spots) drawSpot(out, s, t, 'cone');

    return {
      vignette: 0.42,
      zoom: 1.004 + 0.012 * prog(t, cut, next),
    };
  }
}
