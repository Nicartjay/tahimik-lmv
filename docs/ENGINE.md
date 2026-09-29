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

## The music video (`?film=mv`)

`films.ts` picks the film. `lmv`, the lyric video above, is the default. `mv` loads
`src/mv/`, which has its own registry, its own timeline and no HUD. Both films share the
engine, the analysis and the export. Running `node scripts/render.ts … --film mv` writes
`out/tahimik_mv*.mp4`, `out/mv/stills/` and `out/mv/sheet.png`.

### 3D layer — `engine/3d/`

- **`camera.ts`** turns an authored `Cam` (eye, target, roll, fov) into a `Basis`
  (eye, R/U/F, focal length in logical px). The same basis drives every shader, so rays,
  lines, points and words register exactly. It also has helpers:
  - `orbit`, `lerpCam` (zoom in log space) and `handheld`, which is `noise1` keyed to
    `frameIdx`
  - a shot list with snaps, whips and dutch kicks
- **`geo.ts`** (`GeoPass`) draws one instanced quad per instance from an interleaved
  attribute buffer. It keeps its own VAO and restores the empty one that fullscreen
  passes rely on.
- **`lines.ts`** (`LineBatch`) draws segments as screen-space capsules, sized in logical
  px (> 0) or world units (< 0). Hairlines under 0.7 px keep their light instead of
  shimmering. Two GLSL hooks animate a static batch on the GPU:
  `warp(p, data, end)` and `tint(col, p, data)`. Each segment has a free `vec4` of data.
  Blending is `add`, `max` or premultiplied `over`, with depth fog.
- **`points.ts`** (`GlowPoints`) draws Gaussian sprites for fireflies and dust, with the
  same hooks as `LineBatch`, plus near-fade and occlusion.
- **`words.ts`** (`Words`) draws kinetic hero words. Glyphs are rasterised once into a
  mip-mapped atlas and drawn as one 3D quad per glyph, kerned by `fonts.ts`, so a word
  can fly past, orbit or break apart.
- **`sdf.glsl.ts`** has the raymarching chunks: the camera ray, 3D noise, SDFs, a sphere
  tracer, normals, AO, soft shadows and analytic glow.

A raymarched pass writes view depth into `.a` of its RT, with 1e4 for background. Lines,
points and words take that RT as `depth` and are occluded by it.

### Adaptive motion blur — `engine/sampler.ts`

When `samples` is `auto` (the default for an mv video), each frame averages its forward
shutter over nested sample sets: 4 → 12 → 36 → 108. Each level keeps the previous one's
samples and reuses its sum. After each level, a display-space change test runs per 2×2
block, and the loop stops once no block anywhere moves by 5 levels of 255.

A locked-off frame stops at 12 samples and a whip runs to its scene's `maxSamples`
(default 108). Post settings come from the first sample, so a frame never depends on
where the loop stopped. Cuts sit exactly on frame boundaries, so a shutter never
straddles one. NaN and Inf sub-frames are dropped.

Only the scene is blurred. Post shake and zoom are not, so every fast move in the music
video is a camera move inside the scene.

### MV kits — `src/mv/scenes/_*.ts`

| kit | what it holds |
|---|---|
| `_labas` | The outer world in cool line art: sky, ground grid, posable line figures (`figure`, `POSE`, `walk`), crowds that bob on the beat (`Crowd`, `scatter`), and props (building, stage, boxes). |
| `_loob` | The inner world: one raymarcher with a swelling sea (heightfield secant trace), floating islands, a night-to-dawn sky, haze and the firefly light (`Loob`). Also `Flies`, a closed-form field of thousands of fireflies. |
| `_self` | The protagonist: a line figure with the firefly in the chest. `chest()` is the point every dive passes through, and `lightOf(LIWANAG)` sets its brightness. |
| `_fx` | Hit pulses (`impact`: flash, CA, shake keyed to the frame), `mergePost`, beat and bar lists, `Fill`, the dive curves with `DIVE_COL`/`towardDive` for match cuts, and a shockwave warp chunk. |
