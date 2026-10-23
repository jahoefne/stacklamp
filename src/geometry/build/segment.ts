/**
 * Segment (and fit-test) solid: one revolve of the ring profile. A ribbed form
 * (star, flute, twist) then moves the revolved vertices of its zone outward by
 * its warp, inner and outer surface alike; it is revolved finer at export so
 * the ridges stay crisp.
 */
import type { Manifold, Scope } from '../kernel';
// a cycle with ./index, read only when a warp fails (never at load time)
import { BuildError } from './index';
import type { SegmentSpec } from '../layout';
import { assertSimpleCCW } from '../profile';
import { RIBBED_EXPORT_SEGMENTS, formWarp, segmentRMax } from '../profiles/forms';
import { segmentProfile } from '../profiles/segment';
import type { Resolution } from '../quality';

export { segmentRMax } from '../profiles/forms';

/** Segments around the axis the segment is revolved with. */
export function segmentRevolveSegments(spec: SegmentSpec, res: Resolution): number {
  const n = res.revolve(segmentRMax(spec));
  return res.quality === 'export' && formWarp(spec) ? Math.max(n, RIBBED_EXPORT_SEGMENTS) : n;
}

export function buildSegment(s: Scope, spec: SegmentSpec, res: Resolution): Manifold {
  const profile = segmentProfile(spec);
  assertSimpleCCW(profile, 'segment profile');
  const body = s.add(s.k.Manifold.revolve([profile], segmentRevolveSegments(spec, res)));
  const warp = formWarp(spec);
  if (!warp) return body;
  // the kernel's warp checks its result and throws without freeing it, so a body that is
  // already broken stops here
  const status = body.status();
  if (status !== 'NoError') throw new BuildError(`${spec.form} segment: Manifold status ${status} before the warp`);
  const { z0, z1 } = warp;
  let warped: Manifold;
  try {
    warped = body.warpBatch((v, count) => {
      for (let i = 0; i < count; i++) {
        const z = v[3 * i + 2]!;
        if (z <= z0 || z >= z1) continue;
        const x = v[3 * i]!;
        const y = v[3 * i + 1]!;
        const r = Math.hypot(x, y);
        const d = warp.offset(Math.atan2(y, x), z);
        if (d === 0 || r === 0) continue;
        const scale = (r + d) / r;
        v[3 * i] = x * scale;
        v[3 * i + 1] = y * scale;
      }
    });
  } catch (err) {
    // the warped solid failed the kernel's own check (the scope still frees `body`)
    throw new BuildError(`${spec.form} segment: the warp failed (${err instanceof Error ? err.message : String(err)})`);
  }
  return s.swap(body, warped);
}
