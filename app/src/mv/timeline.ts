// The music video's edit. The same lyric-anchored cuts as the lyric video (each on the
// beat just before its line's first sung word), but every cut is hard and sits exactly
// on a frame boundary, so the adaptive shutter never straddles one. Transitions happen
// inside the scenes: a shot pushes into the firefly as it ends, the next opens out of it.

import { FPS } from '../engine/config';
import type { AudioData } from '../engine/audio';
import { Lyrics, type Line } from '../engine/lyrics';
import type { Entry } from '../engine/scene';
import { ease, keys } from '../engine/util';
import type { Timeline } from '../timeline';

interface Cut {
  at: number;
  scene: string;
  title: string;
  params?: Record<string, any>;
}

const toFrame = (t: number) => Math.round(t * FPS) / FPS;

export function buildTimeline(L: Lyrics, A: AudioData): Timeline {
  /** last beat at or before a line's first word, on a frame boundary */
  const before = (l: Line, slack = 0.12) => toFrame(A.timeOfBeat(Math.floor(A.beatAt(l.start - slack))));
  const f = (q: string, t0 = 0) => L.find(q, t0);
  const W = (l: Line, q: string, n = 0) => Lyrics.word(l, q, n);

  const nakatayo = f('Nakatayo');
  const tawa = f('Tawa nila');
  const sagot = f('May sagot');
  const ch1 = f('Nahihiya');
  const hinga1 = f('Gusto ko lang huminga');
  const sadya1 = f('Sadyang mahiyain');
  const kahit1 = f('Pero kahit');
  const mundo1 = f('May sarili rin');
  const kwento = f('May mga kwento');
  const pinapanood = f('Pinapanood');
  const lihim = f('ngumingiti nang lihim');
  const ch2 = f('Nahihiya', 100);
  const hinga2 = f('Gusto ko lang huminga', 110);
  const sadya2 = f('Sadyang mahiyain', 120);
  const kahit2 = f('Pero kahit', 130);
  const mundo2 = f('May sarili rin', 138);
  const bridge = f('Baka isang araw');
  const hakbang = f('isang hakbang');
  const dahan = f('Pwede namang dahan-dahan');
  const echo = L.lines.find((l) => l.echo && l.start > dahan.start) ?? dahan;
  const ch3 = f('Nahihiya', 165);
  const hinga3 = f('Gusto ko lang huminga', 175);
  const sadya3 = f('Sadyang mahiyain', 185);
  const buo = f('tanggapin');
  const paraan = f('Baka sa tahimik');
  const stand = f('Mag-stand out');

  const outroAt = toFrame(A.timeOfBar(Math.ceil(A.barAt(stand.end + 1.2))));

  const cuts: Cut[] = [
    { at: 0, scene: 'simula', title: 'SIMULA' },
    { at: before(nakatayo), scene: 'gilid', title: 'GILID' },
    { at: before(tawa), scene: 'alon', title: 'ALON' },
    { at: before(sagot), scene: 'lalamunan', title: 'LALAMUNAN' },
    { at: before(ch1), scene: 'dami', title: 'DAMI NG TAO', params: { v: 1 } },
    { at: before(hinga1), scene: 'sulok', title: 'SULOK', params: { v: 1 } },
    { at: before(sadya1), scene: 'noon', title: 'SIMULA NOON', params: { v: 1 } },
    { at: before(kahit1), scene: 'mundo', title: 'SARILING MUNDO', params: { v: 1 } },
    { at: before(kwento), scene: 'bulsa', title: 'BULSA' },
    { at: before(pinapanood), scene: 'entablado', title: 'ENTABLADO' },
    { at: before(ch2), scene: 'dami', title: 'DAMI NG TAO · II', params: { v: 2 } },
    { at: before(hinga2), scene: 'sulok', title: 'SULOK · II', params: { v: 2 } },
    { at: before(sadya2), scene: 'noon', title: 'SIMULA NOON · II', params: { v: 2 } },
    { at: before(kahit2), scene: 'mundo', title: 'SARILING MUNDO · II', params: { v: 2 } },
    { at: before(bridge), scene: 'hakbang', title: 'ISANG HAKBANG' },
    { at: before(ch3), scene: 'dami', title: 'DAMI NG TAO · III', params: { v: 3 } },
    { at: before(hinga3), scene: 'sulok', title: 'SULOK · III', params: { v: 3 } },
    { at: before(sadya3), scene: 'buo', title: 'BUO' },
    { at: before(paraan), scene: 'gitna', title: 'GITNA' },
    { at: outroAt, scene: 'wakas', title: 'WAKAS' },
  ];

  const entries: Entry[] = cuts.map((c, i) => {
    const next = cuts[i + 1];
    return {
      scene: c.scene,
      start: c.at,
      end: next ? next.at : A.duration + 0.5,
      label: `${String(i).padStart(2, '0')} · ${c.title}`,
      xf: 0,
      params: { ...(c.params ?? {}), cut: c.at, next: next?.at ?? A.duration },
    };
  });

  // LIWANAG, the firefly's light, 0 → 1 across the song: the same arc as the lyric video
  // (quiet until the first "May sarili rin akong mundo", 1.00 on "ako")
  const mw = (l: Line) => W(l, 'mundo');
  const liw: [number, number, ((x: number) => number)?][] = [
    [0, 0.02],
    [mw(mundo1).start, 0.03],
    [mw(mundo1).end + 1.5, 0.12, ease.outCubic],
    [lihim.start, 0.12],
    [lihim.end + 0.8, 0.17],
    [mw(mundo2).start, 0.18],
    [mw(mundo2).end + 1.5, 0.3, ease.outCubic],
    [W(bridge, 'lakas').start, 0.3],
    [W(bridge, 'lakas').end + 0.6, 0.37],
    [W(hakbang, 'paabante').start, 0.38],
    [W(hakbang, 'paabante').end + 0.6, 0.45],
    [echo.end + 0.5, 0.5],
    [ch3.start, 0.52],
    [hinga3.end + 3, 0.62],
    [W(buo, 'buo').start, 0.64],
    [W(buo, 'buo').end + 0.8, 0.78, ease.outCubic],
    [W(paraan, 'paraan').start, 0.82],
    [W(stand, 'ako').start, 0.9],
    [W(stand, 'ako').start + 0.5, 1.0, ease.outExpo],
  ];
  return { entries, liwanag: (t) => keys(t, liw) };
}
