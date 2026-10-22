/**
 * CPU copies of three's AgX and Neutral tone mapping (r186 shader chunk) and a numeric inverse.
 * The stage background and fog are rendered *through* the tone mapper (so the
 * bloom and direct paths match); feeding them inverseToneMap(token) makes the screen
 * show exactly the --stage-bg colour the design asked for.
 */
type Vec3 = [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3]; // columns (GLSL mat3 constructor order)

const SRGB_TO_REC2020: Mat3 = [
  [0.6274, 0.0691, 0.0164],
  [0.3293, 0.9195, 0.088],
  [0.0433, 0.0113, 0.8956],
];
const REC2020_TO_SRGB: Mat3 = [
  [1.6605, -0.1246, -0.0182],
  [-0.5876, 1.1329, -0.1006],
  [-0.0728, -0.0083, 1.1187],
];
const INSET: Mat3 = [
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
];
const OUTSET: Mat3 = [
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
];
const MIN_EV = -12.47393;
const MAX_EV = 4.026069;

const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const contrast = (x: number) => {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
};

/** Linear sRGB in → linear sRGB out, as AgXToneMapping() in three's shader. */
export function agx(rgb: Vec3, exposure = 1): Vec3 {
  let c = mul(INSET, mul(SRGB_TO_REC2020, [rgb[0] * exposure, rgb[1] * exposure, rgb[2] * exposure]));
  c = c.map((v) => contrast(clamp01((Math.log2(Math.max(v, 1e-10)) - MIN_EV) / (MAX_EV - MIN_EV)))) as Vec3;
  c = mul(OUTSET, c).map((v) => Math.max(0, v) ** 2.2) as Vec3;
  return mul(REC2020_TO_SRGB, c).map(clamp01) as Vec3;
}

/** Linear sRGB in → linear sRGB out, as NeutralToneMapping() (Khronos PBR Neutral) in three's shader. */
export function neutral(rgb: Vec3, exposure = 1): Vec3 {
  let c: Vec3 = [rgb[0] * exposure, rgb[1] * exposure, rgb[2] * exposure];
  const x = Math.min(c[0], c[1], c[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c = c.map((v) => v - offset) as Vec3;
  const peak = Math.max(c[0], c[1], c[2]);
  const start = 0.8 - 0.04;
  if (peak < start) return c;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  c = c.map((v) => (v * newPeak) / peak) as Vec3;
  const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return c.map((v) => v + (newPeak - v) * g) as Vec3;
}

export type ToneMap = 'agx' | 'neutral';

export function toneMapColour(kind: ToneMap, rgb: Vec3, exposure = 1): Vec3 {
  return kind === 'agx' ? agx(rgb, exposure) : neutral(rgb, exposure);
}

/**
 * Linear input whose tone-mapped output is `target` (linear): damped Newton iteration
 * with a finite-difference Jacobian (both mappers are smooth and monotonic in the
 * dark range the stage uses).
 */
export function inverseToneMap(kind: ToneMap, target: Vec3, exposure = 1): Vec3 {
  const f = (v: Vec3) => toneMapColour(kind, v, exposure);
  const t = target.map((v) => Math.min(0.98, Math.max(0, v))) as Vec3;
  let x: Vec3 = [...t];
  for (let iter = 0; iter < 60; iter++) {
    const y = f(x);
    const r: Vec3 = [t[0] - y[0], t[1] - y[1], t[2] - y[2]];
    if (Math.max(Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2])) < 1e-7) break;
    // J[i][k] = d f_i / d x_k
    const J: Vec3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < 3; k++) {
      const h = Math.max(1e-7, x[k]! * 1e-4);
      const xp: Vec3 = [...x];
      xp[k] = x[k]! + h;
      const yp = f(xp);
      for (let i = 0; i < 3; i++) J[i]![k] = (yp[i]! - y[i]!) / h;
    }
    const dx = solve3(J as [Vec3, Vec3, Vec3], r) ?? r;
    // Damp: at most ×4 / ÷4 per step, never negative.
    x = x.map((v, k) => Math.min(v * 4 + 1e-4, Math.max(v / 4, v + dx[k]!))) as Vec3;
  }
  return x;
}

function solve3(m: [Vec3, Vec3, Vec3], b: Vec3): Vec3 | null {
  const det = (a: [Vec3, Vec3, Vec3]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null;
  const col = (k: number): [Vec3, Vec3, Vec3] =>
    m.map((row, i) => row.map((v, j) => (j === k ? b[i]! : v)) as Vec3) as [Vec3, Vec3, Vec3];
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

export const agxInverse = (target: Vec3, exposure = 1): Vec3 => inverseToneMap('agx', target, exposure);

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToLinear(hex: string): Vec3 {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export function linearToHex(rgb: Vec3): string {
  return '#' + rgb.map((c) => Math.round(clamp01(linearToSrgb(c)) * 255).toString(16).padStart(2, '0')).join('');
}
