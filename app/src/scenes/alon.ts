// TALA 02 · ALON — "Tawa nila parang alon / Ako ’yung bato sa tabing-baybayin".
// The gilid layout, re-read as a cross-section: the ground between me and them becomes
// a sea basin. Their laughter rolls towards me as swells (one per beat, swelling with
// the voice and the drums; little Archivo "haha" marks riding the crests). On "bato"
// the self settles into a stone at the water's edge; the waves break on it, it stays.

import { MARGIN, W } from '../engine/config';
import { layout, mono, sans, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { typed } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { mix, rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, hash, lerp, noise1, prog, smoothstep, TAU } from '../engine/util';
import { callout, chestI, firefly, GROUND, hairline, idle, lyricStack, nightBg, SELF, talk, type Placed } from './_motifs';

// same group as gilid, so the cut reads as one continuous place
const GROUP: Placed[] = [
  { x: 1040, y: GROUND, s: 0.92, seed: 11 },
  { x: 1150, y: GROUND, s: 1.02, seed: 23 },
  { x: 1262, y: GROUND, s: 0.97, seed: 37 },
  { x: 1370, y: GROUND, s: 1.06, seed: 41 },
  { x: 1478, y: GROUND, s: 0.9, seed: 53 },
  { x: 1580, y: GROUND, s: 1.0, seed: 67 },
];

/** the sea: from the stone's foot to the far shore where they stand */
const SEA0 = SELF.x + 62;
const SEA1 = 990;
const BED = GROUND + 66;
const HAHA = ['haha', 'HAHA', 'hahaha', 'ha ha', 'HA', 'hahah'];

interface Swell {
  t0: number;
  /** break time: two beats after launch */
  tb: number;
  amp: number;
  seed: number;
  haha: boolean;
}

type P2 = { x: number; y: number };

export default class Alon extends Scene {
  lines = this.lyrics.between(this.ctx.start, this.ctx.end - 0.5).filter((l) => l.start > this.ctx.start - 1);
  tawa = Lyrics.word(this.lyrics.find('Tawa nila'), 'Tawa');
  alon = Lyrics.word(this.lyrics.find('Tawa nila'), 'alon');
  bato = Lyrics.word(this.lyrics.find('bato sa tabing'), 'bato');
  swells = this.buildSwells();

  /** one swell per beat (plus off-beats once the drums come in); the key words get big ones */
  private buildSwells(): Swell[] {
    const A = this.audio;
    const out: Swell[] = [];
    const k0 = Math.floor(A.beatAt(this.ctx.start - 2)), k1 = Math.ceil(A.beatAt(this.ctx.end));
    const batoBreak = this.bato.start + 0.45;
    const push = (kb: number) => {
      const t0 = A.timeOfBeat(kb);
      const tb = A.timeOfBeat(kb + 2);
      const env = (A.env('rms', t0) + A.env('rms', t0 + 0.1)) / 2;
      const drums = A.env('drums', t0);
      const gate = lerp(0.3, 1, smoothstep(this.tawa.start - 0.4, this.alon.start, t0));
      let amp = (18 + 30 * env + 34 * drums) * gate;
      if (Math.abs(t0 - this.tawa.start) < 0.36) amp += 22;
      if (Math.abs(t0 - this.alon.start) < 0.36) amp += 34;
      if (Math.abs(tb - batoBreak) < 0.34) amp += 40;
      if (kb % 1 !== 0) amp *= 0.55;
      out.push({ t0, tb, amp, seed: Math.round(kb * 2) + 101, haha: t0 > this.tawa.start - 0.3 && hash(kb * 2, 7) < 0.85 });
    };
    for (let k = k0; k <= k1; k++) {
      push(k);
      if (A.env('drums', A.timeOfBeat(k + 0.5)) > 0.45) push(k + 0.5);
    }
    return out;
  }

  /** where swell s is and how tall at t (null before launch / after it has spent itself) */
  private swellAt(s: Swell, t: number) {
    const u = (t - s.t0) / (s.tb - s.t0);
    if (u < 0 || t > s.tb + 1.2) return null;
    if (u < 1) {
      const k = 1 - Math.pow(1 - u, 1.25);
      return {
        x: lerp(SEA1 - 10, SEA0, k),
        a: s.amp * (0.4 + 0.6 * Math.pow(u, 1.6)) * smoothstep(0, 0.18, u),
        w: lerp(120, 64, u),
        front: lerp(0.75, 0.3, u),
        u,
      };
    }
    const tau = t - s.tb;
    return { x: SEA0 - 30 * tau, a: s.amp * Math.exp(-tau / 0.14), w: 64, front: 0.3, u };
  }

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const cut = this.params.cut as number;
    const liw = this.liwanag(t);

    nightBg(out, { t, grid: 0.3, fog: 0.4, warm: [SELF.x, SELF.y - 70, chestI(liw) * 0.5] });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // --- the sea ------------------------------------------------------------
    const live = this.swells.map((s) => ({ s, st: this.swellAt(s, t) })).filter((o) => o.st);
    const next = this.params.next as number;
    const settle = 1 - 0.5 * prog(t, next - 0.6, next + 0.4, ease.inOutSine);
    const calm = (0.35 + 0.65 * prog(t, cut - 0.3, this.tawa.start + 0.4, ease.inOutSine)) * settle;
    const chop = 1 + 0.35 * A.hit('snare', t, 0.14);
    const bass = A.env('bass', t);
    const disp = (x: number) => {
      let d = 0;
      for (const { st } of live) {
        const q = (x - st!.x) / st!.w;
        d += st!.a * Math.exp(-((q / (q < 0 ? st!.front : 1.5)) ** 2));
      }
      const edge = smoothstep(SEA0 - 20, SEA0 + 60, x) * smoothstep(SEA1 + 10, SEA1 - 60, x);
      const rip = (1.4 * Math.sin(x * 0.047 - t * 2.3) + 0.9 * Math.sin(x * 0.093 + t * 1.6 + 1)) * (0.6 + 0.8 * bass);
      return (d * chop * settle + rip * calm) * edge;
    };

    // ground either side of the water (the gilid ground line, continued)
    hairline(c, MARGIN, GROUND + 1, SELF.x + 40, GROUND + 1, rgba('graphite', 0.7));
    hairline(c, SEA1, GROUND + 1, W - MARGIN, GROUND + 1, rgba('graphite', 0.7));

    // the basin: seabed curve + earth hatching (cross-section convention)
    const bedP = prog(t, this.ctx.start, cut + 1.2, ease.inOutCubic);
    const bedY = (x: number) =>
      GROUND + 1 + (BED - GROUND) * smoothstep(SELF.x + 40, SEA0 + 150, x) * smoothstep(SEA1 + 10, SEA1 - 150, x);
    c.strokeStyle = rgba('graphite', 0.5 * bedP);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = SELF.x + 40; x <= SEA1; x += 8) (x === SELF.x + 40 ? c.moveTo(x, bedY(x)) : c.lineTo(x, bedY(x)));
    c.stroke();
    c.strokeStyle = rgba('slate', 0.9 * bedP);
    c.beginPath();
    for (let x = SELF.x + 56; x < SEA1 - 10; x += 14) {
      const y = bedY(x);
      c.moveTo(x, y + 4);
      c.lineTo(x - 8, y + 12);
    }
    c.stroke();

    // surface + depth lines, colour arriving from the gilid graphite
    const seaCol = (a: number) => mix('graphite', 'sea', prog(t, cut - 0.3, cut + 0.8), a);
    for (let k = 4; k >= 0; k--) {
      const x0 = k === 0 ? SELF.x + 10 : SEA0 + 22 * k, x1 = SEA1 - 22 * k;
      const att = Math.pow(0.5, k), lag = 14 * k;
      c.strokeStyle = seaCol((k === 0 ? 0.9 : 0.5 * Math.pow(0.72, k)) * (k === 0 ? 1 : bedP));
      c.lineWidth = k === 0 ? 1.4 : 1;
      c.beginPath();
      for (let x = x0; x <= x1; x += 4) {
        const y = GROUND + 1 + 11 * k - disp(x + lag) * att;
        if (x === x0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    // --- them: laughing on the far shore ------------------------------------
    const laugh = clamp(
      0.25 + 0.75 * smoothstep(this.tawa.start - 0.2, this.tawa.start + 0.2, t) * (1 - 0.45 * smoothstep(this.alon.end, this.alon.end + 1.5, t)) +
        0.4 * A.env('drums', t),
    );
    const pulse = A.beatPulse(t, 0.14);
    const heads: P2[] = [];
    GROUP.forEach((p, i) => {
      const id = idle(p, t, 1);
      const h = 172 * p.s;
      const shake = Math.sin(t * 17 + i * 2.3) * 1.6 * laugh * (0.5 + 0.5 * Math.sin(t * 3.1 + i));
      const bob = -pulse * 5 * (0.5 + 0.5 * Math.sin(i * 2.1)) + shake;
      const back = -laugh * 0.05 * (i < 3 ? -1 : 1) * (0.6 + 0.4 * pulse);
      const pr = this.person(c, p.x + id.dx, p.y + bob, h, 'ash', 0.9 - 0.25 * prog(t, cut, this.alon.end), id.lean * 0.6 + back, id.nod - laugh * 3);
      heads.push(pr.head);
      talk(c, pr.head.x, pr.head.y, h * 0.105, t * (1 + laugh) + i, p.seed, { dir: i < 3 ? -1 : 1, alpha: 0.35 + 0.35 * laugh });
    });
    const g0 = GROUP[2];
    callout(c, g0.x + 20, GROUND - 172 * g0.s - 22, g0.x + 80, GROUND - 250, 'SILA  ·  6', { p: 1, alpha: 0.6 * (1 - prog(t, this.alon.end, this.alon.end + 1)) });

    // --- "haha" riding the crests -------------------------------------------
    for (const { s, st } of live) {
      if (!s.haha || st!.u >= 1) continue;
      const n = s.amp > 30 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const head = heads[Math.floor(hash(s.seed, 3, j) * 6)];
        const word = HAHA[Math.floor(hash(s.seed, 5, j) * HAHA.length)];
        const f = sans(Math.round(15 + s.amp * 0.2 - j * 3), 600, hash(s.seed, 9, j) < 0.5 ? 'semi-expanded' : 'normal', 0.6);
        // leaves a mouth, arcs over the water and lands riding the crest
        const t1 = s.t0 + 0.12 * j;
        const fly = prog(t, t1, t1 + 0.5, ease.inOutSine);
        const crest = { x: st!.x + 6 - 64 * j, y: GROUND - st!.a * chop - 16 - 30 * j };
        const x = lerp(head.x - 22, crest.x, fly);
        const y = lerp(head.y - 30, crest.y, fly) - Math.sin(fly * Math.PI) * 60;
        const a = smoothstep(t1, t1 + 0.12, t) * (1 - smoothstep(0.7, 0.95, st!.u)) * (0.8 - 0.25 * j);
        if (a <= 0.01) continue;
        typed(c, word, 99, x - layout(word, f).w / 2, y, f, rgba('ash'), a);
      }
    }

    // spray where each swell breaks on the stone
    for (const { s } of live) {
      const tau = t - s.tb;
      if (tau < 0 || tau > 1.1 || s.amp < 12) continue;
      const n = Math.round(4 + s.amp * 0.3);
      c.fillStyle = rgba('sea', 1);
      for (let j = 0; j < n; j++) {
        const h1 = hash(s.seed, j, 1), h2 = hash(s.seed, j, 2);
        const ang = -Math.PI / 2 + (h1 - 0.62) * 1.9;
        const v = (140 + 260 * h2) * Math.sqrt(s.amp / 40);
        const x = SEA0 - 8 + Math.cos(ang) * v * tau;
        const y = GROUND - s.amp * 0.5 + Math.sin(ang) * v * tau + 0.5 * 980 * tau * tau;
        if (y > GROUND + 2) continue;
        c.globalAlpha = 0.85 * (1 - tau / 1.1);
        c.beginPath();
        c.arc(x, y, 1.2 + 1.2 * hash(s.seed, j, 3), 0, TAU);
        c.fill();
      }
      // foam curl at the foot of the stone
      c.globalAlpha = 0.7 * Math.exp(-tau / 0.25) * clamp(s.amp / 40);
      c.strokeStyle = rgba('sea');
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(SEA0 + 4, GROUND - 6, 10 + tau * 40, Math.PI * 1.05, Math.PI * 1.7);
      c.stroke();
      c.globalAlpha = 1;
    }

    // --- the self, settling into a stone (in front of its own spray) ---------
    const m = 0.9 * prog(t, this.bato.start - 0.05, this.bato.start + 0.85, ease.inOutCubic);
    const me = this.stoneSelf(c, t, m);
    firefly(g, me.chest.x, me.chest.y, { I: chestI(liw), r: 0.7, t, seed: 3, flicker: 0.25 });

    // --- field notes -----------------------------------------------------------
    const k = (a: number) => prog(t, a, a + 1.1, ease.outCubic);
    callout(c, me.head.x + 14, me.head.y - 10, SELF.x + 90, GROUND - 212, 'AKO', { p: 1, color: 'paper', alpha: 0.75 });
    if (m > 0) {
      const F = mono(12, 400, false, 1.4);
      typed(c, '  =  BATO', (t - this.bato.start - 0.3) * 18, SELF.x + 98 + layout('AKO', F).w, GROUND - 212 + F.size * 0.35, F, rgba('paper'), 0.75);
    }
    const sx = 760;
    callout(c, sx, GROUND - disp(sx), sx - 110, GROUND - 236, 'TAWA  ·  ALON', { p: k(this.alon.start), alpha: 0.65 });

    // tally of waves that have reached me
    const hits = this.swells.filter((s) => s.tb <= t && s.tb >= cut && s.amp > 10).length;
    const lab = `ALON  ·  ${String(hits).padStart(2, '0')}`;
    const F2 = mono(12, 400, false, 2);
    typed(c, lab, 99, (SEA0 + SEA1) / 2 - layout(lab, F2).w / 2, BED + 40, F2, rgba('ash'), bedP * 0.7);

    // --- lyrics: same place as gilid ----------------------------------------------
    lyricStack(c, this.lines, t, {
      x: MARGIN + 60, y: 330, font: serif(58, 330), lh: 74, keep: 1, maxW: 1040, glow: g,
      style: {
        glowAmt: 0.35, hotAmt: 0.35,
        // "alon" keeps rolling as a little wave through its letters
        fx: (q) => {
          const onset = q.t - q.since;
          if (onset < this.alon.start - 0.05 || onset > this.alon.end || q.p <= 0) return;
          return { dy: -Math.sin(q.t * 4.2 - q.gi * 0.8) * 5 * smoothstep(0, 1, q.wp) };
        },
      },
    });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });
    return { vignette: 0.42, zoom: 1 + 0.012 * Math.sin((t - cut) * TAU * 0.03) + 0.003 * A.hit('snare', t, 0.12) };
  }

  /** pictogram person (same geometry as _motifs.person), returning chest + head */
  private person(c: CanvasRenderingContext2D, x: number, y: number, h: number, col: string, alpha: number, lean: number, nod: number) {
    const r = h * 0.105, bw = h * 0.34, top = y - h * 0.7;
    c.save();
    c.translate(x, y);
    c.rotate(lean);
    c.translate(-x, -y);
    c.globalAlpha = alpha;
    c.fillStyle = rgba(col);
    c.beginPath();
    c.moveTo(x - bw * 0.44, y);
    c.lineTo(x - bw * 0.5, top + bw * 0.5);
    c.arc(x, top + bw * 0.5, bw * 0.5, Math.PI, 0);
    c.lineTo(x + bw * 0.44, y);
    c.closePath();
    c.fill();
    const hx = x + nod * 0.4, hy = top - r - h * 0.035 + Math.abs(nod) * 0.15;
    c.beginPath();
    c.arc(hx, hy, r, 0, TAU);
    c.fill();
    c.restore();
    return { head: { x: hx + Math.sin(lean) * (y - hy), y: hy } };
  }

  /**
   * The self (identical to gilid's at m = 0) morphing towards a rounded stone at m = 1:
   * the body outline is sampled by angle and blended with an irregular stone contour,
   * the head sinks into its top.
   */
  private stoneSelf(c: CanvasRenderingContext2D, t: number, m: number) {
    const x = SELF.x, y = SELF.y, sh = 0.35;
    const hh = SELF.h * (1 - 0.08 * sh), r = hh * 0.105, bw = hh * (0.34 - 0.03 * sh);
    const top = y - hh * 0.7 + hh * 0.04 * sh;
    const nod = noise1(t * 0.3, 2) * 2 * (1 - m);
    // body polygon (tombstone)
    const poly: P2[] = [{ x: x + bw * 0.44, y }, { x: x - bw * 0.44, y }];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI;
      poly.push({ x: x + Math.cos(a) * bw * 0.5, y: top + bw * 0.5 + Math.sin(a) * bw * 0.5 });
    }
    const C = { x, y: top + hh * 0.36 };
    const Cs = { x: x + 5, y: GROUND - 42 };
    const rx = 62, ry = 46;
    const kS = (a: number) => 1 + 0.06 * Math.sin(3 * a + 0.7) + 0.04 * Math.sin(5 * a + 2.1) + 0.03 * Math.sin(2 * a);
    const pts: P2[] = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const dx = Math.cos(a), dy = Math.sin(a);
      const b = rayHit(C, dx, dy, poly);
      let sy = Cs.y + ry * kS(a) * dy;
      const sxp = Cs.x + rx * kS(a) * dx;
      if (sy > GROUND) sy = GROUND;
      pts.push({ x: lerp(b.x, sxp, m), y: lerp(Math.min(b.y, GROUND), sy, m) });
    }
    const stoneTop = Cs.y - ry * kS(-Math.PI / 2);
    const hx = lerp(x + nod * 0.4, x + 2, m);
    const hy = lerp(top - r - hh * 0.035 + Math.abs(nod) * 0.15 + sh * hh * 0.03, stoneTop + r * 0.6, m);
    const col = mix('paper', 'ash', 0.28 * m, 0.95);

    c.fillStyle = col;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(hx, hy, r * lerp(1, 0.9, m), 0, TAU);
    c.fill();

    if (m > 0.02) {
      // stone texture: a few hatch strokes on the shadow side
      c.strokeStyle = rgba('graphite', 0.55 * m);
      c.lineWidth = 1;
      c.beginPath();
      for (let j = 0; j < 6; j++) {
        const a = 0.05 + j * 0.17;
        const px = Cs.x + rx * 0.72 * Math.cos(a), py = Cs.y + ry * 0.72 * Math.sin(a) - 4;
        c.moveTo(px, py);
        c.lineTo(px + 9, py - 9);
      }
      c.stroke();
      // dashed diagram contour drawn around the new shape
      const dp = prog(t, this.bato.start + 0.3, this.bato.start + 1.3, ease.inOutCubic);
      if (dp > 0) {
        c.strokeStyle = rgba('ash', 0.7);
        c.setLineDash([4, 5]);
        c.beginPath();
        const n = Math.ceil(N * dp);
        for (let i = 0; i <= n; i++) {
          const p = pts[(i + N / 2) % N];
          const q = { x: Cs.x + (p.x - Cs.x) * 1.16, y: Math.min(GROUND - 1, Cs.y + (p.y - Cs.y) * 1.2) };
          if (i) c.lineTo(q.x, q.y);
          else c.moveTo(q.x, q.y);
        }
        c.stroke();
        c.setLineDash([]);
      }
    }
    const chest0 = { x, y: top + bw * 0.62 };
    return {
      chest: { x: lerp(chest0.x, Cs.x - 4, m), y: lerp(chest0.y, Cs.y - 2, m) },
      head: { x: hx, y: lerp(hy, stoneTop, m) },
    };
  }
}

/** nearest intersection of the ray C + s·(dx, dy), s > 0, with a closed polygon */
function rayHit(C: P2, dx: number, dy: number, poly: P2[]): P2 {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = ((a.x - C.x) * ey - (a.y - C.y) * ex) / den;
    const u = ((a.x - C.x) * dy - (a.y - C.y) * dx) / den;
    if (s > 0 && u >= 0 && u <= 1 && s < best) best = s;
  }
  if (best === Infinity) best = 0;
  return { x: C.x + dx * best, y: C.y + dy * best };
}
