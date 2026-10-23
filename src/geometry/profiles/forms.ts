/**
 * Segment body forms as geometry: the free zone, the amplitude a form reaches
 * under the overhang cap, the (r, z) curves of the round forms, the radial warp
 * of the ribbed forms (star, flute, twist) and the envelope that bounds every
 * form. Pure, no kernel. The catalogue (labels, share codes, rib counts) is in
 * ../forms.ts.
 *
 * Print frame, z up from the foot. A form lives in the free zone of the body,
 * ZONE_MARGIN clear of the shoulder below and of the next segment's socket
 * above (which reaches down to H − seatZ):
 *
 *   z0 = ov + w + c + ZONE_MARGIN
 *   z1 = H − seatZ − ZONE_MARGIN
 *
 * Outside the zone the profile is the straight one, point for point, so the
 * joint never changes. The amplitude a = (formOD − D) / 2 is how far a form
 * leaves the tube: bulges reach R + a, the waist narrows to R − a; a ≤ 0 is
 * straight.
 *
 * Vase mode prints a segment socket-down, so a flank whose radius grows going
 * up is an overhang: it may lean at most maxOverhang from vertical
 * (dr/dz ≤ tan maxOverhang). Inward flanks are free. A form that does not fit
 * its zone under that cap is scaled down (effectiveAmplitude < a); derive
 * reports it as `form-squeezed`.
 *
 * Round forms share one primitive, the capped flank: from the tube out to the
 * extreme over a height L, a cone at the cap angle blending tangentially into a
 * circular arc that is vertical at the extreme (only the arc when it already
 * meets the tube within the cap). Ball, barrel and waist mirror it about the
 * extreme; the drop carries its arc over the top into a straight taper. The
 * inner surface is the outer one moved inward by the wall (a constant
 * horizontal wall, as the vase line prints it).
 *
 * Ribbed forms keep the straight profile with a ring every FORM_RING_STEP
 * through the zone; the builder moves the revolved vertices outward by
 * e(z)·g(θ, z) (formWarp). The envelope e rises from z0 at the cap angle to the
 * amplitude, stays flat and falls back symmetrically to z1; g ∈ [0, 1] is the
 * rib pattern. Inner and outer surface move together.
 */
import { FLUTE_LOBES, FORMS, STAR_POINTS, TWIST_LOBES, TWIST_TURN_DEG, ZONE_MARGIN } from '../forms';
import type { SegmentSpec } from '../layout';
import { arc, dedupe, type Profile, type Pt } from '../profile';

// ---------------------------------------------------------------- named constants

/** Longest chord of a form arc, mm. The profile is the same for preview and export. */
export const FORM_CHORD = 1.5;
/** Ribbed forms: largest z spacing of the rings the warp moves, mm. */
export const FORM_RING_STEP = 2;
/** The ball's belly spans at most this share of the zone, so a neck shows above and below it. */
export const BALL_SPAN = 0.75;
/** The drop's belly sits at most this share of the zone above z0; the taper takes the rest. */
export const DROP_BELLY = 0.3;
/** Ribbed forms are revolved with at least this many segments at export quality (crisp ridges). */
export const RIBBED_EXPORT_SEGMENTS = 256;
/**
 * The waist keeps at least this inside radius, mm, so its profile stays valid however
 * deep it is asked to go (derive reports a waist that tight long before: form-too-narrow).
 */
export const WAIST_MIN_BORE = 1;
/** Overhang cap when a spec carries none, degrees from vertical. */
export const DEFAULT_MAX_OVERHANG = 45;
/** The cap is clamped to this range, degrees, so out-of-range input still builds. */
const CAP_RANGE_DEG: readonly [number, number] = [1, 89];
/** Bisection steps for the twist's amplitude limit (2^-32 of the amplitude). */
const TWIST_BISECTION_STEPS = 32;
/** Rib phases sampled for the twist's steepest flank, then refined by golden-section steps. */
const TWIST_PHASE_SAMPLES = 24;
const TWIST_PHASE_REFINE = 16;
/** Twist limits remembered (derive asks for the same ones several times per edit). */
const TWIST_MEMO_SIZE = 64;
/** Curve points this close to a zone end (mm) are that end. */
const END_EPS = 1e-7;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- zone and amplitude

/** Seat height of the joint: ov + c + λ. A segment sits this far into the one below. */
export const seatHeight = (s: SegmentSpec): number => s.overlap + s.clearance + s.leadIn;

export interface FormZone {
  /** Body radius D / 2. */
  R: number;
  /** Bottom and top of the free zone (z1 ≤ z0 when the segment has none). */
  z0: number;
  z1: number;
}

export function formZone(s: SegmentSpec): FormZone {
  return {
    R: s.D / 2,
    z0: s.overlap + s.wall + s.clearance + ZONE_MARGIN,
    z1: s.height - seatHeight(s) - ZONE_MARGIN,
  };
}

/** The overhang cap in radians. */
export function capAngle(s: SegmentSpec): number {
  const deg = s.maxOverhang ?? DEFAULT_MAX_OVERHANG;
  const [lo, hi] = CAP_RANGE_DEG;
  return Math.min(hi, Math.max(lo, Number.isFinite(deg) ? deg : DEFAULT_MAX_OVERHANG)) * DEG;
}

/**
 * The amplitude asked for: (formOD − D) / 2, 0 for straight specs and form diameters up
 * to D; a waist no deeper than the tube allows (WAIST_MIN_BORE).
 */
export function formAmplitude(s: SegmentSpec): number {
  if (s.form === 'straight' || s.formOD === undefined || !Number.isFinite(s.formOD)) return 0;
  const a = Math.max(0, (s.formOD - s.D) / 2);
  return s.form === 'waist' ? Math.min(a, Math.max(0, s.D / 2 - s.wall - WAIST_MIN_BORE)) : a;
}

/**
 * The amplitude the form actually reaches: the nominal one, scaled down until the
 * form fits its zone under the cap. Bulges, the waist and the ribs need a/tan(cap)
 * on each side of the extreme; the barrel is a single arc whose end tangents stay
 * within the cap (a ≤ h·tan(cap/2)); the twist's ribs also lean sideways as they
 * turn (see twistAmplitude).
 */
export function effectiveAmplitude(s: SegmentSpec): number {
  const a = formAmplitude(s);
  if (a <= 0) return 0;
  const { R, z0, z1 } = formZone(s);
  const h = (z1 - z0) / 2;
  if (!(h > 0)) return 0;
  const c = capAngle(s);
  switch (s.form) {
    case 'straight':
      return 0;
    case 'barrel':
      return Math.min(a, h * Math.tan(c / 2));
    case 'twist':
      return twistAmplitude(R, 2 * h, Math.min(a, h * Math.tan(c)), c);
    default:
      return Math.min(a, h * Math.tan(c));
  }
}

const twistMemo = new Map<string, number>();

/**
 * The twist's ribs turn while the envelope is flat, so one flank of every rib
 * faces partly downward. On the surface r = R + e·g(θ − φ(z)) with
 * g = (1 + cos x) / 2, x = n(θ − φ), the overhang (from vertical) is
 * tan β = f_z / √(1 + (f_θ / r)²) with f_z = e·k·sin x·φ′, f_θ = −e·k·sin x,
 * r = R + e·g, k = n / 2 and φ′ the turn per mm over the flat part
 * (Z − 2e / tan cap). The steepest phase is found numerically; the overhang
 * grows with e, so the largest e within the cap (below `aMax`) is found by
 * bisection.
 */
function twistAmplitude(R: number, Z: number, aMax: number, c: number): number {
  if (!(aMax > 0)) return 0;
  const key = `${R}|${Z}|${aMax}|${c}`;
  const known = twistMemo.get(key);
  if (known !== undefined) return known;
  const t = Math.tan(c);
  const k = TWIST_LOBES / 2;
  const turn = TWIST_TURN_DEG * DEG;
  const lean = (e: number): number => {
    const flat = Z - (2 * e) / t;
    if (!(flat > 0)) return Infinity;
    const rate = turn / flat;
    return maxOver(0, Math.PI, (x) => {
      const side = e * k * Math.sin(x);
      const r = R + (e * (1 + Math.cos(x))) / 2;
      return (side * rate) / Math.sqrt(1 + (side / r) ** 2);
    });
  };
  let result = aMax;
  if (lean(aMax) > t) {
    let lo = 0;
    let hi = aMax;
    for (let i = 0; i < TWIST_BISECTION_STEPS; i++) {
      const m = (lo + hi) / 2;
      if (lean(m) <= t) lo = m;
      else hi = m;
    }
    result = lo;
  }
  if (twistMemo.size >= TWIST_MEMO_SIZE) twistMemo.clear();
  twistMemo.set(key, result);
  return result;
}

/** Maximum of a smooth single-peaked `fn` on [lo, hi]: a coarse scan, then golden-section steps around the best sample. */
function maxOver(lo: number, hi: number, fn: (x: number) => number): number {
  const step = (hi - lo) / TWIST_PHASE_SAMPLES;
  let best = lo;
  let bestV = fn(lo);
  for (let i = 1; i <= TWIST_PHASE_SAMPLES; i++) {
    const v = fn(lo + i * step);
    if (v > bestV) {
      bestV = v;
      best = lo + i * step;
    }
  }
  const g = (Math.sqrt(5) - 1) / 2;
  let a = Math.max(lo, best - step);
  let b = Math.min(hi, best + step);
  for (let i = 0; i < TWIST_PHASE_REFINE; i++) {
    const x1 = b - g * (b - a);
    const x2 = a + g * (b - a);
    if (fn(x1) < fn(x2)) a = x1;
    else b = x2;
  }
  return Math.max(bestV, fn((a + b) / 2));
}

// ---------------------------------------------------------------- the capped flank (round forms)

/**
 * A flank that leaves the tube and reaches the amplitude `a` over the height `L`
 * with the steepest outward slope tan(cap): a cone at the cap angle into an arc of
 * radius `rho` that is vertical at the extreme. In local coordinates (u out of the
 * tube, v up from the flank's start) the arc's centre is (a − rho, L) and it runs
 * from the angle `phi0` (−cap … 0) to 0; rho = 0 is a plain cone.
 */
interface Flank {
  a: number;
  L: number;
  rho: number;
  phi0: number;
}

/** The capped flank for amplitude `a` over height `L` (needs L·tan(cap) ≥ a). */
function cappedFlank(a: number, L: number, c: number): Flank {
  if (L * Math.tan(c / 2) >= a) {
    // the arc alone meets the tube within the cap
    const rho = (a * a + L * L) / (2 * a);
    return { a, L, rho, phi0: -Math.atan2(L, rho - a) };
  }
  // cone at the cap angle, tangent to the arc at −cap
  const rho = Math.max(0, (L * Math.sin(c) - a * Math.cos(c)) / (1 - Math.cos(c)));
  return { a, L, rho, phi0: -c };
}

/** Height a capped flank needs to reach `a` with an arc of radius `rho` (inverse of cappedFlank). */
function flankHeight(a: number, rho: number, c: number): number {
  const k = 1 - Math.cos(c);
  return rho * k >= a ? Math.sqrt(2 * a * rho - a * a) : (rho * k + a * Math.cos(c)) / Math.sin(c);
}

const arcSegments = (radius: number, sweep: number): number => Math.max(1, Math.ceil((radius * Math.abs(sweep)) / FORM_CHORD));

/** The flank in local coordinates, (0, 0) … (a, L), with chords of at most FORM_CHORD. */
function flankPoints(f: Flank): Pt[] {
  return [[0, 0], ...arc(f.a - f.rho, f.L, f.rho, f.phi0, 0, arcSegments(f.rho, f.phi0))];
}

/**
 * Body line of a form symmetric about zc: straight from z0, the flank out to R + sign·a
 * at zc, the same flank mirrored back, straight to z1. sign −1 is the waist (its upper
 * flank is the outward one, so mirroring keeps both within the cap).
 */
function symmetricCurve(R: number, z0: number, z1: number, zc: number, f: Flank, sign: 1 | -1): Pt[] {
  const flank = flankPoints(f);
  const lower = flank.map(([u, v]) => [R + sign * u, zc - f.L + v] as Pt);
  const upper = [...flank].reverse().map(([u, v]) => [R + sign * u, zc + f.L - v] as Pt);
  return bodyLine(R, z0, z1, [...lower, ...upper]);
}

/** A body line from exactly (R, z0) to exactly (R, z1) through `points` (rounding twins of the ends dropped). */
function bodyLine(R: number, z0: number, z1: number, points: readonly Pt[]): Pt[] {
  const at = ([r, z]: Pt, zEnd: number): boolean => Math.abs(r - R) < END_EPS && Math.abs(z - zEnd) < END_EPS;
  return dedupe([[R, z0], ...points.filter((p) => !at(p, z0) && !at(p, z1)), [R, z1]]);
}

/**
 * The capped flank whose arc is a sphere of the form diameter (radius R + a), the
 * literal ball, as long as its height lies within [a / tan(cap), lMax]; otherwise the
 * flank of that height (a flatter arc when the sphere is too tall).
 */
function sphereFlank(R: number, a: number, lMax: number, c: number): Flank {
  const lMin = a / Math.tan(c);
  const L = Math.min(Math.max(flankHeight(a, R + a, c), lMin), Math.max(lMin, lMax));
  return cappedFlank(a, L, c);
}

/**
 * The outer body line of a round form, from (R, z0) to (R, z1) with z ascending; []
 * when the segment is straight (or the form has no room).
 *
 *   ball:   a sphere of the form diameter on a cone, centred, mirrored (≤ BALL_SPAN of the zone)
 *   barrel: one arc over the whole zone, end tangents within the cap
 *   waist:  the flank over half the zone, inward, mirrored (a concave arc while it fits the cap)
 *   drop:   the ball's lower flank low in the zone (≤ DROP_BELLY), its arc carried over the
 *           top into a straight taper that ends at (R, z1)
 */
export function roundFormCurve(s: SegmentSpec): Pt[] {
  if (!FORMS[s.form].round) return [];
  const a = effectiveAmplitude(s);
  if (a <= 0) return [];
  const { R, z0, z1 } = formZone(s);
  const c = capAngle(s);
  const h = (z1 - z0) / 2;
  const zc = z0 + h;
  switch (s.form) {
    case 'ball':
      return symmetricCurve(R, z0, z1, zc, sphereFlank(R, a, BALL_SPAN * h, c), 1);
    case 'barrel':
      return symmetricCurve(R, z0, z1, zc, cappedFlank(a, h, c), 1);
    case 'waist':
      return symmetricCurve(R, z0, z1, zc, cappedFlank(a, h, c), -1);
    case 'drop': {
      const f = sphereFlank(R, a, DROP_BELLY * 2 * h, c);
      const zp = z0 + f.L;
      const lower = flankPoints(f).map(([u, v]) => [R + u, z0 + v] as Pt);
      // the tangent from (R, z1) to the belly's circle, on its upper right
      const cr = R + a - f.rho;
      const D = Math.hypot(f.rho - a, z1 - zp);
      const phiT = Math.atan2(z1 - zp, f.rho - a) - Math.acos(Math.min(1, f.rho / D));
      const over = arc(cr, zp, f.rho, 0, phiT, arcSegments(f.rho, phiT));
      return bodyLine(R, z0, z1, [...lower, ...over]);
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------- ribbed forms

/** Ribbed envelope: rise length, flat stretch and amplitude. */
interface Ribs {
  a: number;
  z0: number;
  z1: number;
  /** End of the rise and start of the fall. */
  zr: number;
  zf: number;
}

function ribs(s: SegmentSpec): Ribs | null {
  if (FORMS[s.form].round) return null;
  const a = effectiveAmplitude(s);
  if (a <= 0) return null;
  const { z0, z1 } = formZone(s);
  const rise = a / Math.tan(capAngle(s));
  return { a, z0, z1, zr: Math.min(z0 + rise, (z0 + z1) / 2), zf: Math.max(z1 - rise, (z0 + z1) / 2) };
}

/** e(z): 0 outside the zone, rising at the cap angle from z0, flat at a, falling to 0 at z1. */
function ribEnvelope(r: Ribs, z: number): number {
  if (z <= r.z0 || z >= r.z1) return 0;
  const rise = r.zr - r.z0;
  return r.a * Math.min(1, (z - r.z0) / rise, (r.z1 - z) / rise);
}

/** Heights of the rings a ribbed form needs: z0, zr, zf, z1 and at most FORM_RING_STEP apart. */
function ribRings(r: Ribs): number[] {
  const breaks = [r.z0, r.zr, r.zf, r.z1];
  const out: number[] = [r.z0];
  for (let i = 1; i < breaks.length; i++) {
    const from = breaks[i - 1]!;
    const to = breaks[i]!;
    const n = Math.ceil((to - from) / FORM_RING_STEP - 1e-9);
    for (let j = 1; j <= n; j++) out.push(j === n ? to : from + ((to - from) * j) / n);
  }
  return out;
}

/** The rib pattern g(θ, z) ∈ [0, 1]: 1 on a ridge, 0 between ridges. */
function ribPattern(form: SegmentSpec['form'], r: Ribs): (theta: number, z: number) => number {
  switch (form) {
    case 'star':
      // triangular wave, a ridge at θ = 0
      return (theta) => {
        const u = (theta * STAR_POINTS) / (2 * Math.PI);
        return Math.abs(1 - 2 * (u - Math.floor(u)));
      };
    case 'twist': {
      // the flute pattern, turning by TWIST_TURN_DEG while the envelope is flat (it then
      // only leans as far as twistAmplitude allows; the rise and fall stay vertical)
      const turn = TWIST_TURN_DEG * DEG;
      const flat = r.zf - r.zr;
      return (theta, z) => {
        const phase = flat > 0 ? turn * Math.min(1, Math.max(0, (z - r.zr) / flat)) : 0;
        return (1 + Math.cos(TWIST_LOBES * (theta - phase))) / 2;
      };
    }
    default:
      return (theta) => (1 + Math.cos(FLUTE_LOBES * theta)) / 2;
  }
}

/** The radial warp of a ribbed form, applied to the revolved body by the builder. */
export interface RibWarp {
  /** Only vertices strictly inside (z0, z1) move. */
  z0: number;
  z1: number;
  /** Outward offset, mm, at azimuth θ (radians, atan2(y, x)) and height z. */
  offset(theta: number, z: number): number;
}

/** The warp of a ribbed form; null for round forms and forms without room. */
export function formWarp(s: SegmentSpec): RibWarp | null {
  const r = ribs(s);
  if (!r) return null;
  const g = ribPattern(s.form, r);
  return { z0: r.z0, z1: r.z1, offset: (theta, z) => ribEnvelope(r, z) * g(theta, z) };
}

/** A radius moved by the form's warp (identity for round forms): r + e(z)·g(θ, z). */
export function warpRadius(s: SegmentSpec, r: number, theta: number, z: number): number {
  const w = formWarp(s);
  return w ? r + w.offset(theta, z) : r;
}

// ---------------------------------------------------------------- profiles

/**
 * The segment ring profile around a body: `outer` and `inner` run from z0 up to z1
 * (both may be empty: a straight body). Outside them the points are the joint's,
 * documented in profiles/segment.ts; with empty bodies this is the straight profile.
 */
export function jointProfile(s: SegmentSpec, outer: readonly Pt[] = [], inner: readonly Pt[] = []): Profile {
  const R = s.D / 2;
  const { wall: w, overlap: ov, clearance: c, leadIn: l, height: H } = s;
  return dedupe([
    [R + c, 0],
    [R + c + w, 0],
    [R + c + w, ov],
    [R, ov + w + c],
    ...outer,
    [R, H - l],
    [R - l, H],
    [R - l - w, H],
    [R - w, H - l],
    ...[...inner].reverse(),
    [R - w, ov + w + c],
    [R + c, ov],
  ]);
}

/** A body line moved inward by the wall (the inner surface of a vase-mode wall). */
const inward = (line: readonly Pt[], w: number): Pt[] => line.map(([r, z]) => [r - w, z] as Pt);

/** Profile of a round form (the straight profile when it has no room). */
export function roundFormProfile(s: SegmentSpec): Profile {
  const curve = roundFormCurve(s);
  return jointProfile(s, curve, inward(curve, s.wall));
}

/** Profile of a ribbed form before the warp: the straight profile with its rings in the zone. */
export function ribbedProfile(s: SegmentSpec): Profile {
  const r = ribs(s);
  if (!r) return jointProfile(s);
  const R = s.D / 2;
  const line = ribRings(r).map((z) => [R, z] as Pt);
  return jointProfile(s, line, inward(line, s.wall));
}

// ---------------------------------------------------------------- envelope

/**
 * An (r, z) profile that bounds the solid: the exact profile for round forms; for
 * ribbed forms the straight profile with e(z) added to its outer surface (the inner
 * surface stays at R − w, where the valleys keep it).
 */
export function segmentEnvelope(s: SegmentSpec): Profile {
  const r = ribs(s);
  if (!r) return roundFormProfile(s);
  const R = s.D / 2;
  return jointProfile(s, [
    [R, r.z0],
    [R + r.a, r.zr],
    [R + r.a, r.zf],
    [R, r.z1],
  ]);
}

/** Outer radius of the envelope's body at height z: the form's radius inside the zone, R outside. */
export function formEnvelopeAt(s: SegmentSpec, z: number): number {
  const R = s.D / 2;
  const r = ribs(s);
  if (r) return R + ribEnvelope(r, z);
  return radiusOnLine(roundFormCurve(s), z) ?? R;
}

/** Radius of a z-ascending line at height z (linear between points), undefined outside it. */
function radiusOnLine(line: readonly Pt[], z: number): number | undefined {
  if (line.length === 0 || z < line[0]![1] || z > line[line.length - 1]![1]) return undefined;
  for (let i = 1; i < line.length; i++) {
    const [r0, za] = line[i - 1]!;
    const [r1, zb] = line[i]!;
    if (z <= zb) return zb > za ? r0 + ((r1 - r0) * (z - za)) / (zb - za) : Math.max(r0, r1);
  }
  return line[line.length - 1]![0];
}

/**
 * Smallest and largest outer radius of the envelope's body over [zLo, zHi] (R where the
 * range leaves the zone). The envelope is linear between its points, so its points in
 * the range and the two ends are enough.
 */
export function formRadiusRange(s: SegmentSpec, zLo: number, zHi: number): [number, number] {
  const r = ribs(s);
  const zs = r ? [r.z0, r.zr, r.zf, r.z1] : roundFormCurve(s).map(([, z]) => z);
  let min = Infinity;
  let max = -Infinity;
  for (const z of [zLo, zHi, ...zs.filter((z) => z > zLo && z < zHi)]) {
    const v = formEnvelopeAt(s, z);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return [min, max];
}

/** Largest radius of the segment (the envelope's), at least the socket's. */
export function segmentRMax(s: SegmentSpec): number {
  const socket = s.D / 2 + s.clearance + s.wall;
  const a = effectiveAmplitude(s);
  if (a <= 0 || s.form === 'waist') return socket;
  let rMax = socket;
  for (const [r] of segmentEnvelope(s)) rMax = Math.max(rMax, r);
  return rMax;
}

/** Bounding box of the segment in its print frame: [2·rMax, 2·rMax, H]. */
export function segmentSize(s: SegmentSpec): [number, number, number] {
  const d = 2 * segmentRMax(s);
  return [d, d, s.height];
}
