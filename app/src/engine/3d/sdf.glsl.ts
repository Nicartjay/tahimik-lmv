// GLSL for raymarched plates, for use inside a fullscreen Pass. GLSL_SDF gives the camera
// ray (same basis as the line/point/word shaders, so they register exactly), 3D noise,
// distance functions and analytic glow. GLSL_MARCH needs `float map(vec3 p)` declared
// before it and adds the sphere tracer, normals, AO and soft shadows.
//
// Convention: a raymarched RT that lines should be occluded by stores view depth
// (distance along the camera's forward axis, `viewDepth`) in .a, background 1e4.

import { GLSL_CAM } from './camera';

export const GLSL_SDF = /* glsl */ `
${GLSL_CAM}
// primary ray through this fragment (any target size, same framing as the geometry)
vec3 camRay() {
  vec2 p = (gl_FragCoord.xy - uRes * .5) * (1080. / uRes.y);
  return normalize(uCamF * uFocal + uCamR * p.x + uCamU * p.y);
}
float viewDepth(float t, vec3 rd) { return t * dot(rd, uCamF); }
// half-angle of one physical pixel, for cone-tolerant hits and LOD
float pixelCone() { return .5 / pxPerUnit(1.); }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3. - 2. * f);
  float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)), f1 = hash13(i + vec3(1, 0, 1)), g = hash13(i + vec3(0, 1, 1)), h = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
float fbm3(vec3 p, int oct) {
  float s = 0., a = .5, n = 0.;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoise3(p); n += a;
    p = p * 2.02 + vec3(17.1, 3.7, 9.3);
    a *= .5;
  }
  return s / n;
}

float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, max(d.y, d.z)), 0.); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdTorus(vec3 p, vec2 t) { return length(vec2(length(p.xz) - t.x, p.y)) - t.y; }
float sdCylinder(vec3 p, float r, float h) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
// not exact, but a bound that is good enough to march
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }
// cone between spheres of radius ra at a and rb at b
float sdRoundCone(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 ba = b - a; float l2 = dot(ba, ba), rr = ra - rb, a2 = l2 - rr * rr, il2 = 1. / l2;
  vec3 pa = p - a; float y = dot(pa, ba), z = y - l2;
  vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - rb;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - ra;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

float fogK(float t, float k) { return exp(-t * k); }

// in-scattered light of a point source at c seen along ro + rd·[0, tmax]: the exact
// integral of 1 / (dist² + r²) — a volumetric glow that needs no marching
float pointGlow(vec3 ro, vec3 rd, float tmax, vec3 c, float r) {
  vec3 oc = c - ro;
  float t0 = dot(oc, rd);
  float h = sqrt(max(dot(oc, oc) - t0 * t0, 0.) + r * r);
  return (atan((tmax - t0) / h) + atan(t0 / h)) / h;
}
`;

export const GLSL_MARCH = /* glsl */ `
// sphere tracer: t at the hit, or -1. The hit tolerance grows with distance (one pixel's
// cone), so far detail costs no more steps than it can show.
float march(vec3 ro, vec3 rd, float tmin, float tmax, int steps) {
  float t = tmin, cone = pixelCone();
  for (int i = 0; i < 512; i++) {
    if (i >= steps) break;
    float d = map(ro + rd * t);
    if (d < max(1e-4, cone * t)) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.;
}
vec3 calcNormal(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}
float calcAO(vec3 p, vec3 n) {
  float o = 0., s = 1.;
  for (int i = 1; i <= 5; i++) {
    float h = .02 + .12 * float(i);
    o += (h - map(p + n * h)) * s;
    s *= .7;
  }
  return clamp(1. - 1.6 * o, 0., 1.);
}
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float r = 1., t = tmin;
  for (int i = 0; i < 48; i++) {
    float h = map(ro + rd * t);
    r = min(r, k * h / t);
    t += clamp(h, .02, .5);
    if (r < .002 || t > tmax) break;
  }
  return clamp(r, 0., 1.);
}
`;
