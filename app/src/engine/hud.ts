// The field-notes HUD: plate label (top-left), LAKAS / LIWANAG meters (bottom-left),
// timecode + bar counter (bottom-right). LAKAS (loudness of the voice) never gets far;
// LIWANAG (the firefly's light) climbs across the song to 1.00.

import type { AudioData } from './audio';
import { FPS, H, HUD_BOX, MARGIN, W } from './config';
import { mono } from './fonts';
import { text, typed } from './karaoke';
import { Layer2D } from './layer';
import { rgba } from './palette';
import type { ResolvedPost } from './post';
import type { Entry } from './scene';
import { clamp } from './util';

const X = 56;
const TOP = 58;
const BOT = H - 52;
const TICKS = 24;

export class HUD {
  L = new Layer2D();
  guides = false;
  constructor(
    private audio: AudioData,
    private liwanag: (t: number) => number,
  ) {}

  /** perceived loudness of the voice, 0..1, smoothed over ~0.25 s */
  lakas(t: number) {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.audio.env('vocals', t - i * 0.04);
    return clamp(s / 6);
  }

  draw(t: number, post: ResolvedPost, cur: Entry | undefined): Layer2D | null {
    const op = clamp(post.hud);
    if (op <= 0.003 && !this.guides) return null;
    const c = this.L.begin();
    const ink = post.hudInk;
    const hi = ink ? 'pencil' : 'paper';
    const lo = ink ? 'pencil' : 'ash';
    const off = ink ? 'ash' : 'graphite';
    c.globalAlpha = op;

    // -- top-left: title + plate label ------------------------------------
    text(c, 'TAHIMIK PERO AKO ’TO  ·  MGA TALA', X, TOP, mono(11, 400, false, 2.2), rgba(lo, ink ? 0.55 : 0.5));
    if (cur) {
      const cut = cur.start + cur.xf / 2;
      const n = (t - cut) * 38;
      const [num, ...rest] = cur.label.split(' · ');
      const f = mono(15, 500, false, 1.2);
      c.globalAlpha = op;
      const w = typed(c, `TALA ${num}`, n, X, TOP + 26, f, rgba(hi, 0.9));
      typed(c, `  ·  ${rest.join(' · ')}`, n - 8, X + w, TOP + 26, mono(15, 400, false, 1.2), rgba(lo, 0.75), op);
      c.globalAlpha = op;
      c.fillStyle = rgba(off, 0.8);
      c.fillRect(X, TOP + 40, Math.min(1, Math.max(0, n / 20)) * 260, 1);
    }

    // -- bottom-left: meters ------------------------------------------------
    const lk = this.lakas(t);
    const lw = clamp(post.liwanag ?? this.liwanag(t));
    const db = -60 + 34 * Math.sqrt(lk);
    this.meter(c, 'LAKAS', lk * 0.42, `${db.toFixed(0).replace('-', '−')} dB`, BOT - 26, ink ? 'pencil' : 'paper', off, lo, op);
    this.meter(c, 'LIWANAG', lw, lw.toFixed(2), BOT, 'glow', off, lo, op);

    // -- bottom-right: timecode + bar counter --------------------------------
    const fr = Math.floor(t * FPS + 1e-6);
    const ss = Math.floor(fr / FPS);
    const tc = `${String(Math.floor(ss / 60)).padStart(2, '0')}:${String(ss % 60).padStart(2, '0')}:${String(fr % FPS).padStart(2, '0')}`;
    c.globalAlpha = op;
    text(c, tc, W - X, BOT, mono(13, 400, false, 1.5), rgba(lo, 0.7), 'right');
    const bar = this.audio.barAt(t);
    const bb = bar < 0 ? '—' : `${String(Math.floor(bar) + 1).padStart(3, '0')}.${Math.floor((bar % 1) * 4) + 1}`;
    text(c, `SUKAT ${bb}`, W - X, BOT - 26, mono(11, 400, false, 2), rgba(lo, 0.45), 'right');

    c.globalAlpha = 1;
    if (this.guides) this.drawGuides(c);
    return this.L;
  }

  private meter(
    c: CanvasRenderingContext2D, label: string, v: number, val: string, y: number,
    on: string, off: string, lo: string, op: number,
  ) {
    c.globalAlpha = op;
    text(c, label, X, y, mono(11, 400, false, 2.2), rgba(lo, 0.65));
    const x0 = X + 104, tw = 5, gap = 3, th = 11;
    const lit = v * TICKS;
    for (let i = 0; i < TICKS; i++) {
      const f = clamp(lit - i);
      c.fillStyle = rgba(off, 0.55);
      c.fillRect(x0 + i * (tw + gap), y - th + 1, tw, th);
      if (f > 0) {
        c.fillStyle = rgba(on, 0.92 * f);
        c.fillRect(x0 + i * (tw + gap), y - th + 1, tw, th);
      }
    }
    text(c, val, x0 + TICKS * (tw + gap) + 10, y, mono(11, 400, false, 1), rgba(lo, 0.75));
  }

  private drawGuides(c: CanvasRenderingContext2D) {
    c.strokeStyle = 'rgba(255,80,80,.55)';
    c.lineWidth = 1;
    c.strokeRect(MARGIN, MARGIN, W - 2 * MARGIN, H - 2 * MARGIN);
    const b = HUD_BOX;
    c.strokeStyle = 'rgba(80,200,255,.55)';
    c.strokeRect(0, 0, b.topLeft.w, b.topLeft.h);
    c.strokeRect(0, H - b.bottomLeft.h, b.bottomLeft.w, b.bottomLeft.h);
    c.strokeRect(W - b.bottomRight.w, H - b.bottomRight.h, b.bottomRight.w, b.bottomRight.h);
    c.strokeStyle = 'rgba(255,255,255,.18)';
    for (const f of [1 / 3, 2 / 3]) {
      c.beginPath();
      c.moveTo(W * f, 0);
      c.lineTo(W * f, H);
      c.moveTo(0, H * f);
      c.lineTo(W, H * f);
      c.stroke();
    }
  }
}
