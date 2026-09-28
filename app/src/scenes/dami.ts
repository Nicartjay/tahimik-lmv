// TALA · DAMI NG TAO — "Nahihiya sa dami ng tao / Ayokong maging sentro ng eksena".
// A crowd in perspective fills the centre and right, bobbing on the beat; a pale cool
// spotlight hunts through it. On "sentro" the frame centre is marked; on "eksena" the
// light swings to the quiet one at the left edge.
//   v1  the self shrinks and slips back out of the light
//   v2  a denser crowd; the self is caught for a beat, then slips away
//   v3  after the bridge: the light finds the self and the self stays, taller, lit

import { H, MARGIN, W } from '../engine/config';
import { mono, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { typed } from '../engine/karaoke';
import { Lyrics } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, hash, lerp, mulberry32, noise1, prog, TAU } from '../engine/util';
import { callout, chestI, firefly, hairline, lyricStack, nightBg, person, talk } from './_motifs';
import { chatter, drawSpot, hexMix, litBy, type ChatSlot, type Spot } from './_chorus';

const HY = 470; //          horizon
const VX = W / 2; //        vanishing x
const REF = 300; //         person height at depth z = 1 (the bottom edge)
const Z0 = 1.27, Z1 = 5.8; // crowd depth range (feet from y ≈ 950 back to y ≈ 575)
const SRC: [number, number] = [1760, -180]; // high right, so the beam to the edge clears the lyrics
const HOME = { x: 236, y: 880 };
const HIDE = { x: 122, y: 806 };
const CENTRE = { x: W / 2, y: H / 2 };

const gy = (z: number) => HY + (H - HY) / z;
const zOf = (y: number) => (H - HY) / (y - HY);

interface Member {
  x: number;
  y: number;
  z: number;
  h: number;
  seed: number;
  /** bobs on the off-beat */
  off: boolean;
  /** jumps on the downbeat */
  jump: boolean;
  talks: boolean;
}

/** people on the ground plane, spaced in world units, drawn back to front */
function crowd(seed: number, n: number): Member[] {
  const rnd = mulberry32(seed);
  const pts: { X: number; Z: number; seed: number }[] = [];
  let tries = 0;
  while (pts.length < n && tries++ < n * 120) {
    const Z = lerp(Z0, Z1, rnd() ** 0.85);
    const X = ((lerp(660, 1860, rnd()) - VX) * Z) / VX;
    if (pts.every((p) => Math.hypot((p.X - X) / 0.15, (p.Z - Z) / 0.34) > 1)) pts.push({ X, Z, seed: Math.floor(rnd() * 1e6) });
  }
  return pts
    .sort((a, b) => b.Z - a.Z)
    .map((p) => ({
      x: VX + (p.X * VX) / p.Z,
      y: gy(p.Z),
      z: p.Z,
      h: (REF / p.Z) * (0.9 + 0.2 * hash(p.seed, 1)),
      seed: p.seed,
      off: hash(p.seed, 2) < 0.3,
      jump: hash(p.seed, 6) < 0.1,
      talks: hash(p.seed, 3) < 0.3,
    }));
}

const CROWDS: Record<number, Member[]> = { 1: crowd(4101, 64), 2: crowd(4202, 110) };
CROWDS[3] = CROWDS[2];

/** the member the DAMI callout points at: a mid-depth head on the right */
const tagged = (m: Member[]) => m.reduce((a, b) => (Math.hypot(b.x - 1700, b.y - 700) < Math.hypot(a.x - 1700, a.y - 700) ? b : a));

const SLOTS: ChatSlot[] = [
  { x: 760, y: 530, s: 21 },
  { x: 900, y: 468, s: 16 },
  { x: 1040, y: 566, s: 25 },
  { x: 1190, y: 452, s: 15 },
  { x: 1310, y: 548, s: 22 },
  { x: 1450, y: 486, s: 17 },
  { x: 1580, y: 600, s: 27 },
  { x: 1690, y: 530, s: 19 },
];

export default class Dami extends Scene {
  lines = this.lyrics.between(this.ctx.start, this.ctx.end - 0.5).filter((l) => l.start > this.ctx.start - 1);

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const v = (this.params.v as number) ?? 1;
    const cut = this.params.cut as number, next = this.params.next as number;
    const people = CROWDS[v] ?? CROWDS[1];
    const l2 = this.lyrics.find('sentro ng eksena', this.ctx.start);
    const sentro = Lyrics.word(l2, 'sentro'), eks = Lyrics.word(l2, 'eksena');
    const liw = this.liwanag(t);

    // ---- the self's choreography ------------------------------------------------
    const arrive = eks.start + 0.45; // the light reaches the edge
    const caught = v === 2 ? A.timeOfBeat(Math.ceil(A.beatAt(arrive)) + 1) : arrive;
    const dodge = v === 3 ? 0 : prog(t, (v === 1 ? eks.start - 0.05 : caught - 0.1), (v === 1 ? eks.start : caught) + 0.5, ease.inOutCubic);
    const stand = v === 3 ? prog(t, arrive - 0.1, arrive + 1.1, ease.outCubic) : 0;

    // ---- the spotlight ------------------------------------------------------------
    const b = A.beatAt(t), k = Math.floor(b);
    const P = (i: number): [number, number] => [
      lerp(800, 1720, 0.5 + 0.5 * noise1(i * 0.63, 17 + v)),
      lerp(650, 900, 0.5 + 0.5 * noise1(i * 0.41, 29 + v)),
    ];
    const e = ease.inOutCubic(clamp((b - k) / 0.8));
    const s0 = P(k), s1 = P(k + 1);
    let tx = lerp(s0[0], s1[0], e), ty = lerp(s0[1], s1[1], e);
    const search: [number, number] = [tx, ty];
    const toC = prog(t, sentro.start - 0.3, sentro.start + 0.3, ease.inOutCubic);
    tx = lerp(tx, CENTRE.x, toC);
    ty = lerp(ty, 612, toC);
    const toSelf = prog(t, eks.start - 0.15, arrive, ease.inOutCubic);
    tx = lerp(tx, HOME.x + 22, toSelf);
    ty = lerp(ty, HOME.y, toSelf);
    if (v < 3) {
      const back = prog(t, eks.end + 0.2, eks.end + 1.3, ease.inOutSine);
      tx = lerp(tx, search[0], back);
      ty = lerp(ty, search[1], back);
    }
    const rx = 40 + 150 * ((ty - HY) / (H - HY));
    const spot: Spot = {
      src: SRC,
      tgt: [tx, ty],
      pool: [rx, rx * 0.27],
      I: (0.5 + 0.5 * prog(t, cut - 0.4, cut + 0.5)) * (0.9 + 0.1 * A.beatPulse(t, 0.15)) * (v === 3 ? 1 + 0.25 * stand : 1),
    };

    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // ---- floor: horizon + receding lines ---------------------------------------
    c.globalAlpha = 0.9;
    hairline(c, MARGIN, HY, W - MARGIN, HY, rgba('slate', 1));
    for (let i = -9; i <= 9; i++) hairline(c, VX + i * 22, HY + 12, VX + i * 360, H, rgba('slate', 0.55));
    for (const z of [1.4, 2, 3, 4.6]) hairline(c, 0, gy(z), W, gy(z), rgba('slate', 0.4));
    c.globalAlpha = 1;

    // ---- the crowd -----------------------------------------------------------------
    const drive = 0.6 + 0.8 * A.env('drums', t);
    const on = A.beatPulse(t, 0.11);
    const ob = A.beatAt(t) - 0.5;
    const offP = Math.pow(0.5, (t - A.timeOfBeat(Math.floor(ob) + 0.5)) / 0.11);
    const down = A.beatPulse(t, 0.16, 4);
    const quiet = 1 - 0.4 * stand; // v3: the room recedes when the self stands
    for (const m of people) {
      const lit = litBy(spot, m.x, m.y);
      const depth = clamp((Z1 - m.z) / (Z1 - Z0));
      const base = depth < 0.5 ? hexMix('slate', 'graphite', 0.35 + 1.3 * depth) : hexMix('graphite', 'ash', 0.7 * (depth - 0.5));
      const col = hexMix(hexMix(base, 'slate', 1 - quiet), 'paper', lit * 0.75);
      const bob = -((m.off ? offP : on) * 0.03 + (m.jump ? down * 0.07 : 0)) * m.h * drive * (0.6 + 0.8 * hash(m.seed, 4));
      const sc = 1.3 / m.z;
      const x = m.x + noise1(t * 0.35, m.seed) * 5 * sc;
      const lean = noise1(t * 0.5, m.seed + 3) * 0.05;
      const nod = noise1(t * 0.9, m.seed + 7) * 4 * sc;
      person(c, x, m.y + bob, m.h, { color: 'ink', outline: Math.max(2, 7 / m.z), lean, nod });
      const pr = person(c, x, m.y + bob, m.h, { color: col, lean, nod });
      if (m.talks) talk(c, pr.head.x, pr.head.y, m.h * 0.105, t + (m.seed % 13), m.seed, { color: col, alpha: 0.5 * quiet, dir: m.x < 1250 ? -1 : 1 });
    }
    chatter(c, A, t, SLOTS, 70 + v, { density: v === 2 ? 0.55 : 0.42, alpha: 0.5 * quiet });

    // ---- the self -------------------------------------------------------------------
    const sx = lerp(HOME.x, HIDE.x, dodge), sy = lerp(HOME.y, HIDE.y, dodge);
    const selfLit = litBy(spot, sx, sy);
    const shrink = v === 3 ? 0.35 * (1 - stand) : clamp(0.35 + 0.4 * selfLit + 0.65 * dodge);
    const sh = (REF / zOf(sy)) * (1 + 0.06 * stand);
    const me = person(c, sx, sy, sh, {
      color: 'paper', alpha: 0.95 - 0.15 * dodge, shrink,
      lean: -0.05 * dodge + noise1(t * 0.4, 5) * 0.01, nod: noise1(t * 0.3, 2) * 2 - 3 * selfLit * (v < 3 ? 1 : 0),
    });
    const I = chestI(liw) * (1 + 0.35 * stand);
    firefly(g, me.chest.x, me.chest.y, { I, r: 0.7 + 0.3 * stand, t, seed: 3, flicker: 0.25 });

    // ---- field notes ---------------------------------------------------------------
    const tg = tagged(people);
    callout(c, tg.x + 6, tg.y - tg.h - 4, 1804, 424, `DAMI  ·  ${people.length}`, {
      p: prog(t, cut + 0.2, cut + 1.3, ease.outCubic), align: 'right', alpha: 0.6,
    });

    // SENTRO: the registration mark at the frame centre, with faint axes to the edges
    const sm = prog(t, sentro.start - 0.05, sentro.start + 0.45, ease.outCubic) * (1 - prog(t, eks.end + 0.3, eks.end + 1.2));
    if (sm > 0) {
      const ax = prog(t, sentro.start, sentro.start + 0.9, ease.inOutCubic);
      hairline(c, CENTRE.x - ax * 860, CENTRE.y, CENTRE.x + ax * 860, CENTRE.y, rgba('paper', 0.1 * sm));
      hairline(c, CENTRE.x, CENTRE.y - ax * 190, CENTRE.x, CENTRE.y + ax * 440, rgba('paper', 0.1 * sm));
      const col = rgba('paper', 0.8 * sm);
      const r = 24 + 4 * A.beatPulse(t, 0.12);
      c.strokeStyle = col;
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(CENTRE.x, CENTRE.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * sm);
      c.stroke();
      c.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        c.moveTo(CENTRE.x + dx * 8, CENTRE.y + dy * 8);
        c.lineTo(CENTRE.x + dx * (8 + 38 * sm), CENTRE.y + dy * (8 + 38 * sm));
      }
      c.stroke();
      typed(c, 'SENTRO', (t - sentro.start - 0.1) * 24, CENTRE.x + 40, CENTRE.y - 34, mono(12, 500, false, 2.6), rgba('paper'), 0.8 * sm);
    }

    if (v < 3) {
      // the light lands on the place the self just left
      const wp = prog(t, (v === 1 ? eks.start : caught) + 0.55, (v === 1 ? eks.start : caught) + 1.4, ease.outCubic) *
        (1 - prog(t, eks.end + 0.2, eks.end + 0.8));
      callout(c, HOME.x + 22, HOME.y - 4, HOME.x + 150, HOME.y - 150, 'WALA', { p: wp, alpha: 0.65 * (wp > 0 ? 1 : 0) });
    } else {
      callout(c, me.head.x + 14, me.head.y - 10, me.head.x + 104, me.head.y - 84, 'NANDITO  ·  AKO', {
        p: prog(t, arrive + 0.4, arrive + 1.6, ease.outCubic), color: 'paper', alpha: 0.8,
      });
    }

    // ---- lyrics (top-left, clear of the crowd) --------------------------------------
    lyricStack(c, this.lines, t, {
      x: MARGIN + 60, y: 300, font: serif(58, 330), lh: 74, keep: 1, maxW: 900, glow: g,
      style: { glowAmt: 0.35, hotAmt: 0.35 },
    });

    // ---- composite: ground, pool, canvas, beam over everything ---------------------
    nightBg(out, { t, grid: 0.14, fog: 0.45, warm: [me.chest.x, me.chest.y, I * 0.5] });
    drawSpot(out, spot, t, 'pool');
    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });
    drawSpot(out, spot, t, 'cone');

    const kick = v < 3 && t > sentro.start ? 2.4 * Math.exp(-(t - sentro.start) / 0.22) : 0;
    return {
      vignette: 0.42,
      zoom: 1.004 + 0.012 * prog(t, cut, next) + 0.004 * A.beatPulse(t, 0.25, 4),
      shake: [noise1(t * 40, 3) * kick, noise1(t * 40, 7) * kick],
    };
  }
}
