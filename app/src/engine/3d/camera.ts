// Cameras as pure functions of t. A Cam is authored (eye, target, roll, fov); a Basis is
// what the shaders use: eye + right/up/forward and the focal length in logical px
// (1080-high frame). Shot lists give the edit its snaps, whips and dutch kicks.

import { H, W } from '../config';
import { clamp, ease, fbm1, frameIdx, hash, lerp, TAU, type Ease } from '../util';
import { add, cross, dot, len, madd, mix3, mul, norm, slerpDir, sph, sub, type V3 } from './math';

export interface Cam {
  pos: V3;
  tgt: V3;
  /** radians, positive tilts the horizon clockwise */
  roll: number;
  /** vertical field of view, degrees */
  fov: number;
}

export interface Basis {
  pos: V3;
  R: V3;
  U: V3;
  F: V3;
  /** logical px: a point 1 unit off-axis at depth 1 lands `focal` px from centre */
  focal: number;
  near: number;
}

export const cam = (pos: V3, tgt: V3, fov = 40, roll = 0): Cam => ({ pos, tgt, roll, fov });

/** eye on a sphere round `tgt`: yaw about +y from +z, pitch up from the horizon */
export const orbit = (tgt: V3, yaw: number, pitch: number, dist: number, fov = 40, roll = 0): Cam =>
  cam(add(tgt, sph(yaw, pitch, dist)), tgt, fov, roll);

export function basis(c: Cam, near = 0.05): Basis {
  const F = norm(sub(c.tgt, c.pos));
  let R = cross(F, [0, 1, 0]);
  R = len(R) < 1e-6 ? [1, 0, 0] : norm(R);
  const U0 = cross(R, F);
  const cr = Math.cos(c.roll), sr = Math.sin(c.roll);
  return {
    pos: c.pos,
    R: madd(mul(R, cr), U0, sr),
    U: madd(mul(U0, cr), R, -sr),
    F,
    focal: H / 2 / Math.tan((c.fov * Math.PI) / 360),
    near,
  };
}

/** world point → logical px (y down, for Canvas2D overlays) and view depth; null behind the eye */
export function project(b: Basis, p: V3): [number, number, number] | null {
  const v = sub(p, b.pos);
  const z = dot(v, b.F);
  if (z <= b.near) return null;
  return [W / 2 + (dot(v, b.R) * b.focal) / z, H / 2 - (dot(v, b.U) * b.focal) / z, z];
}

/** logical px per world unit at view depth z */
export const pxPerUnit = (b: Basis, z: number) => b.focal / z;

export const camUniforms = (b: Basis) => ({
  uCamPos: b.pos, uCamR: b.R, uCamU: b.U, uCamF: b.F, uFocal: b.focal, uNear: b.near,
});

/** shared by every 3D shader (vertex or fragment); needs uRes from GLSL_COMMON */
export const GLSL_CAM = /* glsl */ `
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform float uFocal, uNear;
vec3 toView(vec3 p) { vec3 v = p - uCamPos; return vec3(dot(v, uCamR), dot(v, uCamU), dot(v, uCamF)); }
// physical px of the current target per world unit at view depth z
float pxPerUnit(float z) { return uFocal * uRes.y / ${H}. / z; }
// view space → physical target px (y up, like gl_FragCoord)
vec2 viewToScreen(vec3 v) { return uRes * .5 + v.xy * pxPerUnit(v.z); }
`;

/**
 * Blend two framings. 'orbit' swings the eye round a moving target (distance and zoom in
 * log space); 'pan' keeps the eye on a straight path and swings the view direction.
 */
export function lerpCam(a: Cam, b: Cam, k: number, mode: 'orbit' | 'pan' = 'orbit'): Cam {
  const fov = (2 * Math.atan(Math.exp(lerp(Math.log(tanHalf(a.fov)), Math.log(tanHalf(b.fov)), k))) * 360) / TAU;
  const roll = lerp(a.roll, b.roll, k);
  const da = sub(a.pos, a.tgt), db = sub(b.pos, b.tgt);
  const d = Math.exp(lerp(Math.log(len(da) || 1e-3), Math.log(len(db) || 1e-3), k));
  if (mode === 'pan') {
    const pos = mix3(a.pos, b.pos, k);
    return { pos, tgt: madd(pos, slerpDir(sub(a.tgt, a.pos), sub(b.tgt, b.pos), k), d), roll, fov };
  }
  const tgt = mix3(a.tgt, b.tgt, k);
  return { pos: madd(tgt, slerpDir(da, db, k), d), tgt, roll, fov };
}
const tanHalf = (fov: number) => Math.tan((fov * Math.PI) / 360);

export interface Shot {
  /** song time the shot starts */
  t: number;
  cam: (t: number) => Cam;
  /** reframe from the previous shot over this many seconds (0 / unset = hard cut) */
  snap?: number;
  /** default outExpo: a whip that lands */
  ease?: Ease;
  mode?: 'orbit' | 'pan';
  /** dutch kick on arrival, radians (rings at 2.6 Hz, decays at 6/s) */
  kick?: number;
}

/**
 * The camera of a shot list at t. During a snap the previous shot keeps moving and the
 * frame is swept from it to the new one, so a whip reads as one continuous move.
 */
export function shots(t: number, list: Shot[]): Cam {
  let i = list.length - 1;
  while (i > 0 && list[i].t > t) i--;
  const c = evalShot(list, i, t);
  let kick = 0;
  for (let j = 0; j <= i; j++) {
    const dt = t - list[j].t;
    if (list[j].kick && dt >= 0 && dt < 1.5) kick += list[j].kick! * Math.sin(TAU * 2.6 * dt) * Math.exp(-6 * dt);
  }
  return kick ? { ...c, roll: c.roll + kick } : c;
}

function evalShot(list: Shot[], i: number, t: number): Cam {
  const s = list[i];
  const c = s.cam(t);
  const dt = t - s.t;
  if (i === 0 || !s.snap || dt >= s.snap) return c;
  return lerpCam(evalShot(list, i - 1, t), c, (s.ease ?? ease.outExpo)(clamp(dt / s.snap)), s.mode);
}

/**
 * Operator drift: slow angular wander of `amt` radians plus a little travel, continuous
 * in t (so it motion-blurs honestly). Scales with the shot size.
 */
export function handheld(c: Cam, t: number, amt = 0.004, freq = 0.6, seed = 0): Cam {
  const b = basis(c);
  const d = len(sub(c.tgt, c.pos));
  const n = (k: number) => fbm1(t * freq + k * 31.7, seed + k * 13, 3);
  const tgt = madd(madd(c.tgt, b.R, n(1) * d * amt), b.U, n(2) * d * amt * 0.8);
  const pos = madd(madd(c.pos, b.R, n(3) * d * amt * 0.3), b.U, n(4) * d * amt * 0.3);
  return { ...c, pos, tgt, roll: c.roll + n(5) * amt * 0.6 };
}

/** impact shake: a fresh random offset every output frame (crisp under motion blur) */
export function shake(c: Cam, t: number, amt: number, seed = 0): Cam {
  if (amt <= 0) return c;
  const f = frameIdx(t);
  const b = basis(c);
  const d = len(sub(c.tgt, c.pos));
  const r = (k: number) => hash(f, seed, k) * 2 - 1;
  const off = madd(mul(b.R, r(1)), b.U, r(2));
  return { ...c, pos: madd(c.pos, off, d * amt), tgt: madd(c.tgt, off, d * amt), roll: c.roll + r(3) * amt * 0.5 };
}
