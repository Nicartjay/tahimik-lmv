import audioUrl from '../../data/audio.json?url';
import lyricsUrl from '../../data/lyrics.json?url';
import { AudioData, type AudioJSON } from './engine/audio';
import { EXPORT, FILM, FPS, H, PH, PW, W } from './engine/config';
import { Engine } from './engine/engine';
import { loadFonts } from './engine/fonts';
import { gl, initGL, rendererInfo } from './engine/gl';
import { Lyrics } from './engine/lyrics';
import { films } from './films';

const q = new URLSearchParams(location.search);

/** sub-frames per frame: a fixed count, or 'auto' (adaptive, see engine/sampler.ts) */
type Samples = number | 'auto';
const canvas = document.getElementById('out') as HTMLCanvasElement;

async function boot() {
  initGL(canvas);
  const [aj, lj] = await Promise.all([
    fetch(audioUrl).then((r) => r.json() as Promise<AudioJSON>),
    fetch(lyricsUrl).then((r) => r.json()),
    loadFonts(),
  ]);
  const audio = new AudioData(aj);
  const lyrics = new Lyrics(lj);
  const load = films[FILM];
  if (!load) throw new Error(`unknown film "${FILM}" (${Object.keys(films).join(' | ')})`);
  const film = await load();
  const tl = film.buildTimeline(lyrics, audio);
  const engine = new Engine(tl.entries, lyrics, audio, tl.liwanag, { hud: film.hud });
  await engine.init(film.registry);
  exposeApi(engine);
  if (!EXPORT) preview(engine);
}

// ---------------------------------------------------------------------------
// headless API (scripts/render.ts drives this through playwright)

function exposeApi(engine: Engine) {
  const api = {
    renderer: rendererInfo(),
    film: FILM,
    duration: engine.audio.duration,
    entries: engine.entries.map((e) => ({ scene: e.scene, label: e.label, start: e.start, end: e.end })),
    errors: engine.errors,
    size: [PW, PH],

    still(t: number, samples: Samples = 1, shutter = 0.5): string {
      engine.render(t, samples, shutter);
      return canvas.toDataURL('image/png');
    },

    sheet(times: number[], cols = 4, tileW = 480, samples: Samples = 1): string {
      const tileH = Math.round((tileW * H) / W);
      const cap = 26;
      const rows = Math.ceil(times.length / cols);
      const sc = document.createElement('canvas');
      sc.width = cols * tileW;
      sc.height = rows * (tileH + cap);
      const c = sc.getContext('2d')!;
      c.fillStyle = '#050507';
      c.fillRect(0, 0, sc.width, sc.height);
      c.font = '400 12px "Plex Mono", monospace';
      times.forEach((t, i) => {
        engine.render(t, samples);
        const x = (i % cols) * tileW, y = Math.floor(i / cols) * (tileH + cap);
        c.drawImage(canvas, x, y, tileW, tileH);
        c.fillStyle = '#9A9EA6';
        const e = engine.current(t);
        c.fillText(`${t.toFixed(2)}s  ${e?.label ?? ''}`, x + 8, y + tileH + 17);
      });
      return sc.toDataURL('image/png');
    },

    /** ms per frame at each t, GPU-synced: render (scenes + post + HUD) and readPixels */
    bench(times: number[], samples: Samples = 1, reps = 4) {
      const buf = new Uint8Array(PW * PH * 4), px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return times.map((t) => {
        engine.render(t, samples);
        sync();
        let render = 0, read = 0, n = 0;
        for (let k = 1; k <= reps; k++) {
          const a = performance.now();
          engine.render(t + k / FPS, samples);
          sync();
          const b = performance.now();
          engine.read(buf);
          render += b - a;
          read += performance.now() - b;
          n += engine.lastSamples;
        }
        return {
          t, label: engine.current(t)?.label ?? '', live: engine.active(t).length,
          render: render / reps, read: read / reps, samples: n / reps, trace: engine.sampler?.trace ?? [],
        };
      });
    },

    /** render frames [from, to) and POST them in order to /__frame; returns frame count */
    async exportRange(from: number, to: number, samples: Samples = 1, shutter = 0.5): Promise<number> {
      const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
      const n = f1 - f0;
      const RING = 4;
      const bufs = Array.from({ length: RING }, () => new Uint8Array(PW * PH * 4));
      const inflight: Promise<unknown>[] = Array(RING).fill(Promise.resolve());
      const t0 = performance.now();
      let used = 0;
      for (let i = 0; i < n; i++) {
        const k = i % RING;
        await inflight[k];
        engine.render((f0 + i) / FPS, samples, shutter);
        used += engine.lastSamples;
        engine.read(bufs[k]);
        // a Blob body, not the typed array: Chrome streams an ArrayBufferView upload at ~30 MB/s,
        // a Blob at >1 GB/s (and the Blob's copy frees bufs[k] for reuse straight away)
        inflight[k] = fetch('/__frame', {
          method: 'POST',
          headers: { 'x-frame': String(i), 'content-type': 'application/octet-stream' },
          body: new Blob([bufs[k]]),
        }).then((r) => {
          if (!r.ok) throw new Error(`frame ${i}: HTTP ${r.status}`);
        });
        // a sent frame's Blob is only released when its (tiny) JS wrapper is collected, and a
        // render loop makes too little JS garbage for V8 to bother: in a headless browser, which
        // can't page blobs to disk, they pile up to ERR_BLOB_OUT_OF_MEMORY within a few seconds
        if (i % 30 === 29) (globalThis as { gc?: () => void }).gc?.();
        if (i % 120 === 0 || i === n - 1) {
          const el = (performance.now() - t0) / 1000;
          const ss = samples === 'auto' ? `  ${(used / (i + 1)).toFixed(1)} samples/frame` : '';
          console.log(`[export] ${i + 1}/${n}  ${((i + 1) / el).toFixed(1)} fps  eta ${(((n - i - 1) * el) / (i + 1)).toFixed(0)}s${ss}`);
        }
        if (engine.errors.length) throw new Error(engine.errors.join('\n'));
      }
      await Promise.all(inflight);
      return n;
    },
  };
  (window as any).__tahimik = api;
  (window as any).__tahimikReady = true;
}

// ---------------------------------------------------------------------------
// interactive preview

function preview(engine: Engine) {
  const el = new Audio('/media/Tahimik.mp3');
  el.preload = 'auto';
  const dur = engine.audio.duration;
  const $ = (id: string) => document.getElementById(id)!;
  const scrub = $('scrub'), info = $('info'), playBtn = $('play');

  let t = Number(q.get('t') ?? load('t') ?? 0);
  let playing = false;
  let samples: Samples = 1;
  let dragging = false;

  // scrub-bar segments at the cut points
  const head = document.createElement('div');
  head.className = 'head';
  for (const e of engine.entries) {
    const cut = e.params.cut as number, next = e.params.next as number;
    const s = document.createElement('div');
    s.className = 'seg';
    s.style.left = `${(cut / dur) * 100}%`;
    s.style.width = `${((next - cut) / dur) * 100}%`;
    s.textContent = e.label;
    s.title = `${e.label}  ${cut.toFixed(2)}s`;
    scrub.appendChild(s);
  }
  scrub.appendChild(head);

  const seek = (x: number) => {
    t = Math.max(0, Math.min(dur - 1e-3, x));
    if (playing) el.currentTime = t;
  };
  const toggle = () => {
    playing = !playing;
    if (playing) {
      el.currentTime = t;
      el.play().catch(() => (playing = false));
    } else el.pause();
  };
  const fromMouse = (ev: MouseEvent) => {
    const r = scrub.getBoundingClientRect();
    seek(((ev.clientX - r.left) / r.width) * dur);
  };
  scrub.addEventListener('mousedown', (ev) => ((dragging = true), fromMouse(ev)));
  addEventListener('mousemove', (ev) => dragging && fromMouse(ev));
  addEventListener('mouseup', () => (dragging = false));
  playBtn.addEventListener('click', toggle);

  const cuts = engine.entries.map((e) => e.params.cut as number);
  addEventListener('keydown', (ev) => {
    const big = ev.shiftKey ? 10 : 2;
    if (ev.key === ' ') toggle();
    else if (ev.key === 'ArrowLeft') seek(t - big);
    else if (ev.key === 'ArrowRight') seek(t + big);
    else if (ev.key === ',') seek((Math.round(t * FPS) - 1) / FPS);
    else if (ev.key === '.') seek((Math.round(t * FPS) + 1) / FPS);
    else if (ev.key === '[') seek([...cuts].reverse().find((c) => c < t - 0.25) ?? 0);
    else if (ev.key === ']') seek(cuts.find((c) => c > t + 0.01) ?? t);
    else if (/^[1-9]$/.test(ev.key)) samples = Number(ev.key);
    else if (ev.key === '0') samples = 'auto';
    else if (ev.key === 'g') engine.hud.guides = !engine.hud.guides;
    else return;
    ev.preventDefault();
  });

  let last = performance.now(), ms = 0;
  const tick = () => {
    if (playing) {
      t = el.currentTime;
      if (el.ended) playing = false;
    }
    const a = performance.now();
    engine.render(t, samples);
    ms = ms * 0.9 + (performance.now() - a) * 0.1;
    head.style.left = `${(t / dur) * 100}%`;
    playBtn.textContent = playing ? '❚❚' : '▶';
    const e = engine.current(t);
    const bar = engine.audio.barAt(t);
    info.textContent = `${t.toFixed(2)}s  f${Math.floor(t * FPS)}  bar ${bar.toFixed(2)}  ${e?.label ?? ''}  ${ms.toFixed(1)}ms  ${samples === 'auto' ? `auto(${engine.lastSamples})` : `${samples}×`}`;
    if (engine.errors.length) info.textContent += '  ⚠ ' + engine.errors.length + ' error(s) — see console';
    if (performance.now() - last > 500) {
      save('t', t);
      last = performance.now();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// the lyric video keeps its original keys
const storeKey = (k: string) => (FILM === 'lmv' ? 'tahimik.' : `tahimik.${FILM}.`) + k;
function load(k: string): string | null {
  try {
    return localStorage.getItem(storeKey(k));
  } catch {
    return null;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(storeKey(k), String(v));
  } catch {}
}

boot().catch((err) => {
  console.error(err);
  (window as any).__tahimikError = String(err?.stack ?? err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:absolute;top:0;left:0;color:#f66;padding:16px">${err}</pre>`);
});
