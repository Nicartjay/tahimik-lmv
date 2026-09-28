// TALA 01 · GILID — "Nakatayo sa gilid lang / Nakikinig, pero 'di sumasabay".
// The quiet one stands at the far-left edge of the ground line; a group talks and
// sways to the beat at centre-right. A dimension line measures the gap: 4 steps.
// On "sumasabay" the group sways in unison — the self does not.

import { MARGIN } from '../engine/config';
import { mono, serif } from '../engine/fonts';
import { text } from '../engine/karaoke';
import type { RT } from '../engine/gl';
import { Lyrics } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { ease, noise1, prog, TAU } from '../engine/util';
import { callout, chestI, firefly, GROUND, hairline, idle, lyricStack, nightBg, person, SELF, talk, type Placed } from './_motifs';

const GROUP: Placed[] = [
  { x: 1040, y: GROUND, s: 0.92, seed: 11 },
  { x: 1150, y: GROUND, s: 1.02, seed: 23 },
  { x: 1262, y: GROUND, s: 0.97, seed: 37 },
  { x: 1370, y: GROUND, s: 1.06, seed: 41 },
  { x: 1478, y: GROUND, s: 0.9, seed: 53 },
  { x: 1580, y: GROUND, s: 1.0, seed: 67 },
];

export default class Gilid extends Scene {
  lines = this.lyrics.between(this.ctx.start, this.ctx.end - 0.5).filter((l) => l.start > this.ctx.start - 1);

  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const cut = this.params.cut as number;
    const sabay = Lyrics.word(this.lyrics.find('sumasabay'), 'sumasabay');
    const unison = prog(t, sabay.start - 0.1, sabay.start + 0.5, ease.inOutSine);

    nightBg(out, { t, grid: 0.3, fog: 0.4, warm: [SELF.x, SELF.y - 100, chestI(this.liwanag(t)) * 0.5] });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // ground line
    const gp = prog(t, cut - 0.4, cut + 1.2, ease.inOutCubic);
    hairline(c, MARGIN, GROUND + 1, MARGIN + gp * (1920 - 2 * MARGIN), GROUND + 1, rgba('graphite', 0.7));

    // the group: talking, bobbing on the beat, swaying together on "sumasabay"
    const pulse = A.beatPulse(t, 0.14);
    GROUP.forEach((p, i) => {
      const id = idle(p, t, 1);
      const sway = Math.sin(f.beat * Math.PI + (1 - unison) * i * 1.3) * 0.07 * (0.4 + 0.6 * unison);
      const h = 172 * p.s;
      const bob = -pulse * 5 * (0.5 + 0.5 * Math.sin(i * 2.1));
      const pr = person(c, p.x + id.dx, p.y + bob, h, { color: 'ash', alpha: 0.9, lean: id.lean * 0.6 + sway, nod: id.nod });
      if (i % 2 === 0 || unison > 0.5) talk(c, pr.head.x, pr.head.y, h * 0.105, t + i, p.seed, { dir: i < 3 ? -1 : 1, alpha: 0.55 });
    });

    // the self: still, a touch hunched, faint light in the chest
    const me = person(c, SELF.x, SELF.y, SELF.h, { color: 'paper', alpha: 0.95, shrink: 0.35, nod: noise1(t * 0.3, 2) * 2 });
    firefly(g, me.chest.x, me.chest.y, { I: chestI(this.liwanag(t)), r: 0.7, t, seed: 3, flicker: 0.25 });

    // field notes
    const k = (a: number) => prog(t, a, a + 1.1, ease.outCubic);
    const gilid = Lyrics.word(this.lyrics.find('Nakatayo'), 'gilid');
    callout(c, me.head.x + 14, me.head.y - 10, me.head.x + 90, me.head.y - 70, 'AKO', { p: k(gilid.start), color: 'paper', alpha: 0.75 });
    const g0 = GROUP[2];
    callout(c, g0.x + 20, GROUND - 172 * g0.s - 22, g0.x + 80, GROUND - 250, 'SILA  ·  6', { p: k(gilid.start + 0.6), alpha: 0.6 });

    // dimension line between me and them
    const dy = GROUND + 46;
    const x0 = SELF.x + 36, x1 = GROUP[0].x - 36;
    const dp = prog(t, gilid.end, gilid.end + 1.4, ease.inOutCubic);
    if (dp > 0) {
      const xm = (x0 + x1) / 2, half = ((x1 - x0) / 2) * dp;
      hairline(c, xm - half, dy, xm + half, dy, rgba('graphite', 0.9));
      for (const x of [xm - half, xm + half]) hairline(c, x, dy - 7, x, dy + 7, rgba('graphite', 0.9));
      for (let s = 1; s < 4; s++) {
        const x = x0 + ((x1 - x0) * s) / 4;
        if (Math.abs(x - xm) < half) hairline(c, x, dy - 3, x, dy + 3, rgba('graphite', 0.9));
      }
      c.globalAlpha = prog(t, gilid.end + 0.9, gilid.end + 1.6);
      text(c, 'LAYO  ·  4 HAKBANG', xm, dy + 26, mono(12, 400, false, 2), rgba('ash', 0.8), 'center');
      c.globalAlpha = 1;
    }

    // lyrics, top-left margin, above the self
    lyricStack(c, this.lines, t, { x: MARGIN + 60, y: 330, font: serif(58, 330), lh: 74, keep: 1, maxW: 820, glow: g, style: { glowAmt: 0.35, hotAmt: 0.35 } });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.2 }] });
    return { vignette: 0.42, zoom: 1 + 0.012 * Math.sin((t - cut) * TAU * 0.03) };
  }
}
