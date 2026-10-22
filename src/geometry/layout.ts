/**
 * Part layout: every number a part's profile and cutters need, derived from
 * the parameters and the solved stacks. The specs are plain data; the
 * profiles (profiles/*), the kernel builders (build/*) and the mesh cache key
 * (partsKey) all read them. Pure, no kernel.
 *
 * Frames: the base is printed top-up, so its print frame is the world frame
 * (base top at z_t = height). Segments and the fit test stand on their foot
 * (z = 0). The cover is printed plate-down: plate on the bed at z = 0..pt,
 * rings and boss pointing up (flipped into the world by its placement).
 */
import { solveStacks, type SolvedStacks } from './solver';
import type { LampParams } from './types';

// ---------------------------------------------------------------- named constants (mm)

/** Every through-cutter extends this far into free air. */
export const CUTTER_OVERSHOOT = 0.5;
/** 45° chamfer on the base's bottom outer edge (elephant foot). */
export const BASE_BOTTOM_CHAMFER = 0.8;
/** 45° chamfer at the mouth of the underside plate pocket. */
export const POCKET_MOUTH_CHAMFER = 0.8;
/** Material between the pocket ceiling and the socket floor / wire tunnel. */
export const POCKET_CEILING_MIN = 2;
/** Material above the wire tunnel's teardrop tip to the base top (groove bottoms are 2 lower). */
export const TUNNEL_TOP_MARGIN = 4;
/** Material between the tunnel tip and the socket floor when the wire runs through the socket. */
export const TUNNEL_SOCKET_MARGIN = 2;
/** Outer 45° chamfer on the collar top. */
export const COLLAR_TOP_CHAMFER = 0.6;
/** 45° entry chamfer of the rod socket. */
export const SOCKET_ENTRY_CHAMFER = 0.8;
/** Depth of the air grooves below the base top. */
export const GROOVE_DEPTH = 2;
/** Grooves start this far inside a spigot ring's inner wall … */
export const GROOVE_INSIDE = 2;
/** … and end this far beyond the segment foot's outer diameter. */
export const GROOVE_BEYOND = 3;
/** Screw holes sit at least this high above the base top … */
export const SCREW_MIN_Z = 20;
/** … and at least this far above the inner spigot ring so a driver clears it. */
export const SCREW_ABOVE_RING = 6;
/** Material above a screw hole to the collar top. */
export const SCREW_TOP_MARGIN = 1.5;
/** Radial clearance a beside-collar wire hole needs on each side (auto routing). */
export const WIRE_SIDE_CLEARANCE = 1;
/** The tunnel overshoots the base rim by this much. */
export const TUNNEL_RIM_OVERSHOOT = 1;
/** Lead-in on the inside of the cover's rings. */
export const COVER_RING_LEAD_IN = 0.6;
/** Entry chamfer of the cover boss hole. */
export const COVER_HOLE_CHAMFER = 0.6;
/** Radius of the cover's printable rounded top edge (capped by the plate thickness). */
export const COVER_EDGE_ROUND = 2;
/** Slit margins to the rings / boss. */
export const OUTER_SLIT_MARGIN = 6;
export const INNER_SLIT_MARGIN = 3;
/** Minimum material between neighbouring slits at their inner end. */
export const SLIT_GAP = 1.5;
/** Fit-test body above the seat. */
export const FIT_TEST_EXTRA = 15;
/** Copies of the fit test: two rings, pushed into each other. */
export const FIT_TEST_COPIES = 2;
/** Minimum footprint margin to the bed edge on every side. */
export const BED_MARGIN = 5;

// ---------------------------------------------------------------- specs

export interface SegmentSpec {
  kind: 'segment';
  /** Body outer diameter. */
  D: number;
  wall: number;
  overlap: number;
  clearance: number;
  leadIn: number;
  height: number;
}

export interface RingSpec {
  /** Outer radius (= tube body radius). */
  R: number;
  wall: number;
  /** Height above the base top. */
  height: number;
  leadIn: number;
}

export interface IntakeBand {
  rIn: number;
  rOut: number;
}

export interface BaseSpec {
  kind: 'base';
  radius: number;
  /** z of the base top (= H_b). */
  height: number;
  topRound: number;
  bottomChamfer: number;
  pocketRadius: number;
  pocketDepth: number;
  pocketChamfer: number;
  /** Outer ring first. */
  rings: [RingSpec, RingSpec];
  collar: { radius: number; height: number; topChamfer: number };
  bore: { radius: number; floorZ: number; entryChamfer: number };
  intakes: { count: number; width: number; height: number; grooveDepth: number; bands: IntakeBand[]; azimuths: number[] };
  screws: { count: number; radius: number; z: number; r0: number; r1: number; azimuths: number[] };
  wire: {
    routing: 'beside-collar' | 'through-socket';
    /** Axis radius of the vertical hole (0 when through the socket). */
    holeR: number;
    radius: number;
    azimuth: number;
    holeBottomZ: number;
    holeTopZ: number;
    tunnelZ: number;
    tunnelStart: number;
    tunnelEnd: number;
  };
}

export interface SlitSet {
  count: number;
  rIn: number;
  rOut: number;
  /** Azimuth of the first slit, degrees. */
  offset: number;
}

export interface CoverSpec {
  kind: 'cover';
  radius: number;
  plate: number;
  edgeRound: number;
  outerRing: { rIn: number; rOut: number; height: number; leadIn: number };
  innerRing: { rIn: number; rOut: number; height: number; leadIn: number };
  boss: { rOut: number; height: number; holeR: number; ceilingZ: number; holeChamfer: number };
  slits: { width: number; outer: SlitSet; inner: SlitSet };
}

export interface PartSpecs {
  base: BaseSpec;
  inner: SegmentSpec;
  outer: SegmentSpec;
  cover: CoverSpec;
  fitTest: SegmentSpec;
}

export interface BaseLayout {
  height: number;
  /** H_b before rounding up to 0.5 and before minHeight. */
  requiredHeight: number;
  routing: 'beside-collar' | 'through-socket';
  /** Auto routing chose the socket because the collar leaves no room. */
  routedThroughSocket: boolean;
  wireFitsBeside: boolean;
  collarR: number;
  boreR: number;
  pocketR: number;
  pocketDepth: number;
  tunnelZ: number;
  tunnelTop: number;
  screwZAboveTop: number;
  innerRingInnerR: number;
}

export interface Layout {
  solved: SolvedStacks;
  base: BaseLayout;
  specs: PartSpecs;
}

// ---------------------------------------------------------------- helpers

export const ceilHalf = (v: number): number => Math.ceil(v * 2 - 1e-9) / 2;

/** Angular distance in degrees, 0..180. */
export function angleDistance(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export const slotAzimuths = (n: number): number[] => Array.from({ length: n }, (_, k) => ((k + 0.5) * 360) / n);
export const screwAzimuths = (n: number): number[] => Array.from({ length: n }, (_, k) => (k * 360) / n);

/** The 1° grid angle farthest from all `avoid` azimuths (first one on ties; 0 when nothing to avoid). */
export function farthestAzimuth(avoid: readonly number[]): number {
  if (avoid.length === 0) return 0;
  let best = 0;
  let bestD = -1;
  for (let a = 0; a < 360; a++) {
    let d = Infinity;
    for (const b of avoid) d = Math.min(d, angleDistance(a, b));
    if (d > bestD + 1e-9) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function segmentSpec(p: LampParams, D: number, height: number): SegmentSpec {
  return {
    kind: 'segment',
    D,
    wall: p.segments.wall,
    overlap: p.segments.overlap,
    clearance: p.tolerances.segment,
    leadIn: p.segments.rimLeadIn,
    height,
  };
}

export const socketOD = (s: SegmentSpec): number => s.D + 2 * s.clearance + 2 * s.wall;

// ---------------------------------------------------------------- base

export function layoutBase(p: LampParams, ringHeight: number): BaseLayout {
  const collarR = p.core.diameter / 2 + p.tolerances.core + p.base.collarWall;
  const boreR = p.core.diameter / 2 + p.tolerances.core;
  const pocketR = p.plate.od / 2 + p.tolerances.plateRadial;
  const pocketDepth = p.plate.thickness + p.tolerances.plateDepth;
  const rw = p.base.wireDiameter / 2;
  const innerRingInnerR = p.tubes.innerOD / 2 - p.base.ringWall;
  const room = (innerRingInnerR - collarR - 2 * rw) / 2;
  const wireFitsBeside = room >= WIRE_SIDE_CLEARANCE;
  const routing: 'beside-collar' | 'through-socket' =
    p.base.wireRouting === 'auto' ? (wireFitsBeside ? 'beside-collar' : 'through-socket') : p.base.wireRouting;
  const tunnelZ = pocketDepth + POCKET_CEILING_MIN + rw;
  const tunnelTop = tunnelZ + rw * Math.SQRT2;
  const requiredHeight = Math.max(
    pocketDepth + POCKET_CEILING_MIN + p.base.socketBelowTop,
    tunnelTop +
      (routing === 'through-socket'
        ? TUNNEL_SOCKET_MARGIN + p.base.socketBelowTop
        : Math.max(TUNNEL_TOP_MARGIN, p.base.topRound)),
  );
  const height = ceilHalf(Math.max(p.base.minHeight, requiredHeight));
  return {
    height,
    requiredHeight,
    routing,
    routedThroughSocket: p.base.wireRouting === 'auto' && routing === 'through-socket',
    wireFitsBeside,
    collarR,
    boreR,
    pocketR,
    pocketDepth,
    tunnelZ,
    tunnelTop,
    screwZAboveTop: Math.max(SCREW_MIN_Z, ringHeight + SCREW_ABOVE_RING),
    innerRingInnerR,
  };
}

function baseSpec(p: LampParams, b: BaseLayout, ringHeight: number, inner: SegmentSpec, outer: SegmentSpec): BaseSpec {
  const H = b.height;
  const ring = (D: number): RingSpec => ({ R: D / 2, wall: p.base.ringWall, height: ringHeight, leadIn: p.segments.rimLeadIn });
  const rings: [RingSpec, RingSpec] = [ring(p.tubes.outerOD), ring(p.tubes.innerOD)];
  const intakeCount = Math.max(0, Math.round(p.base.intakeCount));
  const bands: IntakeBand[] = [outer, inner].map((s, i) => ({
    rIn: rings[i]!.R - rings[i]!.wall - GROOVE_INSIDE,
    rOut: socketOD(s) / 2 + GROOVE_BEYOND,
  }));
  const intakeAz = slotAzimuths(intakeCount);
  const screwCount = Math.max(0, Math.round(p.base.screwCount));
  const screwAz = screwAzimuths(screwCount);
  const rw = p.base.wireDiameter / 2;
  const holeR = b.routing === 'beside-collar' ? (b.collarR + b.innerRingInnerR) / 2 : 0;
  const azimuth = farthestAzimuth([...intakeAz, ...screwAz]);
  const floorZ = H - p.base.socketBelowTop;
  return {
    kind: 'base',
    radius: p.base.diameter / 2,
    height: H,
    topRound: p.base.topRound,
    bottomChamfer: BASE_BOTTOM_CHAMFER,
    pocketRadius: b.pocketR,
    pocketDepth: b.pocketDepth,
    pocketChamfer: POCKET_MOUTH_CHAMFER,
    rings,
    collar: { radius: b.collarR, height: p.base.collarHeight, topChamfer: COLLAR_TOP_CHAMFER },
    bore: { radius: b.boreR, floorZ, entryChamfer: SOCKET_ENTRY_CHAMFER },
    intakes: {
      count: intakeCount,
      width: p.base.intakeWidth,
      height: p.base.intakeHeight,
      grooveDepth: GROOVE_DEPTH,
      bands,
      azimuths: intakeAz,
    },
    screws: {
      count: screwCount,
      radius: p.base.screwDiameter / 2,
      z: H + b.screwZAboveTop,
      // start inside the socket bore (free air), end beyond the collar
      r0: b.boreR / 2,
      r1: b.collarR + CUTTER_OVERSHOOT,
      azimuths: screwAz,
    },
    wire: {
      routing: b.routing,
      holeR,
      radius: rw,
      azimuth,
      // bottom inside the tunnel, half a radius below its centre: neither
      // tangent to the tunnel floor nor to its widest point
      holeBottomZ: b.tunnelZ - rw / 2,
      holeTopZ: (b.routing === 'beside-collar' ? H : floorZ) + CUTTER_OVERSHOOT,
      tunnelZ: b.tunnelZ,
      // start inside the hole's footprint (not tangent to it)
      tunnelStart: holeR - rw / 2,
      tunnelEnd: p.base.diameter / 2 + TUNNEL_RIM_OVERSHOOT,
    },
  };
}

// ---------------------------------------------------------------- cover

function slitSet(count: number, rIn: number, rOut: number, width: number, halfStep: boolean): SlitSet {
  const n = Math.max(0, Math.round(count));
  let r0 = rIn;
  if (n >= 2) {
    // neighbouring end caps (centres at r0 + width/2) keep SLIT_GAP between them
    const minCentre = (width + SLIT_GAP) / (2 * Math.sin(Math.PI / n));
    r0 = Math.max(rIn, minCentre - width / 2);
  }
  const usable = n > 0 && rOut - r0 >= 2 * width;
  return { count: usable ? n : 0, rIn: r0, rOut, offset: n > 0 && halfStep ? 180 / n : 0 };
}

function coverSpec(p: LampParams): CoverSpec {
  const c = p.tolerances.segment;
  const rw = p.cover.ringWall;
  const pt = p.cover.plateThickness;
  const oIn = p.tubes.outerOD / 2 + c;
  const iIn = p.tubes.innerOD / 2 + c;
  const holeR = p.core.diameter / 2 + p.tolerances.core;
  const bossR = holeR + p.cover.bossWall;
  const width = p.cover.slitWidth;
  return {
    kind: 'cover',
    radius: oIn + rw,
    plate: pt,
    edgeRound: Math.min(COVER_EDGE_ROUND, pt * 0.6),
    outerRing: { rIn: oIn, rOut: oIn + rw, height: p.segments.overlap, leadIn: COVER_RING_LEAD_IN },
    innerRing: { rIn: iIn, rOut: iIn + rw, height: p.cover.innerRingHeight, leadIn: COVER_RING_LEAD_IN },
    boss: {
      rOut: bossR,
      height: p.cover.bossHeight,
      holeR,
      ceilingZ: pt + p.cover.bossHeight - p.cover.bossHoleDepth,
      holeChamfer: COVER_HOLE_CHAMFER,
    },
    slits: {
      width,
      outer: slitSet(p.cover.outerSlits, iIn + rw + OUTER_SLIT_MARGIN, oIn - OUTER_SLIT_MARGIN, width, false),
      inner: slitSet(p.cover.innerSlits, bossR + INNER_SLIT_MARGIN, iIn - INNER_SLIT_MARGIN, width, true),
    },
  };
}

export const coverPrintHeight = (s: CoverSpec): number =>
  s.plate + Math.max(s.outerRing.height, s.innerRing.height, s.boss.height);

// ---------------------------------------------------------------- everything

export function computeLayout(p: LampParams): Layout {
  const solved = solveStacks(p);
  const base = layoutBase(p, solved.ringHeight);
  const inner = segmentSpec(p, p.tubes.innerOD, solved.inner.fit.height);
  const outer = segmentSpec(p, p.tubes.outerOD, solved.outer.fit.height);
  return {
    solved,
    base,
    specs: {
      base: baseSpec(p, base, solved.ringHeight, inner, outer),
      inner,
      outer,
      cover: coverSpec(p),
      fitTest: segmentSpec(p, p.tubes.outerOD, solved.seatZ + FIT_TEST_EXTRA),
    },
  };
}
