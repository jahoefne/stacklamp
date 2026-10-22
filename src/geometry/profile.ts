/**
 * Helpers for (r, z) profiles: closed polygons in the half plane r >= 0 that
 * Manifold revolves about the z axis. A valid profile is counter-clockwise
 * (r to the right, z up), simple (no self-intersections), has no repeated
 * points and no point at r < 0. Pure TS, no kernel.
 */

export type Pt = [number, number];
export type Profile = Pt[];

export class ProfileError extends Error {
  override name = 'ProfileError';
}

const EPS = 1e-9;

/**
 * Points on a circular arc around (cr, cz), from angle a0 to a1 (radians,
 * counter-clockwise when a1 > a0), both ends included, `segments` straight pieces.
 */
export function arc(cr: number, cz: number, radius: number, a0: number, a1: number, segments: number): Pt[] {
  const n = Math.max(1, Math.round(segments));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cr + radius * Math.cos(a), cz + radius * Math.sin(a)]);
  }
  return out;
}

/** Drop consecutive duplicates (within `eps`), including a closing duplicate of the first point. */
export function dedupe(points: readonly Pt[], eps = 1e-7): Profile {
  const out: Profile = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) out.push([p[0], p[1]]);
  }
  while (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(last[0] - first[0]) > eps || Math.abs(last[1] - first[1]) > eps) break;
    out.pop();
  }
  return out;
}

/** Shoelace area: positive for counter-clockwise. */
export function signedArea(points: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** Closed-segment intersection test (touching counts). */
export function segmentsIntersect(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const scale = Math.max(1, Math.abs(p1[0]), Math.abs(p1[1]), Math.abs(q1[0]), Math.abs(q1[1]));
  const tol = EPS * scale * scale;
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  if (((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol)) && ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol))) return true;
  if (Math.abs(d1) <= tol && onSegment(q1, q2, p1)) return true;
  if (Math.abs(d2) <= tol && onSegment(q1, q2, p2)) return true;
  if (Math.abs(d3) <= tol && onSegment(p1, p2, q1)) return true;
  if (Math.abs(d4) <= tol && onSegment(p1, p2, q2)) return true;
  return false;
}

/** First problem with the profile, or null when it is a valid CCW simple polygon with r >= 0. */
export function profileProblem(points: readonly Pt[]): string | null {
  const n = points.length;
  if (n < 3) return `only ${n} points`;
  for (const [r, z] of points) {
    if (!Number.isFinite(r) || !Number.isFinite(z)) return 'a coordinate is not a number';
    if (r < -1e-9) return `a point at r = ${r.toFixed(3)} < 0`;
  }
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7) return `repeated point at (${a[0].toFixed(3)}, ${a[1].toFixed(3)})`;
  }
  if (signedArea(points) <= 0) return 'not counter-clockwise (area <= 0)';
  for (let i = 0; i < n; i++) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges (they share a vertex)
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const b1 = points[j]!;
      const b2 = points[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return `edges ${i} and ${j} intersect near (${a1[0].toFixed(2)}, ${a1[1].toFixed(2)})`;
      }
    }
  }
  // adjacent edges folding back onto each other (a spike)
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n]!;
    const b = points[i]!;
    const c = points[(i + 1) % n]!;
    const ux = b[0] - a[0];
    const uz = b[1] - a[1];
    const vx = c[0] - b[0];
    const vz = c[1] - b[1];
    const cross = ux * vz - uz * vx;
    const dot = ux * vx + uz * vz;
    if (Math.abs(cross) < 1e-12 * Math.hypot(ux, uz) * Math.hypot(vx, vz) && dot < 0) return `spike at point ${i}`;
  }
  return null;
}

/** Throw a ProfileError naming `what` unless the profile is valid. */
export function assertSimpleCCW(points: readonly Pt[], what = 'profile'): void {
  const problem = profileProblem(points);
  if (problem) throw new ProfileError(`${what}: ${problem}`);
}

/** Volume of the solid of revolution (Pappus), for a CCW profile with r >= 0, mm³. */
export function revolvedVolume(points: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [r0, z0] = points[i]!;
    const [r1, z1] = points[(i + 1) % points.length]!;
    s += (z1 - z0) * (r0 * r0 + r0 * r1 + r1 * r1);
  }
  return (Math.PI / 3) * s;
}

/**
 * Volume of the same profile revolved into an n-sided polygonal solid (what
 * Manifold.revolve(profile, n) builds): every horizontal slice is a regular
 * n-gon inscribed in the circle, so the volume scales by n·sin(2π/n)/(2π).
 */
export function revolvedPolygonVolume(points: readonly Pt[], n: number): number {
  return (revolvedVolume(points) * n * Math.sin((2 * Math.PI) / n)) / (2 * Math.PI);
}

/** Axis-aligned bounds of the profile. */
export function profileBounds(points: readonly Pt[]): { rMin: number; rMax: number; zMin: number; zMax: number } {
  let rMin = Infinity;
  let rMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const [r, z] of points) {
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  return { rMin, rMax, zMin, zMax };
}

/** Mirror a profile in z about z = 0 and move it up by `top` (keeps it CCW). */
export function flipProfile(points: readonly Pt[], top: number): Profile {
  return points.map(([r, z]) => [r, top - z] as Pt).reverse();
}

export function translateProfile(points: readonly Pt[], dz: number): Profile {
  return points.map(([r, z]) => [r, z + dz] as Pt);
}
