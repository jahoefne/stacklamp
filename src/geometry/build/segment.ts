/** Segment (and fit-test) solid: one revolve of the ring profile. */
import type { Manifold, Scope } from '../kernel';
import type { SegmentSpec } from '../layout';
import { assertSimpleCCW } from '../profile';
import { segmentProfile } from '../profiles/segment';
import type { Resolution } from '../quality';

export function segmentRMax(spec: SegmentSpec): number {
  return spec.D / 2 + spec.clearance + spec.wall;
}

export function buildSegment(s: Scope, spec: SegmentSpec, res: Resolution): Manifold {
  const profile = segmentProfile(spec);
  assertSimpleCCW(profile, 'segment profile');
  return s.add(s.k.Manifold.revolve([profile], res.revolve(segmentRMax(spec))));
}
