// Timeline evaluation: which entries are live at t, crossfades between them, forward-
// shutter motion blur, HUD, post. render(t) is a pure function of t (and settings).

import type { AudioData } from './audio';
import { FPS, ONLY, PH, PW } from './config';
import { clearRT, gl, makeRT, Pass, type RT } from './gl';
import { HUD } from './hud';
import type { Lyrics } from './lyrics';
import { lerpPost, PostFX, resolvePost, type ResolvedPost } from './post';
import { SlotPool, type Entry, type Frame, type Scene, type SceneClass } from './scene';
import { frameIdx, smoothstep } from './util';

export type Registry = Record<string, () => Promise<{ default: SceneClass }>>;

const HUD_OVER = /* glsl */ `
uniform sampler2D uTex;
void main() { fragColor = texture(uTex, vUv); }`;

export class Engine {
  scenes: (Scene | null)[] = [];
  pool = new SlotPool();
  fx!: PostFX;
  hud!: HUD;
  errors: string[] = [];
  private sceneRT!: RT;
  private accum!: RT;
  private slotRT: RT[] = [];
  private hudPass!: Pass;
  private failed = new Set<string>();

  constructor(
    public entries: Entry[],
    public lyrics: Lyrics,
    public audio: AudioData,
    public liwanag: (t: number) => number,
  ) {}

  async init(reg: Registry) {
    this.fx = new PostFX();
    this.hud = new HUD(this.audio, this.liwanag);
    this.hudPass = new Pass(HUD_OVER);
    this.sceneRT = makeRT();
    this.accum = makeRT();
    this.slotRT = [makeRT(), makeRT()];
    for (const [i, e] of this.entries.entries()) {
      if (ONLY.length && !ONLY.includes(e.scene)) {
        this.scenes.push(null);
        continue;
      }
      const load = reg[e.scene];
      if (!load) {
        this.fail(i, new Error(`no scene module "${e.scene}"`));
        this.scenes.push(null);
        continue;
      }
      const mod = await load();
      const s = new mod.default({
        name: e.scene, entry: e, start: e.start, end: e.end, params: e.params,
        lyrics: this.lyrics, audio: this.audio, pool: this.pool, liwanag: this.liwanag,
      });
      try {
        await s.init();
      } catch (err) {
        this.fail(i, err);
      }
      this.scenes.push(s);
    }
  }

  private fail(i: number, err: unknown) {
    const e = this.entries[i];
    const msg = `[scene ${e.scene} @${e.start.toFixed(2)}] ${err instanceof Error ? err.stack || err.message : err}`;
    if (!this.failed.has(msg)) {
      this.failed.add(msg);
      this.errors.push(msg);
      console.error(msg);
    }
  }

  /** indices of live entries at t, oldest first (at most the last two) */
  active(t: number): number[] {
    const out: number[] = [];
    this.entries.forEach((e, i) => {
      if (this.scenes[i] && e.start <= t && t < e.end) out.push(i);
    });
    return out.slice(-2);
  }

  /** the entry the HUD labels: the newest one once its crossfade is half done */
  current(t: number): Entry | undefined {
    let cur: Entry | undefined;
    for (const e of this.entries) if (e.start + e.xf / 2 <= t) cur = e;
    return cur ?? this.entries[0];
  }

  private frameAt(i: number, t: number, frame: number, tin: number, under: RT | null): Frame {
    const e = this.entries[i];
    const A = this.audio;
    return {
      t, lt: t - e.start, p: (t - e.start) / (e.end - e.start),
      beat: A.beatAt(t), bar: A.barAt(t), beatPhase: A.beatPhase(t), barPhase: A.barPhase(t),
      frame, tin, under,
    };
  }

  private run(i: number, f: Frame, out: RT, slot: number): ResolvedPost {
    this.pool.slot = slot;
    try {
      return resolvePost(this.scenes[i]!.render(f, out));
    } catch (err) {
      this.fail(i, err);
      clearRT(out, [0.25, 0.0, 0.02]);
      return resolvePost();
    }
  }

  /** render the scene stack at t into `out` (linear HDR); returns post settings */
  composite(t: number, out: RT, frame: number): ResolvedPost {
    const act = this.active(t);
    if (!act.length) {
      clearRT(out);
      return resolvePost({ hud: 0 });
    }
    if (act.length === 1) return this.run(act[0], this.frameAt(act[0], t, frame, 1, null), out, 0);
    const [a, b] = act;
    const A = this.entries[a], B = this.entries[b];
    const tin = smoothstep(B.start, Math.max(B.start + 1e-3, A.end), t);
    const pa = this.run(a, this.frameAt(a, t, frame, 1, null), this.slotRT[0], 0);
    let pb: ResolvedPost;
    if (this.scenes[b]!.handlesTransition) {
      pb = this.run(b, this.frameAt(b, t, frame, tin, this.slotRT[0]), out, 1);
    } else {
      pb = this.run(b, this.frameAt(b, t, frame, tin, null), this.slotRT[1], 1);
      this.fx.mixPass.draw(out, { uA: this.slotRT[0], uB: this.slotRT[1], uT: tin });
    }
    return lerpPost(pa, pb, tin);
  }

  /**
   * Final frame to the canvas. samples > 1 accumulates sub-frames over a forward
   * shutter of `shutter` × frame duration (sample 0 is exactly t).
   */
  render(t: number, samples = 1, shutter = 0.5): ResolvedPost {
    const frame = frameIdx(t);
    let post: ResolvedPost;
    let src: RT;
    if (samples <= 1) {
      post = this.composite(t, this.sceneRT, frame);
      src = this.sceneRT;
    } else {
      clearRT(this.accum, [0, 0, 0], 1);
      post = resolvePost();
      for (let s = 0; s < samples; s++) {
        const p = this.composite(t + ((s / samples) * shutter) / FPS, this.sceneRT, frame);
        if (s === 0) post = p;
        this.fx.accumPass.draw(this.accum, { uSrc: this.sceneRT, uW: 1 / samples }, 'add');
      }
      src = this.accum;
    }
    this.fx.run(src, post, frame);
    const hl = this.hud.draw(t, post, this.current(t));
    if (hl) this.hudPass.draw(null, { uTex: hl.upload() }, 'over');
    return post;
  }

  /** RGBA8 bottom-up pixels of the last rendered frame */
  read(buf?: Uint8Array): Uint8Array {
    const out = buf ?? new Uint8Array(PW * PH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}
