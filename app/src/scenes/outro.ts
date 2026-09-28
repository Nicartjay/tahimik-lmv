// TALA 19 · WAKAS — the notebook closes. The cover from the first plate returns: title
// low on the left, registration corners, a mono line. The light from GITNA drifts down
// from frame centre and becomes the title's full stop again, as it did at the start.
// Then the page grid goes, the type goes, and the full stop is the last light out.

import { MARGIN, W, H } from '../engine/config';
import { applyFont, layout, mono, serif } from '../engine/fonts';
import type { RT } from '../engine/gl';
import { typed } from '../engine/karaoke';
import { rgba } from '../engine/palette';
import { Scene, type Frame, type Post } from '../engine/scene';
import { clamp, ease, keys, lerp, noise1, prog } from '../engine/util';
import { chestI, firefly, nightBg, plateCorners } from './_motifs';

const X = MARGIN + 60;
const Y1 = 700;
const Y2 = 842;
const T1 = serif(132, 320, true);
const T2 = serif(132, 290, false);
const L1 = 'Tahimik';
const L2 = 'pero ako ’to';

export default class Outro extends Scene {
  render(f: Frame, out: RT): Post {
    const t = f.t, A = this.audio;
    const cut = this.params.cut as number;
    const D = A.duration;
    const b16 = (b: number, i: number) => A.timeOfBeat(b + i * 0.25);
    const bCut = Math.round(A.beatAt(cut));

    // the full stop, as on the cover
    const w2 = layout(L2, T2).w;
    const dot = { x: X + w2 + 22, y: Y2 - 12 };

    // the light: holds at frame centre through the crossfade (where GITNA left it),
    // then drifts down to the stop, landing on the next downbeat
    const liftOff = A.timeOfBeat(bCut + 1);
    const land = A.timeOfBar(Math.ceil(A.barAt(liftOff + 1.2)));
    const fp = prog(t, liftOff, land, ease.inOutSine);
    const wob = Math.sin(Math.PI * fp);
    const fx = lerp(W / 2, dot.x, fp) + 70 * wob * noise1(t * 0.4, 12);
    const fy = lerp(H / 2, dot.y, ease.inOutQuad(fp)) - 40 * wob + 30 * wob * noise1(t * 0.5, 14);
    const landPulse = t >= land ? Math.exp(-(t - land) / 0.35) : 0;

    // closing: grid first, then type, then the light blinks out
    const closeGrid = prog(t, D - 1.9, D - 1.0, ease.inOutSine);
    const closeType = prog(t, D - 1.4, D - 0.7, ease.inOutSine);
    const blink = keys(t, [
      [D - 0.9, 1],
      [D - 0.72, 0.35, ease.inOutSine],
      [D - 0.55, 0.95, ease.inOutSine],
      [D - 0.28, 0, ease.inOutSine],
    ]);
    const I0 = chestI(this.liwanag(t));
    const I = lerp(I0 * 1.25, 0.85, fp) * (1 + 0.8 * landPulse) * blink;
    const r = lerp(2.4, 1, ease.outCubic(fp)) + 0.35 * landPulse; // gathers itself as it lifts off

    nightBg(out, { t, grid: 0.32 * (1 - closeGrid) * prog(t, this.ctx.start, cut + 0.6), fog: 0.4, warm: [fx, fy, I] });
    const c = this.layer(0).begin();
    const g = this.layer(1).begin();
    const typeA = 1 - closeType;

    // registration corners, blinking on each downbeat as on the cover
    const kick = A.beatPulse(t, 0.1, 4);
    c.globalAlpha = prog(t, cut - 0.3, cut + 0.3) * typeA;
    plateCorners(c, rgba('graphite', 0.7 + 0.3 * kick));
    c.globalAlpha = 1;

    // the title, back on sixteenths: "Tahimik" from the cut, the rest from the next beat,
    // so the last letter arrives with the light
    const letters = (s: string, font: typeof T1, y: number, b: number, col: string) => {
      const L = layout(s, font);
      applyFont(c, font);
      for (let i = 0; i < s.length; i++) {
        const t0 = b16(b, i);
        const a = prog(t, t0, t0 + 0.3, ease.outCubic);
        if (a <= 0) continue;
        c.globalAlpha = a * typeA;
        c.fillStyle = col;
        c.fillText(s[i], X + L.xs[i], y + (1 - a) * 14);
      }
      c.globalAlpha = 1;
    };
    letters(L1, T1, Y1, bCut, rgba('paper'));
    letters(L2, T2, Y2, bCut + 1, rgba('paper', 0.92));

    c.fillStyle = rgba('graphite', 0.8 * typeA);
    c.fillRect(X, Y2 + 44, prog(t, liftOff + 0.4, land, ease.inOutCubic) * (w2 + 40), 1);

    // closing notes, where the cover's subtitle was
    const n0 = A.timeOfBeat(bCut + 2);
    typed(c, 'WAKAS NG MGA TALA', (t - n0) * 20, X + 4, Y1 - 150, mono(14, 400, false, 4.2), rgba('ash'), 0.7 * typeA);
    typed(c, 'sa tahimik kong paraan', (t - n0 - 0.6) * 24, X + 4, Y1 - 124, mono(13, 300, true, 0.6), rgba('graphite'), 0.9 * typeA);

    firefly(g, fx, fy, { I: clamp(I, 0, 1.6), r, t, seed: 3, flicker: 0.2 * fp });

    this.compose(out, { bg: null, layers: [{ l: this.layer(0) }, { l: this.layer(1), mode: 'add', gain: 2.4 }] });
    return {
      fade: prog(t, D - 0.45, D - 0.2, ease.inQuad),
      hud: 1 - prog(t, D - 2.2, D - 1.3, ease.inOutSine),
      vignette: 0.45,
      bloom: lerp(0.8, 0.55, fp),
    };
  }
}
