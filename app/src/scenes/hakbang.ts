// TALA 14 · ISANG HAKBANG — the bridge, and a callback to GILID: the same ground line,
// the same group, the same "LAYO · 4 HAKBANG". "lakas-loob" swells the chest light and
// straightens the self; "isang hakbang" measures one step on the dimension line; on
// "paabante" the self takes exactly that step (lift on the beat, land on the downbeat)
// and the note is corrected 4 → 3. "‘Di naman kailangang magbago agad" holds still,
// breathing. "dahan-dahan lang" pencils the next small steps in, one per bar — not taken.
// First light (dawn) rises on the horizon across the whole plate.

import { MARGIN } from '../engine/config';
import { applyFont, layout, mono, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { drawLine, lineAlpha, lineLayout, text } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, keys, lerp, noise1, prog, TAU } from '../engine/util';
import { callout, chestI, firefly, GROUND, hairline, idle, lyricStack, nightBg, person, SELF, talk, type Placed } from './_motifs';

// same group as GILID
const GROUP: Placed[] = [
  { x: 1040, y: GROUND, s: 0.92, seed: 11 },
  { x: 1150, y: GROUND, s: 1.02, seed: 23 },
  { x: 1262, y: GROUND, s: 0.97, seed: 37 },
  { x: 1370, y: GROUND, s: 1.06, seed: 41 },
  { x: 1478, y: GROUND, s: 0.9, seed: 53 },
  { x: 1580, y: GROUND, s: 1.0, seed: 67 },
];

const X0 = SELF.x + 36;
const X1 = GROUP[0].x - 36;
const STEP = (X1 - X0) / 4;
const DY = GROUND + 46;
const PRINT_Y = GROUND + 17;
const LX = MARGIN + 60;
const LY = 330;
const LFONT = serif(58, 330);
const EFONT = serif(40, 300, true);
const NOTE = mono(12, 400, false, 2);
const FIX = serif(22, 420, true);

/** plan-view footprints (a pair of small ovals, walking right) */
function prints(c: CanvasRenderingContext2D, x: number, y: number, col: string, dashed = false, s = 1) {
  c.save();
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = 1.1;
  if (dashed) c.setLineDash([3, 2]);
  for (const [dx, dy] of [[-4, -4], [4, 4]]) {
    c.beginPath();
    c.ellipse(x + dx * s, y + dy * s, 7 * s, 2.8 * s, 0, 0, TAU);
    if (dashed) c.stroke();
    else c.fill();
  }
  c.restore();
}

export default class Hakbang extends Scene {
  private cut = this.params.cut as number;
  private next = this.params.next as number;
  private bridge = this.lyrics.find('Baka isang araw');
  private hak = this.lyrics.find('isang hakbang lang paabante');
  private mag = this.lyrics.find('magbago agad');
  private dahan = this.lyrics.find('Pwede namang dahan-dahan');
  private echo = this.lyrics.lines.find((l) => l.echo && l.start > this.dahan.start) ?? null;
  private lines = this.lyrics
    .between(this.ctx.start, this.ctx.end)
    .filter((l) => !l.echo && l.start > this.ctx.start - 1 && l.start < this.next - 0.1);
  private lakas = Lyrics.word(this.bridge, 'lakas-loob');
  private isang = Lyrics.word(this.hak, 'isang');
  private paabante = Lyrics.word(this.hak, 'paabante');
  // the step: lift on the first beat after "paabante", land on the next one
  private kLift = Math.ceil(this.audio.beatAt(this.paabante.start) - 0.05);
  private lift = this.audio.timeOfBeat(this.kLift);
  private land = this.audio.timeOfBeat(this.kLift + 1);
  // "dahan-dahan": one pencilled footprint per bar
  private kBar = Math.ceil(this.audio.barAt(this.dahan.start));

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const liw = this.liwanag(t);
    const lk = this.lakas;

    // ---- the self's state -------------------------------------------------
    const stepP = prog(t, this.lift, this.land, ease.inOutCubic);
    const prep = prog(t, this.paabante.start, this.lift, ease.inOutSine) * (1 - stepP);
    const selfX = SELF.x + STEP * stepP;
    const hop = Math.sin(stepP * Math.PI);
    const shrink = keys(t, [[lk.start - 0.1, 0.3], [lk.end + 0.4, 0.1, ease.inOutSine]]);
    const swell = keys(t, [[lk.start - 0.05, 0], [lk.start + 0.55, 1, ease.outCubic], [lk.end + 1.8, 0.2, ease.inOutSine], [this.next, 0.1]]);
    const breath = 0.5 + 0.5 * Math.sin(TAU * (A.barAt(t) - 0.25));

    // warm pool follows the chest; dawn rises on the horizon across the plate
    const chestY = SELF.y - SELF.h * 0.58;
    nightBg(out, { t, grid: 0.3, fog: 0.4, warm: [selfX, chestY, chestI(liw) * (0.55 + 0.3 * swell)] });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    const dawn = lerp(0.05, 0.16, prog(t, this.cut, this.next, ease.inOutSine));
    c.save();
    c.translate(1320, GROUND);
    c.scale(1, 0.32);
    const dg = c.createRadialGradient(0, 0, 0, 0, 0, 1250);
    dg.addColorStop(0, rgba('dawn', dawn));
    dg.addColorStop(0.45, rgba('dawn', dawn * 0.35));
    dg.addColorStop(1, rgba('dawn', 0));
    c.fillStyle = dg;
    c.fillRect(-1400, -1250, 2800, 2500);
    c.restore();

    // ground line (already drawn: this plate starts complete)
    hairline(c, MARGIN, GROUND + 1, 1920 - MARGIN, GROUND + 1, rgba('graphite', 0.7));

    // ---- the group: calmer than in GILID; the nearest one turns, a little ------
    const pulse = A.beatPulse(t, 0.16);
    const turn = prog(t, this.dahan.start, this.dahan.start + 2.5, ease.inOutSine);
    GROUP.forEach((p, i) => {
      const id = idle(p, t, 0.8);
      const h = 172 * p.s;
      const sway = Math.sin(f.beat * Math.PI + i * 1.3) * 0.035;
      const bob = -pulse * 3 * (0.5 + 0.5 * Math.sin(i * 2.1));
      const nod = id.nod + (i === 0 ? -9 * turn : 0);
      const pr = person(c, p.x + id.dx, p.y + bob, h, { color: 'ash', alpha: 0.85, lean: id.lean * 0.6 + sway - (i === 0 ? 0.03 * turn : 0), nod });
      if (i % 3 === 1) talk(c, pr.head.x, pr.head.y, h * 0.105, t + i, p.seed, { dir: i < 3 ? -1 : 1, alpha: 0.4 });
    });

    // ---- where I was: ghost outline + footprints + "DATI" --------------------
    const after = prog(t, this.land - 0.1, this.land + 0.6, ease.outCubic);
    if (after > 0) {
      c.save();
      c.setLineDash([4, 5]);
      person(c, SELF.x, SELF.y, SELF.h, { color: 'graphite', alpha: 0.85 * after, shrink: 0.3, outline: 1 });
      c.restore();
      prints(c, SELF.x, PRINT_Y, rgba('ash', 0.6 * after));
      c.globalAlpha = after;
      text(c, 'DATI', SELF.x, GROUND + 44, mono(11, 400, false, 2.2), rgba('ash', 0.6), 'center');
      c.globalAlpha = 1;
    }
    // new footprints under the self once landed
    if (stepP >= 1) prints(c, selfX, PRINT_Y, rgba('paper', 0.7 * prog(t, this.land, this.land + 0.25)));

    // the movement arrow over the heads: a pencil arc, drawn with the step
    const arcP = prog(t, this.lift - 0.1, this.land + 0.2, ease.inOutCubic);
    if (arcP > 0) {
      const ay = SELF.y - SELF.h - 40, ax0 = SELF.x + 6, ax1 = SELF.x + STEP - 6;
      const fade = 1 - prog(t, this.mag.end, this.mag.end + 2);
      c.save();
      c.strokeStyle = rgba('paper', 0.55 * fade);
      c.lineWidth = 1.2;
      c.beginPath();
      const n = 24;
      let ex = ax0, ey = ay, pa = 0;
      for (let i = 0; i <= n * arcP; i++) {
        const u = i / n;
        const x = lerp(ax0, ax1, u), y = ay - Math.sin(u * Math.PI) * 38;
        if (i === 0) c.moveTo(x, y);
        else {
          pa = Math.atan2(y - ey, x - ex);
          c.lineTo(x, y);
        }
        ex = x;
        ey = y;
      }
      c.stroke();
      if (arcP > 0.95) {
        c.beginPath();
        c.moveTo(ex - 9 * Math.cos(pa - 0.45), ey - 9 * Math.sin(pa - 0.45));
        c.lineTo(ex, ey);
        c.lineTo(ex - 9 * Math.cos(pa + 0.45), ey - 9 * Math.sin(pa + 0.45));
        c.stroke();
      }
      c.restore();
      c.globalAlpha = prog(t, this.land, this.land + 0.4) * fade;
      text(c, '+1', (ax0 + ax1) / 2, ay - 50, mono(12, 500, false, 1.5), rgba('paper', 0.75), 'center');
      c.globalAlpha = 1;
    }

    // ---- "dahan-dahan": the next small steps, pencilled in one per bar ----------
    for (let k = 0; k < 3; k++) {
      const tb = A.timeOfBar(this.kBar + k);
      const a = prog(t, tb - 0.08, tb + 0.35, ease.outCubic);
      if (a <= 0) continue;
      const pop = 1 + 0.35 * Math.exp(-Math.max(0, t - tb) / 0.18) * (t >= tb ? 1 : 0);
      prints(c, SELF.x + STEP * (1 + 0.5 * (k + 1)), PRINT_Y, rgba('sea', 0.9 * a), true, 1.15 * pop);
    }

    // ---- the dimension line: LAYO · 4 → 3 HAKBANG --------------------------------
    const x0 = X0 + STEP * stepP;
    const dim = rgba('graphite', 0.9);
    hairline(c, x0, DY, X1, DY, dim);
    for (const x of [x0, X1]) hairline(c, x, DY - 7, x, DY + 7, dim);
    for (let s = 1; s < 4; s++) {
      const x = X0 + STEP * s;
      if (x > x0 + 2) hairline(c, x, DY - 3, x, DY + 3, dim);
    }
    // "isang hakbang": the first segment is measured in paper, then walked
    const segP = prog(t, this.isang.start, this.isang.start + 0.6, ease.inOutCubic);
    if (segP > 0 && x0 < X0 + STEP - 0.5) {
      const segA = 1 - prog(t, this.land - 0.2, this.land + 0.2);
      hairline(c, x0, DY, lerp(x0, X0 + STEP, segP), DY, rgba('paper', 0.9 * segA), 2);
      c.globalAlpha = prog(t, this.isang.start + 0.3, this.isang.start + 0.9) * segA;
      text(c, 'ISANG HAKBANG', X0 + STEP / 2, DY + 26, mono(11, 500, false, 2), rgba('paper', 0.85), 'center');
      c.globalAlpha = 1;
    }
    this.distanceLabel(c, t, (x0 + X1) / 2);

    // ---- the self ---------------------------------------------------------------
    const me = person(c, selfX, SELF.y - hop * 7, SELF.h, {
      color: 'paper', alpha: 0.95, shrink,
      lean: 0.07 * hop - 0.03 * prep,
      nod: noise1(t * 0.3, 2) * 2,
    });
    firefly(g, me.chest.x, me.chest.y, {
      I: chestI(liw) * (1 + 0.55 * swell) * (0.94 + 0.06 * breath),
      r: 0.72 + 0.25 * liw + 0.3 * swell, t, seed: 3, flicker: 0.18,
    });

    // breath rings while it holds still ("‘di naman kailangang magbago agad")
    for (let b = Math.ceil(A.barAt(this.mag.start)); b <= Math.floor(A.barAt(this.dahan.start)); b++) {
      const age = (t - A.timeOfBar(b)) / 3.2;
      if (age <= 0 || age >= 1) continue;
      c.strokeStyle = rgba('sea', 0.4 * (1 - age) * Math.min(1, age * 6));
      c.lineWidth = 1;
      c.beginPath();
      c.arc(me.chest.x, me.chest.y, 16 + 120 * ease.outCubic(age), 0, TAU);
      c.stroke();
    }

    // field notes on the self
    const ako = prog(t, this.ctx.start, this.ctx.start + 0.01);
    callout(c, me.head.x + 14, me.head.y - 10, me.head.x + 90, me.head.y - 70, 'AKO', { p: ako, color: 'paper', alpha: 0.75 });
    const lkP = prog(t, lk.start, lk.start + 1.1, ease.outCubic) * (1 - prog(t, this.paabante.start - 0.6, this.paabante.start));
    callout(c, me.chest.x + 10, me.chest.y + 2, me.chest.x + 118, me.chest.y + 34, 'LAKAS-LOOB', { p: lkP, color: 'paper', alpha: 0.7 * clamp(lkP * 3) });

    // ---- lyrics: same place as in GILID; the echo answers underneath ----------------
    lyricStack(c, this.lines, t, { x: LX, y: LY, font: LFONT, lh: 74, keep: 1, maxW: 1200, glow: g, style: { glowAmt: 0.35, hotAmt: 0.35 } });
    if (this.echo) {
      const e = this.echo;
      const ex = LX + (lineLayout(this.dahan, LFONT).words[2]?.x ?? 0);
      const ey = LY + 62;
      const ea = 0.7 * lineAlpha(e, t, 0.4, 99, 0.5, 0.4);
      if (ea > 0.003) {
        const r = drawLine(c, e, t, ex, ey, { font: EFONT, color: 'paper', dim: 0.25, hot: 'glow', hotAmt: 0.25, alpha: ea, glow: g, glowAmt: 0.18 });
        applyFont(c, EFONT);
        c.fillStyle = rgba('ash', ea * 0.7);
        c.fillText('(', ex - layout('(', EFONT).w - 4, ey);
        // the closing bracket waits for the last word, so it never hangs off empty space
        const last = e.words[e.words.length - 1];
        c.globalAlpha = prog(t, last.start - 0.4, last.start);
        c.fillText(')', ex + r.w + 4, ey);
        c.globalAlpha = 1;
      }
    }

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });
    return {
      vignette: 0.4,
      zoom: 1 + 0.028 * prog(t, this.cut, this.next, ease.inOutSine) + 0.004 * Math.sin((t - this.cut) * TAU * 0.05),
    };
  }

  /** "LAYO · 4 HAKBANG", then the 4 struck through and a pencilled 3 inserted */
  private distanceLabel(c: CanvasRenderingContext2D, t: number, xm: number) {
    const pre = 'LAYO  ·  ', post = ' HAKBANG';
    const strike = prog(t, this.land + 0.1, this.land + 0.4, ease.inOutCubic);
    const fixP = prog(t, this.land + 0.35, this.land + 0.8, ease.outCubic);
    const Lp = layout(pre, NOTE), L4 = layout('4', NOTE), Lq = layout(post, NOTE);
    const w3 = layout('3', FIX).w;
    const ins = (w3 + 12) * fixP;
    const w = Lp.w + L4.w + ins + Lq.w;
    const x = xm - w / 2, y = DY + 26;
    const col = rgba('ash', 0.8);
    text(c, pre, x, y, NOTE, col);
    text(c, '4', x + Lp.w, y, NOTE, col);
    text(c, post, x + Lp.w + L4.w + ins, y, NOTE, col);
    if (strike > 0) {
      // a pencil strike through the middle, overshooting the glyph so it reads as a strike
      // (same weight and tone as the digit, so the 4 still reads under it)
      const sx = x + Lp.w - 3;
      hairline(c, sx, y - 4.5, sx + (L4.w + 6) * strike, y - 4.5, rgba('ash', 0.8), 0.9);
    }
    if (fixP > 0) {
      c.save();
      c.globalAlpha = fixP;
      c.translate(x + Lp.w + L4.w + 7, y + 1 - (1 - fixP) * 5);
      c.rotate(-0.06);
      text(c, '3', 0, 0, FIX, rgba('paper', 0.92));
      c.restore();
    }
  }
}
