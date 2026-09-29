// Prints the music video's cut windows and, for the scenes named with --only, every sung
// line and word inside each window (plus bars and LIWANAG), so a scene can be keyed to
// the song without guessing. Loads the real timeline through Vite, like the browser does.
//
//   node scripts/mv-cues.mjs                   # the cut list
//   node scripts/mv-cues.mjs --only alon,dami  # + lines, words, bars for those scenes

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const only = arg('--only')?.split(',');

const s = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { AudioData } = await s.ssrLoadModule('/src/engine/audio.ts');
  const { Lyrics } = await s.ssrLoadModule('/src/engine/lyrics.ts');
  const { buildTimeline } = await s.ssrLoadModule('/src/mv/timeline.ts');
  const data = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}`, import.meta.url), 'utf8'));
  const A = new AudioData(data('audio.json')), L = new Lyrics(data('lyrics.json'));
  const T = buildTimeline(L, A);
  const f = (x) => x.toFixed(3);
  for (const e of T.entries) {
    const next = e.params.next;
    console.log(`${e.label.padEnd(22)} ${e.scene.padEnd(10)} ${JSON.stringify(e.params.v ?? '')}  ${f(e.start)} → ${f(next)}  (${(next - e.start).toFixed(2)} s)  liw ${T.liwanag(e.start).toFixed(2)} → ${T.liwanag(next - 1e-3).toFixed(2)}`);
    if (!only?.includes(e.scene)) continue;
    const bs = [];
    for (let k = Math.ceil(A.barAt(e.start) - 1e-6); A.timeOfBar(k) < next; k++) bs.push(f(A.timeOfBar(k)));
    console.log(`    bars: ${bs.join(' ')}`);
    for (const l of L.between(e.start, next)) {
      console.log(`    ${l.echo ? '(echo) ' : ''}"${l.text}"  ${f(l.start)}–${f(l.end)}`);
      console.log(`       ${l.words.map((w) => `${w.w}@${w.start.toFixed(2)}–${w.end.toFixed(2)}`).join('  ')}`);
    }
  }
  console.log(`duration ${A.duration}`);
} finally {
  await s.close();
}
