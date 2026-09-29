// Small vector kit for the 3D layer. Vectors are plain [x, y, z] tuples; world space is
// right-handed with +y up. Nothing here allocates more than the tuple it returns.

import { clamp, lerp } from '../util';

export type V3 = [number, number, number];

export const v3 = (x = 0, y = x, z = x): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
/** a + b·k */
export const madd = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** rotate about +y (yaw), +x (pitch), +z (roll) */
export const rotY = (p: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
};
export const rotX = (p: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]];
};
export const rotZ = (p: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
};

/** rotate p about unit axis k by angle a (Rodrigues) */
export function rotAxis(p: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  const kx = cross(k, p), kd = dot(k, p) * (1 - c);
  return [p[0] * c + kx[0] * s + k[0] * kd, p[1] * c + kx[1] * s + k[1] * kd, p[2] * c + kx[2] * s + k[2] * kd];
}

/** point on a sphere: yaw about +y from +z, pitch up from the horizon */
export const sph = (yaw: number, pitch: number, r = 1): V3 => [
  Math.sin(yaw) * Math.cos(pitch) * r,
  Math.sin(pitch) * r,
  Math.cos(yaw) * Math.cos(pitch) * r,
];

/** spherical interpolation of two directions (falls back to lerp when nearly parallel) */
export function slerpDir(a: V3, b: V3, t: number): V3 {
  const na = norm(a), nb = norm(b);
  const d = clamp(dot(na, nb), -1, 1);
  const th = Math.acos(d);
  if (th < 1e-4) return norm(mix3(na, nb, t));
  const s = Math.sin(th);
  return add(mul(na, Math.sin((1 - t) * th) / s), mul(nb, Math.sin(t * th) / s));
}
