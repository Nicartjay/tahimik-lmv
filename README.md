# Tahimik Pero Ako ’To — lyric music video

A code-rendered lyric video: every frame is a pure function of time, word-synced to the
vocal and driven by the song's own analysis (beats, stems, loudness). It previews live in
the browser and renders offline, frame by frame, through headless Chrome into ffmpeg.

The film is a set of *field notes of a quiet person* — plates labelled `TALA 00 … 19`,
drawn like a notebook: hairlines, callouts, rulers, a graph-paper grid. One warm light,
an alitaptap (firefly) in the protagonist's chest, grows from 0.02 to 1.00 across the
song (the `LIWANAG` meter). See [docs/TREATMENT.md](docs/TREATMENT.md) for the plate by
plate treatment and [docs/ENGINE.md](docs/ENGINE.md) for how the renderer works.

## Requirements

- Node ≥ 23.6 (runs `scripts/render.ts` as native TypeScript), npm
- Google Chrome (the renderer drives the system install via playwright-core)
- ffmpeg with libx264 on `PATH`
- For re-running the analysis only: [uv](https://docs.astral.sh/uv/) and Python 3.12

The song is included at `audio/Tahimik.mp3` (© the artist; published here for the video
project — please don't reuse it without permission).

## Preview

```sh
cd app
npm install
npm run dev          # http://localhost:5173
```

URL options: `?t=42.5` start time · `?only=dami,sulok` load only some scenes ·
`?scale=2` render at 4K · `?fps=30`.

| key | |
|---|---|
| space | play / pause |
| ← / → | ±2 s (shift: ±10 s) |
| , / . | previous / next frame |
| [ / ] | previous / next plate |
| 1–9 | motion-blur samples in preview |
| g | layout guides (margins, HUD boxes, thirds) |

## Render

```sh
cd app
node scripts/render.ts                              # full video → out/tahimik.mp4 (1080p60)
node scripts/render.ts --from 40 --to 60            # a range   → out/tahimik_40-60.mp4
node scripts/render.ts stills --t 12,45.5,206.9     # PNG stills → out/stills/
node scripts/render.ts sheet --n 24                 # contact sheet → out/sheet.png
node scripts/render.ts bench                        # ms/frame for every plate and crossfade
```

A full 4-sample render takes roughly 12 minutes on an M4.

Options: `--scale 2` (4K), `--fps`, `--samples` (motion-blur sub-frames, default 4 for
video, 1 for stills), `--shutter 0.5`, `--crf 16`, `--preset slow`, `--only a,b`,
`--out path`, `--headed`. The renderer refuses to run on a software GL backend unless
`--allow-swiftshader` is passed.

## Analysis (optional)

`data/audio.json` and `data/lyrics.json` are committed, so this is only needed if the
song or lyrics change.

```sh
cd analysis
uv sync
uv run python separate.py   # Demucs stems → analysis/stems/
uv run python analyze.py    # beats, downbeats, onsets, envelopes → data/audio.json
uv run python align.py      # word/char timings from lyrics/Tahimik.lrc → data/lyrics.json
```

## Layout

```
audio/            the song
lyrics/           Tahimik.lrc — line timings
analysis/         Python: stem separation, beat/onset analysis, forced alignment
data/             analysis output consumed by the app
app/
  src/engine/     WebGL2 renderer, post, karaoke, HUD, timeline evaluation
  src/scenes/     one file per plate; _motifs.ts is the shared visual vocabulary
  src/timeline.ts the cut list, anchored to lyric lines and snapped to beats
  scripts/        render.ts — headless Chrome → ffmpeg
docs/             treatment and engine notes
```

Fonts: Fraunces, Archivo and IBM Plex Mono, under the SIL Open Font License
(`app/public/fonts/OFL-*.txt`).
