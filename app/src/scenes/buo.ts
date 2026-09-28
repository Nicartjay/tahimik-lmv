// TALA 17 · BUO — "Sadyang mahiyain lang talaga ako / At kung tanggapin ko ’to nang buo".
// Six shards of earlier plates drift in as hairlines around a waiting, dashed outline:
// a photo frame (SIMULA NOON), a wave (ALON), a throat (LALAMUNAN), a folded note (BULSA),
// a stage arch (ENTABLADO) and a breath ring (SULOK). From "tanggapin", one per beat, each
// bends into its part of the self — the frame, the base, the sides, the shoulders — and
// the ring becomes the head exactly on "buo": the outline closes, fills, and the chest
// light (there all along) flares. Left third, larger and nearer centre than before.

import { applyFont, mono, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { typed } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { mix, rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { ease, lerp, noise1, prog, TAU } from '../engine/util';
import { callout, chestI, firefly, lyricStack, nightBg, person } from './_motifs';

// the assembled self (same proportions as person(), shrink 0)
const S = { x: 560, y: 880, h: 440 };
const BW = S.h * 0.34;
const TOP = S.y - S.h * 0.7;
const ARC_Y = TOP + BW * 0.5;
const HEAD_R = S.h * 0.105;
const HEAD_Y = TOP - HEAD_R - S.h * 0.035;
const CHEST = { x: S.x, y: TOP + BW * 0.62 };
const FRAME = { x: S.x, y: 668, w: 360, h: 500 };

const LBL = mono(11, 400, false, 2.2);

type Kind = 'photo' | 'wave' | 'throat' | 'note' | 'arch' | 'ring';
interface Pose { x: number; y: number; rot: number; a: number; b: number }
interface Shard { kind: Kind; label: string; home: Pose; end: Pose; seed: number }

/** a straight side of the body as a pose: centre, angle, length (a), zero bend (b) */
function side(x0: number, y0: number, x1: number, y1: number): Pose {
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rot: Math.atan2(y1 - y0, x1 - x0), a: Math.hypot(x1 - x0, y1 - y0), b: 0 };
}

// assembly order = arrival order, one per beat; the ring (head) closes it on "buo".
// a/b are per-kind shape params: rect w/h, wave length/amplitude, throat length/bend, radii.
const SHARDS: Shard[] = [
  { kind: 'photo', label: 'SIMULA NOON', seed: 3, home: { x: 250, y: 300, rot: -0.14, a: 128, b: 96 }, end: { x: FRAME.x, y: FRAME.y, rot: 0, a: FRAME.w, b: FRAME.h } },
  { kind: 'wave', label: 'ALON', seed: 7, home: { x: 245, y: 850, rot: 0.05, a: 210, b: 12 }, end: side(S.x - BW * 0.44, S.y, S.x + BW * 0.44, S.y) },
  { kind: 'throat', label: 'LALAMUNAN', seed: 11, home: { x: 190, y: 660, rot: Math.PI / 2 + 0.18, a: 170, b: 1 }, end: side(S.x - BW * 0.5, ARC_Y, S.x - BW * 0.44, S.y) },
  { kind: 'note', label: 'BULSA', seed: 17, home: { x: 890, y: 770, rot: 0.32, a: 96, b: 62 }, end: side(S.x + BW * 0.5, ARC_Y, S.x + BW * 0.44, S.y) },
  { kind: 'arch', label: 'ENTABLADO', seed: 23, home: { x: 740, y: 250, rot: 0.08, a: 64, b: 0 }, end: { x: S.x, y: ARC_Y, rot: 0, a: BW * 0.5, b: 0 } },
  { kind: 'ring', label: 'SULOK', seed: 29, home: { x: 850, y: 560, rot: 0, a: 38, b: 0 }, end: { x: S.x, y: HEAD_Y, rot: 0, a: HEAD_R, b: 0 } },
];

/** draw one shard in local coords; `x` (0..1) fades the loose-only details out */
function drawShard(c: CanvasRenderingContext2D, k: Kind, a: number, b: number, x: number) {
  c.beginPath();
  if (k === 'photo' || k === 'note') c.rect(-a / 2, -b / 2, a, b);
  else if (k === 'wave' || k === 'throat') {
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const u = i / n, px = (u - 0.5) * a;
      const py = k === 'wave'
        ? b * Math.sin(u * TAU * 2.5) * Math.sin(u * Math.PI)
        : b * (12 * Math.sin(u * TAU) + 9 * Math.exp(-(((u - 0.56) / 0.07) ** 2)));
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
  } else if (k === 'arch') c.arc(0, 0, a, Math.PI, 0);
  else c.arc(0, 0, a, 0, TAU);
  c.stroke();
  if (x <= 0.01) return;
  // loose-only details
  c.save();
  c.globalAlpha *= x;
  c.lineWidth = 1;
  c.beginPath();
  if (k === 'photo') {
    c.rect(-a / 2 + 7, -b / 2 + 7, a - 14, b - 26);
    c.moveTo(-a / 2 + 9, b / 2 - 9);
    c.lineTo(-a / 2 + 44, b / 2 - 9);
  } else if (k === 'note') {
    // folded corner + crease
    c.moveTo(a / 2 - 16, -b / 2);
    c.lineTo(a / 2 - 16, -b / 2 + 16);
    c.lineTo(a / 2, -b / 2 + 16);
    c.moveTo(-a / 2, b * 0.1);
    c.lineTo(a / 2, -b * 0.05);
  } else if (k === 'throat') {
    // the other wall of the throat
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const u = i / n, px = (u - 0.5) * a;
      const py = 26 + b * 9 * Math.sin(u * TAU + 0.6);
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
  } else if (k === 'arch') {
    for (const u of [-0.62, 0, 0.62]) {
      c.moveTo(u * a, -Math.sqrt(1 - u * u) * a + 4);
      c.lineTo(u * a, a * 0.7);
    }
    c.moveTo(-a * 1.15, a * 0.7);
    c.lineTo(a * 1.15, a * 0.7);
  } else if (k === 'ring') {
    c.arc(0, 0, a * 1.5, 0, TAU);
    c.moveTo(a * 2.05, 0);
    c.arc(0, 0, a * 2.05, 0, TAU);
  } else if (k === 'wave') {
    c.moveTo(-a / 2, b + 10);
    c.lineTo(a / 2, b + 10);
  }
  c.stroke();
  c.restore();
}

export default class Buo extends Scene {
  private cut = this.params.cut as number;
  private next = this.params.next as number;
  private line2 = this.lyrics.find('tanggapin ko');
  private tang = Lyrics.word(this.line2, 'tanggapin');
  private buo = Lyrics.word(this.line2, 'buo');
  private lines = this.lyrics
    .between(this.ctx.start, this.ctx.end)
    .filter((l) => l.start > this.ctx.start - 1 && l.start < this.next - 0.1);
  // arrivals: one per beat, the last one on "buo"
  private kBuo = Math.round(this.audio.beatAt(this.buo.start));
  private arrive = SHARDS.map((_, i) => this.audio.timeOfBeat(this.kBuo - (SHARDS.length - 1) + i));
  private kLbl = Math.ceil(this.audio.beatAt(this.cut));

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const liw = this.liwanag(t);
    const bt = this.buo.start;
    const closed = prog(t, bt - 0.05, bt + 0.6, ease.outCubic);
    const flare = t >= bt ? Math.exp(-(t - bt) / 0.7) : 0;
    const I = chestI(liw) * (1 + 1.1 * flare);

    nightBg(out, { t, grid: 0.28, fog: 0.4, warm: [CHEST.x, CHEST.y, I * (0.6 + 0.3 * closed)] });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // the waiting outline, dashed; gone once it is whole
    c.save();
    c.setLineDash([3, 7]);
    person(c, S.x, S.y, S.h, { color: 'graphite', alpha: 0.75 * (1 - closed), outline: 1 });
    c.restore();

    // the filled self, on "buo"
    if (closed > 0) person(c, S.x, S.y, S.h, { color: 'paper', alpha: 0.93 * closed });

    // shards: drift in during line 1, bend into place one per beat from "tanggapin"
    const drift = prog(t, this.ctx.start - 2, this.tang.start, ease.outCubic);
    const pulse = A.beatPulse(t, 0.2);
    let placed = 0;
    SHARDS.forEach((s, i) => {
      const ta = this.arrive[i];
      const e = prog(t, ta - 1.35, ta, ease.inOutCubic);
      if (t >= ta) placed++;
      const h = s.home;
      const dx = h.x - S.x, dy = h.y - FRAME.y, dl = Math.hypot(dx, dy) || 1;
      const out0 = 170 * (1 - drift);
      const lx = h.x + (dx / dl) * out0 + noise1(t * 0.13, s.seed) * 18;
      const ly = h.y + (dy / dl) * out0 + noise1(t * 0.11, s.seed + 7) * 14 - pulse * 3;
      const lr = h.rot + noise1(t * 0.09, s.seed + 3) * 0.12;
      // swing slightly off the straight path while travelling
      const sw = Math.sin(e * Math.PI) * 36;
      const px = lerp(lx, s.end.x, e) - (s.end.y - ly) / dl * sw * 0.3;
      const py = lerp(ly, s.end.y, e) + (s.end.x - lx) / dl * sw * 0.3;
      const hit = t >= ta ? Math.exp(-(t - ta) / 0.22) : 0;

      c.save();
      c.translate(px, py);
      c.rotate(lerp(lr, s.end.rot, e));
      // the frame settles quieter (ash, thin) than the body it holds
      const frame = s.kind === 'photo';
      c.strokeStyle = s.kind === 'wave' ? mix('sea', 'paper', e, 0.85) : frame ? mix('paper', 'ash', e, lerp(0.72, 0.6, e)) : rgba('paper', lerp(0.72, 0.9, e));
      c.lineWidth = lerp(1.3, frame ? 1.1 : 2, e) + (frame ? 0.8 : 1.6) * hit;
      c.lineJoin = 'round';
      drawShard(c, s.kind, lerp(h.a, s.end.a, e), lerp(h.b, s.end.b, e), 1 - prog(e, 0, 0.45));
      c.restore();

      // label, typed on the beats after the cut; leaves as the shard sets off
      const t0 = A.timeOfBeat(this.kLbl + i);
      const la = 1 - prog(e, 0, 0.25);
      if (la > 0) {
        const lyOff = s.kind === 'wave' ? -26 : s.kind === 'ring' ? -h.a * 2.05 - 14 : s.kind === 'throat' ? -h.a / 2 - 18 : -h.b / 2 - (s.kind === 'arch' ? h.a : 0) - (s.kind === 'note' ? 30 : 16);
        typed(c, s.label, (t - t0) * 24, lx - 40, ly + lyOff, LBL, rgba('ash', 0.8), la);
      }
    });

    // the photo frame, once landed, gets registration corners and a caption
    const fr = prog(t, this.arrive[0], this.arrive[0] + 0.5, ease.outCubic);
    if (fr > 0) {
      c.strokeStyle = rgba('ash', 0.7 * fr);
      c.lineWidth = 1;
      const x0 = FRAME.x - FRAME.w / 2 - 12, x1 = FRAME.x + FRAME.w / 2 + 12;
      const y0 = FRAME.y - FRAME.h / 2 - 12, y1 = FRAME.y + FRAME.h / 2 + 12;
      c.beginPath();
      for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        c.moveTo(x, y + sy * 14);
        c.lineTo(x, y);
        c.lineTo(x + sx * 14, y);
      }
      c.stroke();
      const count = placed >= SHARDS.length ? 'PIRASO  ·  6 / 6' : `PIRASO  ·  ${placed} / 6`;
      c.globalAlpha = fr;
      applyFont(c, LBL);
      c.fillStyle = rgba(placed >= SHARDS.length ? 'paper' : 'ash', 0.8);
      c.textAlign = 'right';
      c.fillText(count, x1, y1 + 26);
      c.textAlign = 'left';
      c.globalAlpha = 1;
    }

    // a ring leaves the chest when it closes
    if (t > bt && t < bt + 2) {
      const u = (t - bt) / 2;
      c.strokeStyle = rgba('paper', 0.45 * (1 - u));
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(CHEST.x, CHEST.y, 30 + 230 * ease.outCubic(u), 0, TAU);
      c.stroke();
    }
    callout(c, S.x + BW * 0.36, ARC_Y - BW * 0.34, S.x + 262, ARC_Y - 168, 'BUO', {
      p: prog(t, bt + 0.15, bt + 1.1, ease.outCubic), color: 'paper', alpha: 0.85, font: mono(14, 500, false, 3),
    });

    // the light was there all along
    firefly(g, CHEST.x, CHEST.y, { I, r: 0.85 + 0.45 * closed + 0.9 * flare, t, seed: 3, flicker: 0.2 * (1 - closed) + 0.06 });

    // lyrics: right of the figure, mid-height — still off-centre
    lyricStack(c, this.lines, t, {
      x: 1060, y: 640, font: serif(54, 330), lh: 70, keep: 1, maxW: 640, glow: g,
      style: { glowAmt: 0.35, hotAmt: 0.35 },
    });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.3 }] });
    return {
      vignette: 0.42,
      bloom: 0.55 + 0.15 * flare,
      zoom: 1 + 0.02 * prog(t, this.cut, this.next, ease.inOutSine) + 0.004 * Math.sin((t - this.cut) * TAU * 0.07),
    };
  }
}
