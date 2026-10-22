/**
 * Cover solid (print frame, plate on the bed): one revolve minus one extruded
 * 2D union of stadium slits through the plate (−0.5 … plate + 0.5).
 */
import type { Manifold, Scope } from '../kernel';
import { CUTTER_OVERSHOOT, type CoverSpec } from '../layout';
import { assertSimpleCCW } from '../profile';
import { coverProfile } from '../profiles/cover';
import type { Resolution } from '../quality';
import { extrudeBetween, rotatePolygon, stadium, unionSection, type Polygon } from './cutters';

export function slitPolygons(spec: CoverSpec, segments: number): Polygon[] {
  const out: Polygon[] = [];
  for (const set of [spec.slits.outer, spec.slits.inner]) {
    if (set.count <= 0) continue;
    const shape = stadium(set.rIn, set.rOut, spec.slits.width, segments);
    for (let k = 0; k < set.count; k++) out.push(rotatePolygon(shape, set.offset + (k * 360) / set.count));
  }
  return out;
}

export function buildCover(s: Scope, spec: CoverSpec, res: Resolution): Manifold {
  const profile = coverProfile(spec, Math.max(2, Math.round(res.arcPerQuarter / 2)));
  assertSimpleCCW(profile, 'cover profile');
  const body = s.add(s.k.Manifold.revolve([profile], res.revolve(spec.radius)));
  const slits = slitPolygons(spec, res.cutter);
  if (slits.length === 0) return body;
  const section = unionSection(s, slits);
  const cutter = extrudeBetween(s, section, -CUTTER_OVERSHOOT, spec.plate + CUTTER_OVERSHOOT);
  return s.add(body.subtract(cutter));
}
