/**
 * Camera framing for a tall, slim object standing on the floor (scene units: metres, y-up).
 * Pure maths, unit-tested; LampScene applies the result to the camera and OrbitControls.
 */

export const FRAME_MARGIN = 1.12;
export const DEFAULT_AZIMUTH_DEG = 35;
export const DEFAULT_ELEVATION_DEG = 10;
/** Target height as a fraction of the framed height. */
export const TARGET_HEIGHT_FRACTION = 0.48;
/** Relative change of the framed height (or width) that triggers an automatic reframe. */
export const REFRAME_THRESHOLD = 0.1;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;

/**
 * Camera distance (from the target) at which an upright cylinder of height `heightM`
 * and radius `radiusM` fits the view with `margin` to spare, both vertically and
 * horizontally. The cylinder's near side is `radiusM` closer than its axis, hence + radius.
 */
export function frameDistance(heightM: number, radiusM: number, fovDeg: number, aspect: number, margin = FRAME_MARGIN): number {
  const h = Math.max(heightM, 1e-3);
  const r = Math.max(radiusM, 1e-3);
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const fov = Number.isFinite(fovDeg) && fovDeg > 1 && fovDeg < 179 ? fovDeg : 30;
  const tanV = Math.tan((fov * DEG) / 2);
  const tanH = tanV * a;
  const byHeight = (h * margin) / 2 / tanV + r;
  const byWidth = (r * margin) / tanH + r;
  return Math.max(byHeight, byWidth);
}

/** Unit vector from the target towards the camera. */
export function directionFromAngles(azimuthDeg = DEFAULT_AZIMUTH_DEG, elevationDeg = DEFAULT_ELEVATION_DEG): Vec3 {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/** What the camera has to show, in metres (y-up, floor at y = 0). */
export interface FrameBounds {
  height: number;
  /** Horizontal extent along x (exploded view widens it). */
  minX: number;
  maxX: number;
  /** Radius of the widest round part (depth extent). */
  radius: number;
}

export interface Framing {
  target: Vec3;
  position: Vec3;
  distance: number;
  minDistance: number;
  maxDistance: number;
  /** Polar clamp so the camera never dips below the floor at max zoom-out. */
  maxPolarAngle: number;
}

export function frameTarget(b: FrameBounds): Vec3 {
  return [(b.minX + b.maxX) / 2, b.height * TARGET_HEIGHT_FRACTION, 0];
}

/** Effective framing radius: half the x extent or the round radius, whichever is larger. */
export function frameRadius(b: FrameBounds): number {
  return Math.max(b.radius, (b.maxX - b.minX) / 2);
}

/**
 * Full framing for bounds. `direction` keeps the user's orbit direction (unit vector
 * target → camera); `zoom` (distance / framed distance) keeps their zoom level.
 */
export function computeFraming(
  b: FrameBounds,
  fovDeg: number,
  aspect: number,
  opts: { direction?: Vec3 | null; zoom?: number } = {},
): Framing {
  const framed = frameDistance(b.height, frameRadius(b), fovDeg, aspect);
  const zoom = clamp(opts.zoom ?? 1, MIN_ZOOM, MAX_ZOOM);
  const distance = framed * zoom;
  const target = frameTarget(b);
  const dir = normalise(opts.direction ?? directionFromAngles());
  const maxDistance = framed * MAX_ZOOM;
  // Lowest camera height (at max distance) stays above 10 % of the target height.
  const sinBelow = Math.min(0.9, (target[1] * 0.9) / maxDistance);
  return {
    target,
    position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance],
    distance,
    minDistance: framed * MIN_ZOOM,
    maxDistance,
    maxPolarAngle: Math.PI / 2 + Math.asin(Math.max(0, sinBelow)),
  };
}

/** True when the framed size changed enough to move the camera. */
export function shouldReframe(prev: FrameBounds | null, next: FrameBounds, threshold = REFRAME_THRESHOLD): boolean {
  if (!prev) return true;
  const rel = (a: number, b: number) => Math.abs(b - a) / Math.max(Math.abs(a), 1e-6);
  return (
    rel(prev.height, next.height) > threshold ||
    rel(frameRadius(prev), frameRadius(next)) > threshold ||
    Math.abs((prev.minX + prev.maxX) / 2 - (next.minX + next.maxX) / 2) > frameRadius(next) * threshold
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}

function normalise(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (!(l > 1e-9)) return directionFromAngles();
  return [v[0] / l, v[1] / l, v[2] / l];
}
