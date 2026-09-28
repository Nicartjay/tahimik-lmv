// TALA 18 · GITNA — "Baka sa tahimik kong paraan / Mag-stand out din ako".
// The only centred plate in the film. The crowd owns the middle when it opens; the self
// walks in from the left margin, one step per beat, and the crowd parts and recedes to
// faint outlines. A registration mark labelled GITNA waits at frame centre; the camera
// settles the self's chest exactly on it, and "ako" lands — the peak of the video.

import { H, MARGIN, W } from '../engine/config';
import { mono, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { drawLine, lineAlpha, lineLayout, text, type KStyle } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { mix, rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, lerp, noise1, prog, smoothstep, TAU } from '../engine/util';
import { callout, chestI, firefly, GROUND, hairline, idle, nightBg, person, SELF, talk, type Placed } from './_motifs';

const CX = W / 2;
const CY = H / 2;
const STEPS = 6;
const X1 = CX; // where the walk ends
const H1 = SELF.h * 1.06; // standing up straight, a little taller
const PUSH = 1.3; // camera scale once the self is centred

/** chest y (world) of person() at feet y, height h, shrink 0 — mirrors _motifs.person */
const chestY = (y: number, h: number) => y - h * 0.7 + h * 0.34 * 0.62;

interface Member extends Placed {
  /** where it drifts to when it makes way */
  x1: number;
}
const CROWD: Member[] = [
  { x: 580, y: GROUND, s: 0.94, seed: 5, x1: 400 },
  { x: 690, y: GROUND, s: 1.03, seed: 17, x1: 520 },
  { x: 800, y: GROUND, s: 0.97, seed: 29, x1: 640 },
  { x: 905, y: GROUND, s: 1.05, seed: 31, x1: 760 },
  { x: 1015, y: GROUND, s: 0.92, seed: 43, x1: 1160 },
  { x: 1125, y: GROUND, s: 1.0, seed: 59, x1: 1280 },
  { x: 1240, y: GROUND, s: 0.96, seed: 61, x1: 1400 },
  { x: 1370, y: GROUND, s: 1.02, seed: 73, x1: 1520 },
];

const F1 = serif(58, 330);
const F2 = serif(116, 340);

export default class Gitna extends Scene {
  paraan = this.lyrics.find('Baka sa tahimik', this.ctx.start);
  stand = this.lyrics.find('Mag-stand out', this.ctx.start);
  ako = Lyrics.word(this.stand, 'ako');

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const { paraan, stand, ako } = this;
    const liw = this.liwanag(t);

    // ---- the walk: one step per beat from the first beat of the line ----------
    const b0 = Math.ceil(A.beatAt(paraan.start));
    const bw = A.beatAt(t) - b0;
    const k = clamp(Math.floor(bw), 0, STEPS);
    const s = k >= STEPS ? 0 : prog(bw - k, 0, 0.62, ease.inOutSine);
    const done = bw < 0 ? 0 : Math.min(STEPS, k + s);
    const walk = done / STEPS;
    const selfX = lerp(SELF.x, X1, walk);
    const lift = Math.sin(Math.PI * s) * (bw >= 0 && k < STEPS ? 5 : 0);
    const arriveT = A.timeOfBeat(b0 + STEPS - 1) + A.period(t) * 0.62;
    const arrived = prog(t, arriveT - 0.2, arriveT + 0.5, ease.outCubic);
    const h = lerp(SELF.h, H1, arrived);

    // ---- "ako": the landing -------------------------------------------------
    const since = t - ako.start;
    const burst = since >= 0 ? Math.exp(-since / 0.28) : 0;
    const akoP = prog(t, ako.start - 0.05, ako.start + 0.7, ease.outCubic);
    const down = A.timeOfBar(Math.ceil(A.barAt(ako.start))); // the band comes back in
    const back = t >= down ? Math.exp(-(t - down) / 0.3) : 0;

    // ---- camera: settle the chest on frame centre -----------------------------
    const cp = prog(t, arriveT, stand.start + 0.35, ease.inOutCubic);
    const zs = lerp(1, PUSH, cp) * (1 + 0.012 * burst);
    const fy = lerp(CY, chestY(GROUND, H1), cp);
    const toX = (x: number) => CX + (x - CX) * zs;
    const toY = (y: number) => CY + (y - fy) * zs;

    // ---- release: everything but the light lets go before WAKAS takes over -----
    const next = this.params.next as number;
    const keep = (a: number, b: number) => 1 - prog(t, next - a, next - b, ease.inOutSine);
    const typeA = keep(1.9, 0.7), crowdA = keep(1.6, 0.2), markA = keep(1.2, -0.2), selfA = keep(0.6, -0.9);

    const markY = toY(chestY(GROUND, H1));
    const I = chestI(liw) * (1 + 0.25 * arrived) * (1 + 0.9 * burst + 0.25 * back);
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // ---- the centre mark (screen space, follows the camera; the crowd stands in front of it)
    const tahimik = Lyrics.word(paraan, 'tahimik');
    const mk = prog(t, tahimik.start - 0.2, tahimik.start + 1.6, ease.inOutCubic);
    if (mk > 0 && markA > 0.003) {
      const R = 118 * zs / PUSH + 18;
      const col = rgba('ash', (0.55 + 0.25 * arrived) * markA);
      c.strokeStyle = col;
      c.lineWidth = 1;
      // centre axis, top to bottom, fading once the line takes the top of frame
      const ax = mk * (1 - prog(t, stand.start - 0.5, stand.start + 0.4));
      if (ax > 0.003) {
        c.save();
        c.setLineDash([3, 7]);
        c.globalAlpha = 0.5 * ax;
        const yTop = 124, yBot = H - 124;
        c.beginPath();
        c.moveTo(CX, yTop);
        c.lineTo(CX, lerp(yTop, yBot, mk));
        c.stroke();
        c.restore();
      }
      // ring + four arms, drawing on
      c.beginPath();
      c.arc(CX, markY, R, -Math.PI / 2, -Math.PI / 2 + TAU * mk);
      c.stroke();
      const a0 = R + 12, a1 = R + 12 + 44 * clamp(mk * 1.4 - 0.4);
      c.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (a1 <= a0) break;
        c.moveTo(CX + dx * a0, markY + dy * a0);
        c.lineTo(CX + dx * a1, markY + dy * a1);
      }
      c.stroke();
      // small tick at the exact centre until the chest arrives there
      const tk = 1 - arrived;
      if (tk > 0.01) {
        c.globalAlpha = tk;
        hairline(c, CX - 6, markY, CX + 6, markY, col);
        hairline(c, CX, markY - 6, CX, markY + 6, col);
        c.globalAlpha = 1;
      }
      callout(c, CX + R * 0.707, markY + R * 0.707, CX + R + 70, markY + R + 44, 'GITNA', {
        p: prog(t, tahimik.start + 0.6, tahimik.start + 1.8), alpha: 0.7 * (1 - 0.3 * akoP) * markA,
      });
      c.globalAlpha = prog(t, tahimik.start + 1.4, tahimik.start + 2.2) * 0.55 * markA;
      text(c, 'X 960  ·  Y 540', CX + R + 78, markY + R + 64, mono(11, 400, false, 1.6), rgba('graphite'), 'left');
      c.globalAlpha = 1;
    }

    // ---- world (camera space) -------------------------------------------------
    c.save();
    c.translate(CX, CY);
    c.scale(zs, zs);
    c.translate(-CX, -fy);

    hairline(c, MARGIN - 400, GROUND + 1, W - MARGIN + 400, GROUND + 1, rgba('graphite', 0.7 * crowdA));

    // footfalls left on the ground, one tick per step taken
    c.strokeStyle = rgba('graphite', 0.9 * crowdA);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i <= Math.floor(done + 1e-6); i++) {
      const x = lerp(SELF.x, X1, i / STEPS);
      c.moveTo(x, GROUND + 6);
      c.lineTo(x, GROUND + 12);
    }
    c.stroke();

    // the crowd: talking, then making way — parting outwards, receding to outlines,
    // heads turning towards the one in the middle
    const pulse = A.beatPulse(t, 0.14);
    const stepW = (X1 - SELF.x) / STEPS;
    const iR = CROWD.findIndex((p) => p.x > CX);
    CROWD.forEach((p, i) => {
      // the left side makes way as the self nears each one; the right side moves off together,
      // outermost first, so nobody steps into a neighbour who hasn't moved yet
      const kp = i < iR
        ? clamp((p.x - SELF.x - 260) / stepW, 0.4, STEPS)
        : clamp((CROWD[iR].x - SELF.x - 260) / stepW, 0.4, STEPS) - 0.2 * (i - iR);
      const t0 = A.timeOfBeat(b0 + kp - 0.5);
      const part = prog(t, t0, t0 + 1.3, ease.inOutCubic);
      const id = idle(p, t, 1 - 0.8 * part);
      const toward = p.x < CX ? 1 : -1;
      const x = lerp(p.x, p.x1, part) + id.dx;
      const hh = 172 * p.s * lerp(1, 0.84, part);
      const bob = -pulse * 5 * (0.5 + 0.5 * Math.sin(i * 2.1)) * (1 - part);
      const a = lerp(0.88, 0.3, part) * (1 - 0.25 * akoP) * crowdA;
      const nod = id.nod + toward * 7 * part;
      const lean = id.lean * 0.6 + toward * 0.025 * part;
      if (part < 0.999) person(c, x, p.y + bob, hh, { color: 'ash', alpha: a * (1 - part), lean, nod });
      const pr = person(c, x, p.y + bob, hh, { color: 'ash', alpha: a * part, lean, nod, outline: 1.2 / zs });
      if (part < 0.6 && i % 2 === 0) talk(c, pr.head.x, pr.head.y, hh * 0.105, t + i, p.seed, { dir: i < 4 ? -1 : 1, alpha: 0.5 * (1 - part / 0.6) });
    });

    // the self: straightening as it walks
    const me = person(c, selfX, GROUND - lift, h, {
      color: 'paper', alpha: 0.97 * selfA, shrink: 0.35 * (1 - walk), lean: 0.035 * Math.sin(Math.PI * s) * (k < STEPS ? 1 : 0),
      nod: noise1(t * 0.3, 2) * 2 * (1 - arrived),
    });

    // distance to the centre, counting down with each step
    const dp = prog(t, this.ctx.start + 0.2, this.params.cut + 0.9, ease.inOutCubic) * (1 - prog(t, arriveT - 0.1, arriveT + 0.5));
    if (dp > 0.003) {
      const dy = GROUND + 46;
      const x0 = selfX + 36, x1 = X1 - 20;
      c.globalAlpha = dp;
      if (x1 > x0 + 2) {
        const col = rgba('graphite', 0.9);
        hairline(c, x0, dy, x1, dy, col);
        for (const x of [x0, x1]) hairline(c, x, dy - 7, x, dy + 7, col);
      }
      const left = STEPS - Math.floor(done + 1e-6);
      if (left > 0) text(c, `LAYO SA GITNA  ·  ${left} HAKBANG`, (x0 + x1) / 2, dy + 26, mono(12, 400, false, 2), rgba('ash', 0.8), 'center');
      c.globalAlpha = 1;
    }
    c.restore();

    const chest = { x: toX(me.chest.x), y: toY(me.chest.y) };
    nightBg(out, { t, grid: 0.3 * (1 - 0.35 * akoP), fog: 0.4, warm: [chest.x, chest.y, I * (0.5 + 0.5 * akoP)] });

    // ---- the light --------------------------------------------------------------
    firefly(g, chest.x, chest.y, {
      I, r: (0.75 + 0.25 * arrived + 0.85 * akoP) * zs, // ends at 2.4, where WAKAS picks it up t, seed: 3, flicker: 0.2 * (1 - akoP),
    });

    // ---- lyrics -------------------------------------------------------------------
    // line 1 at the left margin, as every plate before; it lifts away for line 2
    const away = prog(t, stand.start - 0.7, stand.start - 0.05, ease.inOutSine);
    const a1 = lineAlpha(paraan, t, 0.35, 99, 0.5) * (1 - away) * typeA;
    if (a1 > 0.003)
      drawLine(c, paraan, t, MARGIN + 60, 330 - 50 * away, { font: F1, glow: g, glowAmt: 0.35, hotAmt: 0.35, alpha: a1 });

    // line 2: large, centred; "ako" lands and becomes light
    const LY = lineLayout(stand, F2);
    const x0 = CX - LY.w / 2, y2 = 318;
    const rise = (since: number) => (1 - smoothstep(-0.35, 0.05, since)) * 12;
    const base: KStyle = {
      font: F2, lead: 0.35, glow: g, glowAmt: 0.22, hotAmt: 0.3, alpha: (1 - 0.12 * akoP) * typeA,
      fx: (q) => ({ dy: rise(t - stand.words[q.wi].start) }),
    };
    drawLine(c, stand, t, x0, y2, base, [0, 1, 2]);
    if (since >= -0.02 && typeA > 0.003) {
      const wx = x0 + LY.words[3].x, ww = LY.words[3].L.w;
      const sc = 1 + 0.22 * (1 - ease.outQuart(clamp(since / 0.24)));
      drawLine(c, stand, t, wx, y2, {
        font: F2, lead: 0, dim: 1, hot: null, glow: g, glowColor: 'glow', glowAmt: 0.4 + 0.4 * burst, glowSung: 0.75, alpha: typeA,
        fx: (q) => ({
          scale: sc,
          dx: (q.x + q.w / 2 - (wx + ww / 2)) * (sc - 1),
          color: mix('paper', 'glow', 0.28 + 0.5 * burst),
          alpha: clamp(since / 0.06),
        }),
      }, [3]);
    }

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.3 }] });
    return {
      vignette: lerp(0.42, 0.52, akoP),
      bloom: 0.5 + 0.25 * akoP + 0.2 * burst,
      flash: since >= 0 ? 0.035 * Math.exp(-since / 0.16) : 0,
      zoom: 1 + 0.008 * Math.sin((t - this.params.cut) * TAU * 0.05) + 0.006 * back,
    };
  }
}
