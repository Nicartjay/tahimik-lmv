// TALA · SULOK — "Gusto ko lang huminga nang tahimik / Sa sulok na ako lang ang kilala".
// A room corner drawn in perspective hairlines in the lower-left; the self sits in it,
// knees drawn up. Sea-coloured breath rings leave the chest on the bar and fill the room;
// outside the corner the crowd's noise thins out and drifts away. KILALA · 1.
//   v1  a small, dark corner, quick shallow breaths
//   v2  a fuller room, slower and wider breaths, a notebook
//   v3  the firefly lights the corner: books, a plant, a picture — a room of one's own

import { MARGIN, W } from '../engine/config';
import { mono, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { text } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, keys, lerp, noise1, prog, TAU } from '../engine/util';
import { callout, chestI, depthScale, firefly, hairline, lyricStack, nightBg, person, scatter, talk } from './_motifs';
import { chatter, type ChatSlot } from './_chorus';

type P = [number, number];

// corner geometry (local coords; each variant scales it about the lower-left pivot)
const PIV: P = [MARGIN, 928];
const C: P = [400, 840]; //   corner, floor
const TOP: P = [400, 510]; // corner, ceiling
const FL: P = [96, 928], FR: P = [960, 928]; //  floor edges run out to the viewer
const CL: P = [96, 422], CR: P = [960, 452]; //  ceiling edges
const SEAT: P = [488, 884];
// the floor strip stops above the HUD row (bottom-left box starts at y = 948)
const ROOM: P[] = [CL, TOP, CR, FR, [960, 944], [96, 944], FL];

/** a point on the right wall: u along it (0 corner → 1 wall end), w down it (0 ceiling → 1 floor) */
const onRight = (u: number, w: number): P => {
  const a = [lerp(TOP[0], CR[0], u), lerp(TOP[1], CR[1], u)], b = [lerp(C[0], FR[0], u), lerp(C[1], FR[1], u)];
  return [lerp(a[0], b[0], w), lerp(a[1], b[1], w)];
};

const poly = (c: CanvasRenderingContext2D, pts: P[]) => {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
};

/** a line from a toward b, drawn on to fraction p */
const seg = (c: CanvasRenderingContext2D, a: P, b: P, p: number, color: string, w: number) =>
  hairline(c, a[0], a[1], lerp(a[0], b[0], p), lerp(a[1], b[1], p), color, w);

interface SeatOpts {
  alpha?: number;
  breath?: number;
  /** 1 = head down, 0 = head up */
  tuck?: number;
}

const LEAN = -0.1; // leaning back against the wall

function seatGeo(x: number, y: number, h: number, o: SeatOpts) {
  const tuck = o.tuck ?? 0;
  const bw = h * 0.34, r = h * 0.105;
  const top = y - h * (0.42 + 0.014 * (o.breath ?? 0));
  const rot = (px: number, py: number): P => [
    x + (px - x) * Math.cos(LEAN) - (py - y) * Math.sin(LEAN),
    y + (px - x) * Math.sin(LEAN) + (py - y) * Math.cos(LEAN),
  ];
  const hx = x + h * (0.02 + 0.04 * tuck), hy = top - r - h * (0.035 - 0.03 * tuck);
  return { bw, r, top, hx, hy, rot, chest: rot(x, top + bw * 0.62), head: rot(hx, hy) };
}

/**
 * The self, seated on the floor with knees drawn up and arms around them; hips at
 * (x, y), h = standing height. Returns chest + head.
 */
function seated(c: CanvasRenderingContext2D, x: number, y: number, h: number, o: SeatOpts = {}) {
  const a = o.alpha ?? 1;
  const col = rgba('paper', a), edge = rgba('ink', a);
  const { bw, r, top, hx, hy, rot, chest, head } = seatGeo(x, y, h, o);
  const th = LEAN;
  c.save();
  c.translate(x, y);
  c.rotate(th);
  c.translate(-x, -y);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x - bw * 0.46, y);
  c.lineTo(x - bw * 0.5, top + bw * 0.5);
  c.arc(x, top + bw * 0.5, bw * 0.5, Math.PI, 0);
  c.lineTo(x + bw * 0.46, y);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(hx, hy, r, 0, TAU);
  c.fill();
  c.restore();
  // knees up, arms around them: ink edge first so the limbs read against the torso
  const hip: P = [x + bw * 0.25, y - h * 0.05], knee: P = [x + h * 0.3, y - h * 0.27], foot: P = [x + h * 0.42, y - h * 0.03];
  const sh = rot(x + bw * 0.18, top + bw * 0.42), hand: P = [knee[0] + h * 0.02, knee[1] + h * 0.05];
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const limb = (pts: P[], w: number) => {
    for (const [lw, s] of [[w + 5, edge], [w, col]] as const) {
      c.strokeStyle = s;
      c.lineWidth = lw;
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.stroke();
    }
  };
  limb([hip, knee, foot], h * 0.15);
  limb([sh, hand], h * 0.075);
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
  return { chest, head };
}

// the noise outside the corner
const OUT = scatter(5151, 24, 1110, 600, 1830, 900, 58);
const SLOTS: ChatSlot[] = [
  { x: 1190, y: 624, s: 18 },
  { x: 1340, y: 706, s: 22 },
  { x: 1490, y: 602, s: 16 },
  { x: 1610, y: 770, s: 24 },
  { x: 1750, y: 664, s: 18 },
  { x: 1270, y: 846, s: 20 },
  { x: 1700, y: 884, s: 17 },
];

export default class Sulok extends Scene {
  lines = this.lyrics.between(this.ctx.start, this.ctx.end - 0.5).filter((l) => l.start > this.ctx.start - 1);

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const v = (this.params.v as number) ?? 1;
    const cut = this.params.cut as number, next = this.params.next as number;
    const i = clamp(v - 1, 0, 2);
    const l1 = this.lyrics.find('Gusto ko lang huminga', this.ctx.start);
    const l2 = this.lyrics.find('ako lang ang kilala', this.ctx.start);
    const huminga = Lyrics.word(l1, 'huminga'), tahimik = Lyrics.word(l1, 'tahimik'), kilala = Lyrics.word(l2, 'kilala');
    const liw = this.liwanag(t);
    const I = chestI(liw) * [1, 1, 1.15][i];

    // breathing: one breath per ring (half a bar in v1, a bar after)
    const beats = v === 1 ? 2 : 4;
    const ph = (A.barAt(t) * 4) / beats;
    const breath = 0.5 - 0.5 * Math.cos(TAU * ph);

    const S = [0.8, 0.9, 1][i];
    const T = ([x, y]: P | [number, number]): P => [PIV[0] + (x - PIV[0]) * S, PIV[1] + (y - PIV[1]) * S];
    const hw = 1 / S; // keeps hairlines at 1 px under the scale

    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // ---- the corner ------------------------------------------------------------
    c.save();
    c.translate(PIV[0], PIV[1]);
    c.scale(S, S);
    c.translate(-PIV[0], -PIV[1]);

    const pose: SeatOpts = { breath, tuck: [1, 0.6, 0.1][i], alpha: [0.85, 0.92, 0.97][i] };
    const geo = seatGeo(SEAT[0], SEAT[1], 200, pose);
    const [chx, chy] = geo.chest;
    // walls: faint slate planes, and (v2, v3) the chest light spilling over them
    c.fillStyle = rgba('slate', [0.05, 0.1, 0.13][i]);
    poly(c, [CL, TOP, C, FL]);
    c.fill();
    c.fillStyle = rgba('slate', [0.025, 0.055, 0.075][i]);
    poly(c, [TOP, CR, FR, C]);
    c.fill();
    if (v > 1) {
      const gr = c.createRadialGradient(chx, chy, 0, chx, chy, v === 3 ? 520 : 380);
      gr.addColorStop(0, rgba('paper', (v === 3 ? 0.075 : 0.03) * I));
      gr.addColorStop(1, rgba('paper', 0));
      c.fillStyle = gr;
      poly(c, [CL, TOP, CR, FR, C, FL]);
      c.fill();
    }

    // hairlines, drawn on from the corner outward around the cut
    const dp = 0.3 + 0.7 * ease.outCubic(prog(t, cut - 0.35, cut + 1.3));
    const la = [0.34, 0.44, 0.5][i];
    seg(c, C, TOP, clamp(dp * 1.4), rgba('ash', la + 0.15), hw);
    seg(c, C, FL, dp, rgba('ash', la), hw);
    seg(c, C, FR, dp, rgba('ash', la), hw);
    c.setLineDash([2 * hw, 6 * hw]);
    seg(c, TOP, CL, dp, rgba('ash', la * 0.7), hw);
    seg(c, TOP, CR, dp, rgba('ash', la * 0.7), hw);
    const ep = prog(t, cut + 0.2, cut + 1.4, ease.outCubic);
    seg(c, FL, CL, 0.25 + 0.75 * ep, rgba('ash', la * 0.5), hw);
    seg(c, FR, CR, 0.25 + 0.75 * ep, rgba('ash', la * 0.5), hw);
    c.setLineDash([]);

    // the right angle at the ceiling vertex
    const ap = prog(t, cut + 0.3, cut + 1.3, ease.outCubic);
    if (ap > 0) {
      const a0 = Math.atan2(CL[1] - TOP[1], CL[0] - TOP[0]), a1 = Math.atan2(CR[1] - TOP[1], CR[0] - TOP[0]);
      c.strokeStyle = rgba('ash', 0.55 * ap);
      c.lineWidth = hw;
      c.beginPath();
      c.arc(TOP[0], TOP[1], 30, a0, lerp(a0, a1 + (a1 < a0 ? TAU : 0), ap));
      c.stroke();
      text(c, 'SULOK  ·  90°', TOP[0], TOP[1] - 44, mono(12 / S, 400, false, 2 / S), rgba('ash', 0.6 * ap), 'center');
    }

    // things of one's own
    const obj = rgba('ash', 0.55);
    c.lineWidth = hw;
    if (v >= 2) {
      // notebook on the floor by the feet (v3: open, with a pencil)
      c.strokeStyle = obj;
      if (v === 2) {
        poly(c, [[618, 904], [704, 899], [718, 921], [628, 928]]);
        c.stroke();
        hairline(c, 626, 908, 634, 926, obj, hw);
      } else {
        poly(c, [[600, 906], [662, 902], [668, 924], [604, 930]]);
        c.stroke();
        poly(c, [[662, 902], [726, 899], [736, 920], [668, 924]]);
        c.stroke();
        for (let k = 0; k < 3; k++) hairline(c, 674 + k * 2, 907 + k * 5, 722 + k * 3, 905 + k * 5, rgba('ash', 0.35), hw);
        hairline(c, 612, 916, 650, 910, rgba('ash', 0.35), hw);
        hairline(c, 744, 930, 790, 918, obj, 2 * hw);
      }
    }
    if (v === 3) {
      // books against the left wall
      c.strokeStyle = obj;
      for (const [x, y, w, h] of [[196, 892, 78, 13], [204, 879, 66, 13], [192, 868, 72, 11]]) c.strokeRect(x, y, w, h);
      // a plant near the wall's end
      poly(c, [[826, 880], [866, 880], [860, 912], [832, 912]]);
      c.stroke();
      c.strokeStyle = rgba('sea', 0.55);
      c.beginPath();
      for (const [dx, dy, cx] of [[-34, -52, -26], [-12, -78, -20], [10, -84, 16], [30, -60, 30], [44, -34, 40]]) {
        c.moveTo(846, 880);
        c.quadraticCurveTo(846 + cx, 880 + dy * 0.7, 846 + dx, 880 + dy);
      }
      c.stroke();
      // a picture on the right wall
      const fp = [onRight(0.5, 0.2), onRight(0.72, 0.2), onRight(0.72, 0.46), onRight(0.5, 0.46)];
      c.strokeStyle = obj;
      poly(c, fp);
      c.stroke();
      const m = (u: number, w: number) => onRight(lerp(0.5, 0.72, u), lerp(0.2, 0.46, w));
      c.strokeStyle = rgba('ash', 0.35);
      c.beginPath();
      c.moveTo(...m(0.1, 0.8));
      c.lineTo(...m(0.4, 0.45));
      c.lineTo(...m(0.6, 0.65));
      c.lineTo(...m(0.9, 0.35));
      c.stroke();
    }

    // breath rings from the chest, held inside the room
    const [ringR, ringA, life] = [[150, 0.34, 2], [290, 0.46, 2.4], [320, 0.5, 2.4]][i];
    c.save();
    poly(c, ROOM);
    c.clip();
    c.lineWidth = hw;
    const ring = (age: number, R: number, a0: number) => {
      const q = age / life;
      if (q < 0 || q > 1) return;
      const r = 16 + R * ease.outCubic(q);
      const a = a0 * Math.pow(1 - q, 1.6) * clamp(age / 0.08) * clamp(dp * 1.3);
      c.strokeStyle = rgba('sea', a);
      c.beginPath();
      c.arc(chx, chy, r, 0, TAU);
      c.stroke();
    };
    for (let k = 0; k < 3; k++) ring(ph - (Math.floor(ph) - k), ringR, ringA);
    // "huminga": one long breath
    ring(((t - huminga.start) / A.period(t) / beats), ringR * 1.35, ringA * 1.25);
    c.restore();

    // the self
    const me = seated(c, SEAT[0], SEAT[1], 200, pose);
    const chest = T(me.chest), head = T(me.head);
    c.restore();

    firefly(g, chest[0], chest[1], { I, r: [0.6, 0.8, 1.25][i], t, seed: 5, flicker: 0.3 });

    callout(c, head[0] + 12, head[1] - 12, head[0] + 118, head[1] - 96, 'KILALA  ·  1', {
      p: prog(t, kilala.start - 0.05, kilala.start + 1.1, ease.outCubic), color: 'paper', alpha: 0.8,
    });

    // ---- the world outside, thinning out -----------------------------------------
    const n0 = [1, 0.8, 0.6][i], n1 = [0.35, 0.25, 0.05][i], n2 = [0.15, 0.1, 0][i];
    const noise = keys(t, [[cut - 0.4, n0], [tahimik.end, n1], [kilala.start, n2]]);
    const drift = (1 - noise / n0) * 90;
    if (noise > 0.003) {
      for (const p of OUT) {
        const ds = depthScale(p.y, 480);
        const h = 150 * ds;
        const x = p.x + drift * (0.6 + ds) + noise1(t * 0.35, p.seed) * 4;
        const bob = -A.beatPulse(t, 0.12) * h * 0.03;
        const pr = person(c, x, p.y + bob, h, { color: 'ash', alpha: noise * (0.3 + 0.35 * ds), nod: noise1(t * 0.9, p.seed + 7) * 3 });
        if (p.seed % 3 === 0) talk(c, pr.head.x, pr.head.y, h * 0.105, t + (p.seed % 11), p.seed, { alpha: noise * 0.5 });
      }
      chatter(c, A, t, SLOTS, 90 + v, { density: 0.15 + 0.35 * noise, alpha: 0.45 * noise, drift: drift * 1.3 });
    }

    // ---- lyrics at the opposite (top-right) margin ------------------------------
    lyricStack(c, this.lines, t, {
      x: W - MARGIN - 60, y: 300, align: 'right', font: serif(58, 330), lh: 74, keep: 1, maxW: 960, glow: g,
      style: { glowAmt: 0.35, hotAmt: 0.35 },
    });

    nightBg(out, { t, grid: [0.1, 0.12, 0.13][i], fog: 0.4, warm: [chest[0], chest[1], I * [0.4, 0.9, 1.5][i]] });
    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });

    return {
      exposure: [0.92, 0.97, 1][i],
      vignette: [0.5, 0.46, 0.42][i],
      zoom: 1.004 + 0.008 * prog(t, cut, next) + 0.003 * breath,
    };
  }
}
