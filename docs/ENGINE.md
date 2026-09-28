# Engine

TypeScript + raw WebGL2, no framework. Everything lives in `app/src/engine/`.

## Determinism

`Engine.render(t)` is a pure function of `t`. Scenes keep no state between frames; any
randomness comes from seeded helpers (`hash`, `noise1`, `fbm1`, `mulberry32` in
`util.ts`). The preview and the offline render therefore produce the same frame for the
same time, and any frame can be rendered in isolation (`stills`, `sheet`).

## Frame pipeline

```
timeline entries live at t (≤ 2)
  └─ scene.render(frame, rt)        per scene, into an RGBA16F linear-HDR target
       ├─ shader grounds            nightBg / paperBg (_motifs.ts)
       └─ Canvas2D layers           uploaded premultiplied sRGB, linearised, composed
  └─ crossfade                      mix(A, B, smoothstep(B.start, A.end)) — or the
                                    incoming scene composites itself (handlesTransition)
  └─ motion blur                    `samples` sub-frames over a forward shutter,
                                    accumulated; sample 0 is exactly t
  └─ PostFX                         bloom (7-level down/up chain, soft-knee threshold 1.0),
                                    warm halation, CA, exposure, vignette, flash, fade,
                                    shoulder tonemap, lin→sRGB, film grain, dither
  └─ HUD                            drawn after post in sRGB (unaffected by zoom/shake)
```

Scenes return a partial `Post` (`scene.ts`); the two live posts are lerped during a
crossfade. Only light above 1.0 blooms, so warm light is reserved for the firefly: it is
drawn on an *additive* layer composed with gain ≈ 2.2–2.4, and every other element stays
below the threshold.

## Timeline

`timeline.ts` lists the plates. Each cut is anchored to a lyric line and snapped to the
beat before its first sung word; crossfades are centred on the cut and measured in beats.
An entry spans `cut − xf/2 … next + xf′/2` and receives `params.cut` / `params.next`, plus
any per-use params (`v` for the repeated chorus plates). `LIWANAG`, the firefly's light,
is a keyframe curve over the song defined in the same file.

## Audio and lyrics

- `audio.ts` reads `data/audio.json`: a non-uniform beat grid (`beatAt`, `timeOfBeat`,
  `barAt`, `timeOfBar`, `beatPulse`), onset events per stem (`hit('kick' | 'snare' | 'hat' |
  'vocal', t)`) and 60 fps envelopes (`env('vocals' | 'drums' | 'bass' | …, t)`).
- `lyrics.ts` reads `data/lyrics.json`: lines → words → characters with start/end times
  from forced alignment. `karaoke.ts` draws lines with per-glyph appearance, sung/unsung
  alpha and a heat tint that decays after each word.

## Scenes

A scene is `app/src/scenes/<name>.ts` exporting a default `Scene` subclass; files starting
with `_` are helpers and are not registered. Layers (`this.layer(i)`) and render targets
(`this.rt(i)`) come from a per-slot pool, so two scenes crossfading never share buffers.
`?only=<names>` (preview) or `--only` (render) loads just those scenes.

## Export

`scripts/render.ts` starts a Vite server, opens it in headless system Chrome on the real
GPU (ANGLE/Metal on macOS) and calls `window.__tahimik.exportRange`. The page renders each
frame, reads the pixels and POSTs raw RGBA to `/__frame` with up to four requests in
flight; the server re-orders them and streams them into ffmpeg (`vflip`, bt709, libx264,
AAC 320k muxed from `audio/Tahimik.mp3`).

The POST body must be a `Blob`: Chrome uploads a typed-array body at ~30 MB/s (3 fps at
1080p) and a Blob at >1 GB/s. With that, the full 4-sample 1080p60 export averages ~9.5 fps
on an M4 (12 895 frames in 23 min), with ffmpeg's x264 `slow` encode of the grain using
~9 cores; `node scripts/render.ts bench` prints the per-plate render cost if a scene gets
heavy.
