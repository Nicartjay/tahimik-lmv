// TALA · SARILING MUNDO — "Pero kahit ’di ako sumisigaw / May sarili rin akong mundo".
// The self stands at the left margin; a shout meter beside it reads 0. On "May sarili
// rin akong mundo" the camera pushes in on the chest and a detail lens (A) opens out
// of the firefly: an inner night with pencil-line hills, a tiny self hugging its knees,
// and a sky of fireflies that light on the grid as LIWANAG rises. Outside is graph
// paper; inside there is no grid. v2: a larger world with a house and a book, and the
// fireflies join into a constellation of the self.

import { H, MARGIN, W } from '../engine/config';
import { applyFont, mono, serif } from '../engine/fonts';
import { Pass, type RT } from '../engine/gl';
import { lineLayout, typed } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, lerp, noise1, prog, TAU } from '../engine/util';
import { callout, chestI, firefly, GROUND, hairline, lyricStack, person, SELF } from './_motifs';

// ---------------------------------------------------------------------------
// ground: night + grid under a camera (zoom about a world point), with the lens
// interior (ungridded inner sky + stars) cut into it

const GROUND_SH = /* glsl */ `
uniform float uT, uGrid, uDim, uR;
uniform vec3 uCam;   // world point shown at uP (x, y), zoom
uniform vec2 uP;
uniform vec3 uLens;  // lens centre, radius (screen px)
uniform vec3 uWarm;
void main() {
  vec2 p = fragPx();
  vec2 uv = p / vec2(${W}., ${H}.);
  vec3 c = mix(C_INK, C_INK2, smoothstep(0., 1., uv.y));
  float n = fbm(p * .0014 + vec2(uT * .012, uT * .004));
  c *= 1. + (n - .5) * .4;
  vec2 q = (p - uP) / uCam.z + uCam.xy;
  vec2 g = abs(fract(q / 48. + .5) - .5) * 48. * uCam.z;
  vec2 G = abs(fract(q / 240. + .5) - .5) * 240. * uCam.z;
  c = mix(c, C_SLATE, (pxLine(min(g.x, g.y), 1.) * .28 + pxLine(min(G.x, G.y), 1.) * .55) * uGrid);
  c += C_EMBER * uWarm.z * .05 * exp(-length(p - uWarm.xy) / 320.);
  c *= 1. - uDim;
  float m = uLens.z > .5 ? pxFill(length(p - uLens.xy) - uLens.z) : 0.;
  if (m > 0.) {
    float s = max(uLens.z / uR, 1e-3);
    vec2 l = (p - uLens.xy) / s;
    float y = l.y / uR;
    vec3 sky = mix(vec3(.0042, .0056, .0095), vec3(.017, .022, .034), smoothstep(-1., .3, y));
    sky *= .8 + .4 * fbm(l * .0035 + vec2(uT * .008, 0.));
    vec2 cell = floor(l / 23.);
    vec2 f = fract(l / 23.) - .5;
    float st = hash12(cell + 7.1);
    float d = length(f - (hash22(cell) - .5) * .7) * 23. * s;
    float tw = .65 + .35 * sin(uT * (.8 + st * 2.3) + st * 40.);
    sky += C_PAPER * step(.84, st) * (1. - smoothstep(.2, 1.3, d)) * .16 * tw * smoothstep(.25, -.5, y);
    c = mix(c, sky, m);
  }
  fragColor = vec4(c, 1.);
}`;
let groundPass: Pass | null = null;

// ---------------------------------------------------------------------------
// geometry helpers

/** the self's chest point for person(SELF…, shrink) — mirrors person()'s proportions */
function chestOf(x: number, y: number, h: number, sh: number) {
  const hh = h * (1 - 0.08 * sh);
  const bw = hh * (0.34 - 0.03 * sh);
  const top = y - hh * 0.7 + hh * 0.04 * sh;
  return { x, y: top + bw * 0.62 };
}

/** the two external tangent segments between circles a and b */
function tangents(ax: number, ay: number, ar: number, bx: number, by: number, br: number): number[][] {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d <= Math.abs(br - ar) + 1) return [];
  const th = Math.atan2(dy, dx), al = Math.acos((ar - br) / d);
  return [1, -1].map((sg) => {
    const a = th + sg * al;
    return [ax + ar * Math.cos(a), ay + ar * Math.sin(a), bx + br * Math.cos(a), by + br * Math.sin(a)];
  });
}

/** ridge line k (0 far … 2 near) of the inner hills, lens-local px, y down */
function ridge(k: number, x: number, R: number, drift: number) {
  const base = [0.04, 0.26, 0.46][k] * R;
  const amp = [0.085, 0.065, 0.05][k] * R;
  const u = (x + drift) / R;
  const sd = 3.1 + k * 1.7;
  return base - amp * (Math.sin(u * (2.1 + k * 0.9) + sd) * 0.55 + Math.sin(u * (4.7 - k) + sd * 2.3) * 0.2 + noise1(u * 1.6 + 4, k + 20) * 0.45);
}

const RIDGE_FILL = ['#141922', '#10131A', '#0B0D12'];

/** a small seated self, knees up, head tilted towards the sky; (x, y) = ground under the seat */
function sitting(c: CanvasRenderingContext2D, x: number, y: number, h: number, alpha: number, look: number) {
  const r = h * 0.12, bw = h * 0.3;
  const hip = y - h * 0.05;
  const top = hip - h * 0.46;
  c.fillStyle = rgba('paper', alpha);
  c.strokeStyle = rgba('paper', alpha);
  c.beginPath();
  c.moveTo(x - bw * 0.45, hip);
  c.lineTo(x - bw * 0.5, top + bw * 0.5);
  c.arc(x, top + bw * 0.5, bw * 0.5, Math.PI, 0);
  c.lineTo(x + bw * 0.45, hip);
  c.closePath();
  c.fill();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = bw * 0.52;
  c.beginPath();
  c.moveTo(x + bw * 0.1, hip - bw * 0.22);
  c.lineTo(x + h * 0.27, hip - h * 0.17);
  c.lineTo(x + h * 0.31, y - bw * 0.2);
  c.stroke();
  c.beginPath();
  c.arc(x + look * h * 0.035, top - r - h * 0.035 - look * h * 0.01, r, 0, TAU);
  c.fill();
  return { chest: { x, y: top + bw * 0.72 } };
}

// ---------------------------------------------------------------------------
// the inner sky

interface Star {
  x: number;
  y: number;
  seed: number;
  /** ignition order */
  k: number;
}

/** free fireflies in the upper sky of the lens (unit coords × R), in ignition order */
const flies = (pts: [number, number][], seed: number): Star[] =>
  pts.map(([x, y], k) => ({ x, y, seed: seed + k * 13, k }));

/** v2: a constellation drawn as the person pictogram (unit coords × R) + its line segments */
function constellation() {
  const cx = 0.22, cy = -0.38, u = 0.56;
  const P = (x: number, y: number) => ({ x: cx + x * u, y: cy + y * u });
  const body = [P(-0.16, 0.46), P(-0.19, -0.08), P(-0.14, -0.36), P(0, -0.43), P(0.14, -0.36), P(0.19, -0.08), P(0.16, 0.46)];
  const head = [0, 1, 2, 3, 4].map((i) => {
    const a = -Math.PI / 2 + (i / 5) * TAU;
    return P(Math.cos(a) * 0.13, -0.66 + Math.sin(a) * 0.13);
  });
  const chest = P(0, -0.12);
  const pts = [...body, ...head, chest];
  const stars: Star[] = pts.map((p, k) => ({ ...p, seed: 900 + k * 7, k }));
  const segs: [number, number][] = [];
  for (let i = 0; i < 6; i++) segs.push([i, i + 1]);
  segs.push([6, 0]);
  for (let i = 0; i < 5; i++) segs.push([7 + i, 7 + ((i + 1) % 5)]);
  return { stars, segs, chest: stars.length - 1, center: { x: cx, y: cy - 0.1 } };
}

const CONST = constellation();
// v1: the first few, nearest the small self first, spreading up and right
const FREE1 = flies([[-0.3, -0.5], [-0.04, -0.32], [-0.58, -0.24], [0.28, -0.16], [0.18, -0.66], [0.52, -0.44], [0.68, -0.1]], 71);
// v2: a scatter around the constellation
const FREE2 = flies([[-0.34, -0.4], [-0.6, -0.2], [-0.12, -0.66], [0.62, -0.5], [-0.2, -0.16], [0.66, -0.16], [-0.5, -0.54]], 137);

// ---------------------------------------------------------------------------

const LENS = { x: 1244, y: 492 };
const FONT = serif(58, 330);

export default class Mundo extends Scene {
  private v = (this.params.v as number) ?? 1;
  private cut = this.params.cut as number;
  private next = this.params.next as number;
  private lineA = this.lyrics.find('Pero kahit', this.cut - 1);
  private lineB = this.lyrics.find('May sarili rin', this.cut);
  private lines = [this.lineA, this.lineB];

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio, v = this.v;
    const R = v === 1 ? 300 : 342;
    const liw = this.liwanag(t);
    const [L0, L1] = v === 1 ? [0.03, 0.12] : [0.18, 0.3];
    const lw = clamp((liw - L0) / (L1 - L0));

    const sig = Lyrics.word(this.lineA, 'sumisigaw');
    const may = this.lineB.words[0];
    const mw = Lyrics.word(this.lineB, 'mundo');

    // camera: push in on the chest across "May sarili rin akong mundo"
    const ch = chestOf(SELF.x, SELF.y, SELF.h, 0.35);
    const tz = prog(t, may.start - 0.5, mw.end + 0.2, ease.inOutCubic);
    const tail = Math.max(0, t - mw.end);
    const Z = 1 + 0.55 * tz + 0.012 * Math.sin(tail * 0.9) * tz;
    const P = { x: lerp(ch.x, 332, tz), y: lerp(ch.y, 688, tz) };

    // the lens opens out of the chest light and travels to its place
    const op = prog(t, may.start - 0.2, mw.start + 0.35, ease.inOutCubic);
    const rMark = 20 * Z;
    const Lc = { x: lerp(P.x, LENS.x, op), y: lerp(P.y, LENS.y, ease.inOutQuad(op)) };
    const r = op > 0 ? lerp(rMark, R, ease.inQuad(op) * 0.35 + op * 0.65) : 0;
    const s = r / R;
    const mark = v === 2 ? 1 : prog(t, may.start - 0.6, may.start, ease.outCubic);

    const I0 = chestI(liw) * (1 + 0.3 * A.env('vocals', t));
    const emerge = Math.sin(Math.PI * clamp(op * 1.4)) * 0.8;

    groundPass ??= new Pass(GROUND_SH);
    groundPass.draw(out, {
      uT: t, uGrid: 0.3 * (1 - 0.35 * op), uDim: 0.22 * op, uR: R,
      uCam: [ch.x, ch.y, Z], uP: [P.x, P.y], uLens: [Lc.x, Lc.y, r],
      uWarm: [P.x, P.y, I0 * 0.5 + emerge * 0.6],
    });

    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // ---- the outside world, under the camera ------------------------------
    const cam = (x: CanvasRenderingContext2D) => {
      x.save();
      x.translate(P.x, P.y);
      x.scale(Z, Z);
      x.translate(-ch.x, -ch.y);
    };
    cam(c);
    cam(g);
    const lineW = 1 / Z;
    hairline(c, MARGIN - 400, GROUND + 1, W + 400, GROUND + 1, rgba('graphite', 0.7), lineW);
    const me = person(c, SELF.x, SELF.y, SELF.h, { color: 'paper', alpha: 0.95 - 0.15 * op, shrink: 0.35, nod: noise1(t * 0.3, 2) * 2 });
    firefly(g, me.chest.x, me.chest.y, { I: I0 + emerge, r: 0.7 + 0.5 * emerge, t, seed: 3, flicker: 0.25 });

    // the shout meter: reads nothing
    const mOn = prog(t, this.cut - 0.35, this.cut + 0.9, ease.outCubic) * (1 - prog(t, may.start - 0.4, may.start + 0.3));
    if (mOn > 0) this.shoutMeter(c, me.head.x, me.head.y, t, mOn, sig.start);
    c.restore();
    g.restore();

    // ---- detail marker at the chest + tangent leaders ----------------------
    if (mark > 0) {
      c.strokeStyle = rgba('graphite', 0.95 * mark);
      c.lineWidth = 1;
      c.beginPath();
      c.arc(P.x, P.y, rMark, -Math.PI / 2, -Math.PI / 2 + TAU * mark);
      c.stroke();
      typed(c, 'A', mark * 2, P.x + 32 * Z + 6, P.y - 16 * Z, mono(12, 500, false, 1), rgba('paper', 0.75), mark);
    }
    if (op > 0) {
      const ta = prog(op, 0.15, 0.9);
      for (const [x0, y0, x1, y1] of tangents(P.x, P.y, rMark, Lc.x, Lc.y, r)) {
        c.strokeStyle = rgba('paper', 0.26 * ta);
        c.setLineDash([5, 5]);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(lerp(x0, x1, ta), lerp(y0, y1, ta));
        c.stroke();
        c.setLineDash([]);
      }
      // punch the outside world out of the lens so its inner sky shows
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.arc(Lc.x, Lc.y, r + 26 * prog(op, 0.3, 0.8), 0, TAU);
      c.fill();
      c.restore();
      this.world(c, g, Lc.x, Lc.y, R, s, t, lw, op, v === 1 ? mw.start : may.start + 0.55, tail);
      this.rim(c, Lc.x, Lc.y, r, t, op, tail, lw);
    }

    // ---- lyrics: top-left margin, over the self ----------------------------
    lyricStack(c, this.lines, t, { x: MARGIN + 60, y: 330, font: FONT, lh: 74, keep: 1, maxW: 860, glow: g, style: { glowAmt: 0.35, hotAmt: 0.35 } });
    // "mundo" keeps a little of the light once sung
    const mg = prog(t, mw.start, mw.end + 0.4, ease.outCubic) * (0.2 + 0.05 * Math.sin(tail * 1.7));
    if (mg > 0.003) {
      const LY = lineLayout(this.lineB, FONT);
      const wi = this.lineB.words.indexOf(mw);
      applyFont(g, FONT);
      g.globalAlpha = mg;
      g.fillStyle = rgba('glow');
      g.fillText(mw.w, MARGIN + 60 + LY.words[wi].x, 330);
      g.globalAlpha = 1;
    }

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });
    return { vignette: 0.42 + 0.06 * op, zoom: 1 + 0.008 * Math.sin((t - this.cut) * TAU * 0.035) };
  }

  /** leader from the mouth to an empty level meter: "SIGAW · 0.00" */
  private shoutMeter(c: CanvasRenderingContext2D, hx: number, hy: number, t: number, a: number, t0: number) {
    const ax = hx + 22, ay = hy + 2;
    const bx = hx + 96, by = hy - 78;
    callout(c, ax, ay, bx, by, 'SIGAW', { p: a, alpha: 0.75, color: 'ash' });
    if (a < 0.45) return;
    const k = clamp((a - 0.45) / 0.55);
    c.globalAlpha = k;
    const x0 = bx + 8, y0 = by + 14;
    const flick = this.audio.hit('vocal', t, 0.1) * 0.35;
    for (let i = 0; i < 12; i++) {
      c.fillStyle = rgba('graphite', 0.55);
      c.fillRect(x0 + i * 8, y0, 5, 11);
      if (i === 0 && flick > 0.02) {
        c.fillStyle = rgba('ash', flick);
        c.fillRect(x0, y0, 5, 11);
      }
    }
    c.globalAlpha = 1;
    typed(c, '0.00', k * 8, x0 + 12 * 8 + 8, y0 + 10, mono(12, 400, false, 1), rgba('paper', 0.8), k);
    const note = this.v === 1 ? 'hindi sumisigaw' : 'hindi pa rin sumisigaw';
    typed(c, note, (t - t0 - 0.2) * 16, x0, y0 + 34, mono(12, 300, true, 0.5), rgba('ash', 0.75), k);
  }

  /** the inner world, drawn lens-local at scale s about (cx, cy) */
  private world(
    c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, cx: number, cy: number, R: number, s: number,
    t: number, lw: number, op: number, t0: number, tail: number,
  ) {
    const v = this.v, A = this.audio;
    const clipTo = (x: CanvasRenderingContext2D) => {
      x.save();
      x.translate(cx, cy);
      x.scale(s, s);
      x.beginPath();
      x.arc(0, 0, R, 0, TAU);
      x.clip();
    };
    clipTo(c);
    clipTo(g);

    // hills: back to front, pencil ridgelines drawing on left → right
    for (let k = 0; k < 3; k++) {
      const drift = tail * (1.5 + k * 2.2) + (v === 2 ? 40 : 0);
      const pk = prog(op, 0.25 + k * 0.12, 0.8 + k * 0.08, ease.inOutCubic);
      c.beginPath();
      for (let x = -R; x <= R; x += 8) c.lineTo(x, ridge(k, x, R, drift));
      c.lineTo(R, R);
      c.lineTo(-R, R);
      c.closePath();
      c.fillStyle = RIDGE_FILL[k];
      c.fill();
      // contour lines under the ridge
      for (let j = 0; j < 3; j++) {
        c.strokeStyle = rgba('paper', (0.05 - j * 0.012) * pk);
        c.lineWidth = 1 / s;
        c.beginPath();
        for (let x = -R; x <= R; x += 10) c.lineTo(x, ridge(k, x, R, drift) + (j + 1) * R * 0.045);
        c.stroke();
      }
      c.strokeStyle = rgba('paper', [0.24, 0.34, 0.52][k]);
      c.lineWidth = (k === 2 ? 1.4 : 1.1) / s;
      c.beginPath();
      const xe = lerp(-R, R, pk);
      for (let x = -R; x <= xe; x += 6) c.lineTo(x, ridge(k, x, R, drift));
      c.stroke();
    }

    // v2: a small house on the middle ridge, its window lit by the same light
    const drift1 = tail * 3.7 + (v === 2 ? 40 : 0);
    if (v === 2) {
      const hx = 0.44 * R, hy = ridge(1, 0.44 * R, R, drift1) + 3;
      const hw = 0.11 * R, hh = 0.075 * R;
      const hp = prog(op, 0.55, 1, ease.outCubic);
      c.fillStyle = RIDGE_FILL[1];
      c.strokeStyle = rgba('paper', 0.5 * hp);
      c.lineWidth = 1.1 / s;
      c.beginPath();
      c.moveTo(hx - hw / 2, hy);
      c.lineTo(hx - hw / 2, hy - hh);
      c.lineTo(hx, hy - hh - hw * 0.45);
      c.lineTo(hx + hw / 2, hy - hh);
      c.lineTo(hx + hw / 2, hy);
      c.fill();
      c.stroke();
      const wl = prog(t, t0 + 0.6, t0 + 1.4) * (0.55 + 0.25 * lw);
      c.fillStyle = `rgba(255,214,107,${0.35 * wl})`;
      c.fillRect(hx - hw * 0.12, hy - hh * 0.62, hw * 0.24, hh * 0.3);
      g.fillStyle = `rgba(255,214,107,${0.45 * wl})`;
      g.fillRect(hx - hw * 0.12, hy - hh * 0.62, hw * 0.24, hh * 0.3);
    }

    // the tiny self, seated on the near ridge, looking up
    const sx = -0.36 * R;
    const sy = ridge(2, sx, R, tail * 5.9 + (v === 2 ? 40 : 0)) + 2;
    const look = prog(t, t0, t0 + 1.2, ease.inOutSine);
    const me = sitting(c, sx, sy, R * 0.27, 0.92, look);
    if (v === 2) {
      // an open book beside it
      const bx = sx - R * 0.12, by = sy - 1;
      c.fillStyle = rgba('paper', 0.8);
      c.beginPath();
      c.moveTo(bx, by - 2);
      c.lineTo(bx - R * 0.05, by - 7);
      c.lineTo(bx - R * 0.05, by + 1);
      c.lineTo(bx, by + 3);
      c.lineTo(bx + R * 0.05, by + 1);
      c.lineTo(bx + R * 0.05, by - 7);
      c.closePath();
      c.fill();
    }
    firefly(g, me.chest.x, me.chest.y, { I: 0.35 + 0.35 * lw, r: 0.32, t, seed: 11, flicker: 0.3 });

    // sky fireflies: ignite on the grid (eighths in v1, sixteenths along the
    // constellation in v2), brightness riding LIWANAG
    const b0 = Math.ceil(A.beatAt(t0) * 4) / 4;
    const lit = (k: number, step: number) => {
      const tb = A.timeOfBeat(b0 + k * step);
      const gate = clamp(lw * 1.35 * (v === 1 ? FREE1.length : CONST.stars.length) - k + 1);
      return Math.min(prog(t, tb, tb + 0.3, ease.outCubic), gate);
    };
    const flyAt = (st: Star, amp: number) => ({
      x: st.x * R + amp * R * noise1(t * 0.21 + st.seed, st.seed),
      y: st.y * R + amp * R * noise1(t * 0.17 + st.seed, st.seed + 5),
    });
    let count = 0;
    const I = 0.5 + 0.4 * lw;
    if (v === 1) {
      FREE1.forEach((st, k) => {
        const a = lit(k, 0.5);
        if (a <= 0) return;
        if (a > 0.5) count++;
        const p = flyAt(st, 0.04);
        firefly(g, p.x, p.y, { I: I * a, r: 0.42 + 0.1 * ((st.seed % 7) / 7), t, seed: st.seed, flicker: 0.45 });
      });
    } else {
      // the constellation of the self: lines draw between ignited stars
      const pos = CONST.stars.map((st) => flyAt(st, 0.006));
      const a = CONST.stars.map((_, k) => lit(k, 0.25));
      c.lineWidth = 1 / s;
      for (const [i, j] of CONST.segs) {
        const k = Math.min(a[i], a[j]);
        if (k <= 0) continue;
        c.strokeStyle = rgba('paper', 0.26 * k);
        c.beginPath();
        c.moveTo(pos[i].x, pos[i].y);
        c.lineTo(lerp(pos[i].x, pos[j].x, k), lerp(pos[i].y, pos[j].y, k));
        c.stroke();
      }
      CONST.stars.forEach((st, k) => {
        if (a[k] <= 0) return;
        if (a[k] > 0.5) count++;
        const hot = k === CONST.chest;
        firefly(g, pos[k].x, pos[k].y, { I: I * a[k] * (hot ? 1.4 : 0.75), r: hot ? 0.46 : 0.24, t, seed: st.seed, flicker: hot ? 0.2 : 0.4 });
      });
      // then free ones, after the figure is complete
      FREE2.forEach((st, k) => {
        const tb = A.timeOfBeat(b0 + 0.125 + k * 0.5);
        const ak = Math.min(prog(t, tb, tb + 0.3, ease.outCubic), clamp(lw * 1.2 * FREE2.length - k));
        if (ak <= 0) return;
        if (ak > 0.5) count++;
        const p = flyAt(st, 0.04);
        firefly(g, p.x, p.y, { I: I * 0.8 * ak, r: 0.36, t, seed: st.seed, flicker: 0.45 });
      });
    }
    c.restore();
    g.restore();
    this.flies = count;
  }

  private flies = 0;

  /** lens rim: hairline circle, a slowly turning degree ring, and its field notes */
  private rim(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, op: number, tail: number, lw: number) {
    c.strokeStyle = rgba('paper', 0.55);
    c.lineWidth = 1.25;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.stroke();
    const ring = prog(op, 0.5, 1, ease.outCubic);
    if (ring > 0) {
      const rot = -0.4 + tail * 0.035 + (t - this.cut) * 0.004;
      c.strokeStyle = rgba('paper', 0.28 * ring);
      c.lineWidth = 1;
      c.beginPath();
      const n = 120;
      for (let i = 0; i < n * ring; i++) {
        const a = rot + (i / n) * TAU;
        const long = i % 10 === 0;
        const r0 = r + 8, r1 = r + (long ? 19 : 12);
        c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      c.stroke();
    }
    // field notes, upper right of the lens
    const lp = prog(op, 0.7, 1);
    if (lp <= 0) return;
    const a = -0.9;
    const ax = cx + Math.cos(a) * (r + 22), ay = cy + Math.sin(a) * (r + 22);
    const bx = ax + 64, by = ay - 58;
    const title = this.v === 1 ? 'A  ·  SARILING MUNDO' : 'A  ·  SARILING MUNDO  ·  II';
    callout(c, ax, ay, bx, by, title, { p: lp, alpha: 0.8, color: 'paper', font: mono(13, 500, false, 2) });
    const k = clamp((lp - 0.5) * 2);
    if (k <= 0) return;
    const f = mono(11, 400, false, 1.8);
    typed(c, 'LOOB NG DIBDIB  ·  WALANG SUKAT', k * 40, bx + 8, by + 26, f, rgba('ash', 0.7));
    const n = this.flies;
    typed(c, `ALITAPTAP  ·  ${String(n).padStart(2, '0')}`, k * 40, bx + 8, by + 46, f, rgba('ash', 0.7));
    void lw;
  }
}
