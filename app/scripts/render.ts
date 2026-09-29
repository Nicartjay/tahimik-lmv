// Offline renderer: Vite dev server + headless system Chrome (real GPU) + ffmpeg.
//
//   node scripts/render.ts                         full video  → out/tahimik.mp4
//   node scripts/render.ts --from 40 --to 60       a range     → out/tahimik_40-60.mp4
//   node scripts/render.ts stills --t 12,45.5      PNG stills  → out/stills/
//   node scripts/render.ts sheet --n 24 [--from --to | --t a,b,c]  contact sheet → out/sheet.png
//   node scripts/render.ts bench [--samples 4] [--t a,b,c]   ms/frame per plate and per crossfade
//
//   --film mv       the music video instead of the lyric video (outputs tahimik_mv*.mp4,
//                   out/mv/stills, out/mv/sheet.png)
//   --samples N     fixed sub-frames per frame; 'auto' = adaptive (default for mv video)
//
// Frames leave the page as raw RGBA (bottom-up) via POST /__frame, are re-ordered here
// and piped to ffmpeg's stdin; the song is muxed from ../audio.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createServer, type Plugin } from 'vite';

const app = fileURLToPath(new URL('..', import.meta.url));
const root = join(app, '..');
const SONG = join(root, 'audio', 'Tahimik.mp3');

const { positionals, values: V } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    fps: { type: 'string', default: '60' },
    scale: { type: 'string', default: '1' },
    samples: { type: 'string' },
    shutter: { type: 'string', default: '0.5' },
    crf: { type: 'string', default: '16' },
    preset: { type: 'string', default: 'slow' },
    only: { type: 'string' },
    t: { type: 'string' },
    film: { type: 'string', default: 'lmv' },
    n: { type: 'string', default: '24' },
    cols: { type: 'string', default: '4' },
    tile: { type: 'string', default: '480' },
    out: { type: 'string' },
    headed: { type: 'boolean', default: false },
    'allow-swiftshader': { type: 'boolean', default: false },
  },
});
const mode = positionals[0] ?? 'video';
if (!['video', 'stills', 'sheet', 'bench'].includes(mode)) {
  console.error(`unknown mode "${mode}" (video | stills | sheet | bench)`);
  process.exit(2);
}
const num = (s: string | undefined, d: number) => (s === undefined ? d : Number(s));
const fps = num(V.fps, 60), scale = num(V.scale, 1);
const film = V.film!;
const mv = film !== 'lmv';
const samples: number | 'auto' =
  V.samples === 'auto' ? 'auto' : V.samples !== undefined ? Number(V.samples) : mode !== 'video' ? 1 : mv ? 'auto' : 4;
const shutter = num(V.shutter, 0.5);

// ---- frame sink -------------------------------------------------------------

type Sink = (i: number, buf: Buffer) => Promise<void>;
let sink: Sink | null = null;

const frameSink = (): Plugin => ({
  name: 'tahimik-frame-sink',
  configureServer(server) {
    server.middlewares.use('/__frame', (req, res) => {
      const i = Number(req.headers['x-frame']);
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', async () => {
        try {
          if (!sink) throw new Error('no sink');
          await sink(i, Buffer.concat(chunks));
          res.statusCode = 204;
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
        }
        res.end();
      });
    });
  },
});

function orderedWriter(ff: ChildProcess, frameBytes: number): Sink {
  const pending = new Map<number, Buffer>();
  let next = 0;
  return async (i, buf) => {
    if (buf.length !== frameBytes) throw new Error(`frame ${i}: ${buf.length} bytes, expected ${frameBytes}`);
    pending.set(i, buf);
    while (pending.has(next)) {
      const b = pending.get(next)!;
      pending.delete(next);
      next++;
      if (!ff.stdin!.write(b)) await once(ff.stdin!, 'drain');
    }
  };
}

// ---- main -------------------------------------------------------------------

const server = await createServer({
  root: app,
  configFile: join(app, 'vite.config.ts'),
  plugins: [frameSink()],
  // no HMR / watching: a file saved mid-render must never reload the page under us
  server: { port: 0, strictPort: false, hmr: false, watch: null },
  logLevel: 'warn',
});
await server.listen();
const addr = server.httpServer!.address();
const port = typeof addr === 'object' && addr ? addr.port : 5173;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !V.headed,
  args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  const s = m.text();
  if (m.type() === 'error' || s.startsWith('[export]')) console.log(m.type() === 'error' ? `[page:error] ${s}` : s);
});
page.on('pageerror', (e) => console.error('[pageerror]', e));

let code = 0;
try {
  const qs = new URLSearchParams({ export: '1', fps: String(fps), scale: String(scale) });
  if (V.only) qs.set('only', V.only);
  if (mv) qs.set('film', film);
  await page.goto(`http://localhost:${port}/?${qs}`);
  await page.waitForFunction(() => (window as any).__tahimikReady || (window as any).__tahimikError, null, { timeout: 180_000 });
  const err = await page.evaluate(() => (window as any).__tahimikError);
  if (err) throw new Error(err);
  const info = await page.evaluate(() => {
    const a = (window as any).__tahimik;
    return { renderer: a.renderer as string, duration: a.duration as number, size: a.size as [number, number], errors: a.errors as string[] };
  });
  console.log(`renderer: ${info.renderer}`);
  if (/swiftshader|llvmpipe|software/i.test(info.renderer) && !V['allow-swiftshader'])
    throw new Error('software GL renderer; pass --allow-swiftshader to render anyway (slow)');
  if (info.errors.length) throw new Error('scene init errors:\n' + info.errors.join('\n'));

  const from = num(V.from, 0);
  const to = Math.min(num(V.to, info.duration), info.duration);
  const outDir = join(root, 'out');
  const filmDir = mv ? join(outDir, film) : outDir;
  const base = mv ? `tahimik_${film}` : 'tahimik';
  mkdirSync(outDir, { recursive: true });

  if (mode === 'stills') {
    const ts = (V.t ?? '').split(',').filter(Boolean).map(Number);
    if (!ts.length) throw new Error('stills: pass --t 12,34.5,…');
    const dir = V.out ?? join(filmDir, 'stills');
    mkdirSync(dir, { recursive: true });
    for (const t of ts) {
      const url: string = await page.evaluate(([t, s, sh]) => (window as any).__tahimik.still(t, s, sh), [t, samples, shutter]);
      const file = join(dir, `t${t.toFixed(2).padStart(6, '0')}.png`);
      writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log(file);
    }
  } else if (mode === 'sheet') {
    const n = num(V.n, 24);
    const ts = V.t ? V.t.split(',').map(Number) : Array.from({ length: n }, (_, i) => from + ((i + 0.5) * (to - from)) / n);
    const url: string = await page.evaluate(
      ([ts, cols, tile, s]) => (window as any).__tahimik.sheet(ts, cols, tile, s),
      [ts, num(V.cols, 4), num(V.tile, 480), samples] as const,
    );
    const file = V.out ?? join(filmDir, 'sheet.png');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log(file);
  } else if (mode === 'bench') {
    // default: the middle of every plate and the centre of every crossfade
    const entries: { start: number; end: number }[] = await page.evaluate(() => (window as any).__tahimik.entries);
    const ts = V.t
      ? V.t.split(',').map(Number)
      : entries.flatMap((e, i) => [(e.start + e.end) / 2, ...(i ? [e.start + (entries[i - 1].end - e.start) / 2] : [])]).sort((a, b) => a - b);
    const rows: { t: number; label: string; live: number; render: number; read: number; samples: number; trace: number[] }[] = await page.evaluate(
      ([ts, s]) => (window as any).__tahimik.bench(ts, s),
      [ts, samples] as const,
    );
    let sum = 0, ns = 0;
    for (const r of rows) {
      sum += r.render + r.read;
      ns += r.samples;
      const ss = samples === 'auto' ? `  ${r.samples.toFixed(0).padStart(3)} samples  Δ ${r.trace.join(' ')}` : '';
      console.log(`${r.t.toFixed(2).padStart(7)}  ${r.live === 2 ? '×' : ' '} ${r.label.padEnd(26)} ${r.render.toFixed(1).padStart(7)} ms  read ${r.read.toFixed(1)} ms${ss}`);
    }
    const avg = sum / rows.length;
    const at = samples === 'auto' ? `auto (mean ${(ns / rows.length).toFixed(1)})` : samples;
    console.log(`mean ${avg.toFixed(1)} ms/frame @ ${at} samples → ~${((avg * info.duration * fps) / 60000).toFixed(0)} min for the song at ${fps} fps (before encode)`);
  } else {
    const [w, h] = info.size;
    const file = V.out ?? join(outDir, from === 0 && to === info.duration ? `${base}.mp4` : `${base}_${from}-${to}.mp4`);
    const dur = to - from;
    const audioIn = existsSync(SONG) ? ['-ss', String(from), '-t', String(dur), '-i', SONG] : [];
    if (!audioIn.length) console.warn('audio/Tahimik.mp3 not found: rendering silent video');
    const args = [
      '-hide_banner', '-loglevel', 'warning', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0',
      ...audioIn,
      '-map', '0:v', ...(audioIn.length ? ['-map', '1:a'] : []),
      '-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-c:v', 'libx264', '-preset', V.preset!, '-crf', V.crf!, '-tune', 'film',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      ...(audioIn.length ? ['-c:a', 'aac', '-b:a', '320k'] : []),
      '-t', String(dur), '-movflags', '+faststart', file,
    ];
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    const exited = once(ff, 'exit');
    sink = orderedWriter(ff, w * h * 4);
    console.log(`rendering ${from.toFixed(2)}–${to.toFixed(2)} s @ ${fps} fps, ${w}×${h}, ${samples} samples → ${file}`);
    const t0 = Date.now();
    const n: number = await page.evaluate(
      ([a, b, s, sh]) => (window as any).__tahimik.exportRange(a, b, s, sh),
      [from, to, samples, shutter],
    );
    ff.stdin!.end();
    const [c] = await exited;
    if (c !== 0) throw new Error(`ffmpeg exited ${c}`);
    console.log(`done: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${file}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  code = 1;
} finally {
  await browser.close();
  await server.close();
}
process.exit(code);
