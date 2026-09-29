// The two films on this song share the engine, analysis and export; `?film=` picks one.
//   lmv — the lyric video (notebook plates, HUD)
//   mv  — the music video (3D worlds, kinetic words, no HUD)

import type { AudioData } from './engine/audio';
import type { Registry } from './engine/engine';
import type { Lyrics } from './engine/lyrics';
import type { Timeline } from './timeline';

export interface Film {
  registry: Registry;
  buildTimeline: (L: Lyrics, A: AudioData) => Timeline;
  hud: boolean;
}

export const films: Record<string, () => Promise<Film>> = {
  lmv: async () => {
    const [{ registry }, { buildTimeline }] = await Promise.all([import('./scenes/index'), import('./timeline')]);
    return { registry, buildTimeline, hud: true };
  },
  mv: async () => {
    const [{ registry }, { buildTimeline }] = await Promise.all([import('./mv/index'), import('./mv/timeline')]);
    return { registry, buildTimeline, hud: false };
  },
};
