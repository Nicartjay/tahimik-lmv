// TALA 00 · PABALAT — the notebook cover. A faint grid, registration marks, the title
// set low on the left (never centred). One firefly wanders in and becomes the full
// stop of the title, then slips into the chest of the quiet one for the next plate.

import { MARGIN } from '../engine/config';
import { applyFont, layout, mono, serif } from '../engine/fonts';
import { typed } from '../engine/karaoke';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, lerp, noise1, prog } from '../engine/util';
import type { RT } from '../engine/gl';
import { firefly, nightBg, plateCorners, SELF } from './_motifs';

const X = MARGIN + 60;
const Y1 = 700;
const Y2 = 842;
const T1 = serif(132, 320, true);
const T2 = serif(132, 290, false);
const L1 = 'Tahimik';
const L2 = 'pero ako ’to';

export default class Intro extends Scene {
  render(f: Frame, out: RT): Post {
    const t = f.t;
    const A = this.audio;
    const bar = (k: number) => A.timeOfBar(k); // bar 0 = first downbeat (1.55 s)
    const b8 = (k: number, i: number) => A.timeOfBeat(A.beatAt(bar(k)) + i * 0.5);
    const cut = this.params.next as number;

    // the full stop of the title = where the firefly lands
    const w2 = layout(L2, T2).w;
    const dot = { x: X + w2 + 22, y: Y2 - 12 };
    const home = { x: SELF.x, y: SELF.y - SELF.h * 0.58 };

    // firefly path: in from the right on bar 0, wander, land on the stop at bar 3,
    // then drop into the self's chest just before the cut
    const land = bar(3), leave = land + A.period(land) * 1.2;
    const pIn = prog(t, bar(0) - 0.4, land, ease.inOutSine);
    const wob = Math.pow(1 - pIn, 0.8);
    let fx = lerp(1780, dot.x, pIn) + 160 * wob * noise1(t * 0.31, 5);
    let fy = lerp(360, dot.y, ease.inOutQuad(pIn)) + 90 * wob * noise1(t * 0.43, 9);
    const pHome = prog(t, leave, cut - 0.35, ease.inOutCubic);
    fx = lerp(fx, home.x, pHome);
    fy = lerp(fy, home.y, pHome) - Math.sin(pHome * Math.PI) * 60;
    const I = 0.2 + 0.55 * prog(t, bar(0) - 0.4, bar(0) + 1.5) - 0.35 * pHome;
    const landPulse = Math.exp(-Math.max(0, t - land) / 0.35) * (t >= land ? 1 : 0);

    nightBg(out, { t, grid: 0.32 * prog(t, 0.2, bar(0), ease.inOutSine), fog: 0.4, warm: [fx, fy, I] });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();

    // registration corners tick in on bar 0, and blink on each downbeat
    const kick = A.beatPulse(t, 0.1, 4) * (t > bar(0) ? 1 : 0);
    c.globalAlpha = prog(t, bar(0), bar(0) + 0.3);
    plateCorners(c, rgba('graphite', 0.7 + 0.3 * kick));
    c.globalAlpha = 1;

    const out01 = 1 - prog(t, land + 0.2, cut - 0.2, ease.inOutSine);

    // subtitle, typed from bar 0
    typed(c, 'MGA TALA NG ISANG TAHIMIK', (t - bar(0)) * 20, X + 4, Y1 - 150, mono(14, 400, false, 4.2), rgba('ash'), 0.7 * out01);
    typed(c, 'field notes of a quiet one', (t - bar(0) - 1.4) * 22, X + 4, Y1 - 124, mono(13, 300, true, 0.6), rgba('graphite'), 0.9 * out01);

    // title letters arrive on eighth notes: "Tahimik" on bar 1, "pero ako ’to" on bar 2
    const letters = (s: string, font: typeof T1, y: number, k: number, col: string) => {
      const L = layout(s, font);
      applyFont(c, font);
      for (let i = 0; i < s.length; i++) {
        const t0 = b8(k, i * 0.5);
        const a = prog(t, t0, t0 + 0.35, ease.outCubic);
        if (a <= 0) continue;
        c.globalAlpha = a * out01;
        c.fillStyle = col;
        c.fillText(s[i], X + L.xs[i], y + (1 - a) * 14);
      }
      c.globalAlpha = 1;
    };
    letters(L1, T1, Y1, 1, rgba('paper'));
    letters(L2, T2, Y2, 2, rgba('paper', 0.92));

    // a hairline underlining the title, drawn across bar 3
    c.fillStyle = rgba('graphite', 0.8 * out01);
    c.fillRect(X, Y2 + 44, prog(t, bar(2) + 0.2, land, ease.inOutCubic) * (w2 + 40), 1);

    firefly(g, fx, fy, { I: clamp(I) * (1 + 0.8 * landPulse), r: 1 + 0.35 * landPulse, t, seed: 3, flicker: 0.25 });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.4 }] });
    return {
      fade: 1 - prog(t, 0, 1.4, ease.outQuad),
      hud: prog(t, bar(2) + 1, bar(3) + 0.5),
      vignette: 0.45,
    };
  }
}
