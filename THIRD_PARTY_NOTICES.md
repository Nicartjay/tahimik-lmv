# Third-party notices

## p(doom) video — mexicat/pdoom-video

The music video's engine layer (`?film=mv`) follows techniques from
[mexicat/pdoom-video](https://github.com/mexicat/pdoom-video), re-implemented for this
project's raw WebGL2 renderer. The closest adaptations are:

- `app/src/engine/sampler.ts`: the adaptive motion blur. Nested ternary sample sets
  reuse each level's sum, and the loop stops when a display-space change test passes.
- `app/src/engine/3d/lines.ts`: 3D line segments drawn as one instanced quad each, with
  a screen-space capsule for anti-aliasing and hairline fade.
- `app/src/engine/3d/camera.ts`: the shot-list camera, with snaps, whips and dutch kicks.

MIT License

Copyright (c) 2026 Giacomo Magnanini

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Fonts

Fraunces, Archivo and IBM Plex Mono are used under the SIL Open Font License 1.1. The
license texts are in `app/public/fonts/OFL-*.txt`.
