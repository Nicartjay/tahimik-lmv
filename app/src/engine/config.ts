// Output geometry. Scenes always lay out in logical 1920×1080; SCALE multiplies
// physical pixels (2 → native 4K), never the layout.
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const W = 1920;
export const H = 1080;
export const SCALE = Math.max(1, Number(q.get('scale') ?? 1));
export const PW = W * SCALE;
export const PH = H * SCALE;
export const FPS = Number(q.get('fps') ?? 60);
export const EXPORT = q.has('export');
/** which film to play: 'lmv' (the lyric video) or 'mv' (the music video) */
export const FILM = q.get('film') ?? 'lmv';
/** only render these timeline entries (comma list of scene names), for fast isolated work */
export const ONLY = (q.get('only') ?? '').split(',').filter(Boolean);

/** safe margins: lyrics stay ≥ MARGIN from frame edges and clear the HUD corners */
export const MARGIN = 96;
export const HUD_BOX = {
  topLeft: { w: 520, h: 96 },
  bottomLeft: { w: 400, h: 132 },
  bottomRight: { w: 320, h: 104 },
};
