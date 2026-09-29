# Tahimik Pero Ako ’To — lyric video and music video

Two code-rendered films on one song, sharing the engine, analysis and export. The lyric
video (the default, `?film=lmv`) is described first. The music video (`?film=mv`) comes
after it.

## The lyric video

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

The song is included at `audio/Tahimik.mp3` (“Tahimik” by 連太郎, © 連太郎; published here for the video
project — please don't reuse it without permission; see [Credits](#credits)).

## Preview

```sh
cd app
npm install
npm run dev          # http://localhost:5173
```

URL options: `?film=mv` the music video · `?t=42.5` start time · `?only=dami,sulok` load only some scenes ·
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

node scripts/render.ts --film mv                    # the music video → out/tahimik_mv.mp4
node scripts/render.ts sheet --film mv --n 40       # its contact sheet → out/mv/sheet.png
node scripts/render.ts bench --film mv --samples auto
node scripts/render.ts lyrics --film mv             # is every sung word legible as it is sung?
node scripts/mv-cues.mjs --only alon                # cut windows + sung words/bars per scene
```

A full 4-sample render takes about 23 minutes on an M4 and writes a ~2.7 GB master
(the film grain keeps crf 16 near 100 Mbit/s). The music video, with adaptive motion blur
averaging ~39 samples a frame, takes about 52 minutes (~4.2 fps) and writes a ~2.3 GB
master. For uploading, re-encode a delivery copy:

```sh
ffmpeg -i out/tahimik.mp4 -c:v libx264 -preset slow -tune grain -crf 18 -maxrate 16M -bufsize 32M \
  -c:a copy -movflags +faststart out/tahimik_share.mp4
```

(the same with `tahimik_mv.mp4` → `tahimik_mv_share.mp4` for the music video)

Options:

- `--film mv`: render the music video
- `--scale 2`: 4K
- `--fps`
- `--samples N|auto`: motion-blur sub-frames. The default is 4 for the lyric video,
  `auto` (adaptive, 4–108) for the music video, and 1 for stills.
- `--shutter 0.5`, `--crf 16`, `--preset slow`
- `--only a,b`, `--out path`, `--headed`

The renderer refuses to run on a software GL backend unless `--allow-swiftshader` is
passed.

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
  src/engine/3d/  camera, instanced lines/points/words, SDF chunks (music video)
  src/timeline.ts the cut list, anchored to lyric lines and snapped to beats
  src/films.ts    ?film=lmv | mv
  src/mv/         the music video: timeline.ts, scenes/ (_labas, _loob, _self, _fx, _lyric kits)
  scripts/        render.ts — headless Chrome → ffmpeg; mv-cues.mjs — MV cue sheets
docs/             treatment and engine notes
```

## Credits

**Song**: “Tahimik” by 連太郎. © 連太郎, all rights reserved.

**Videos**: “Tahimik Pero Ako ’To”, the lyric video and the music video, by 連太郎
([Nicartjay](https://github.com/Nicartjay)). They are rendered entirely in code, with
the code written together with [Claude Code](https://claude.com/claude-code) (Anthropic).

**Reference**: the music video's adaptive motion blur, line renderer and shot-list
camera follow Giacomo Magnanini's [p(doom) video](https://github.com/mexicat/pdoom-video)
(MIT; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

**Typefaces**, all under the SIL Open Font License 1.1 (`app/public/fonts/OFL-*.txt`):
- [Fraunces](https://github.com/undercasetype/Fraunces) by Undercase Type
- [Archivo](https://github.com/Omnibus-Type/Archivo) by Omnibus-Type
- [IBM Plex Mono](https://github.com/IBM/plex) by IBM

**Analysis tools**:
- [Demucs](https://github.com/facebookresearch/demucs) for stem separation
- [librosa](https://librosa.org) for beats, onsets and envelopes
- torchaudio's [MMS](https://pytorch.org/audio/stable/tutorials/forced_alignment_for_multilingual_data_tutorial.html)
  model for forced alignment of the lyrics

**Rendering**:
- [Vite](https://vite.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Playwright](https://playwright.dev) driving Google Chrome
- [FFmpeg](https://ffmpeg.org) with x264
