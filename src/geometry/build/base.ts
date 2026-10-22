/**
 * Base solid: one revolve minus ONE union of cutters:
 *  - intake slots + grooves: one 2D union of rotated rectangles (both rings),
 *    extruded from z_t − grooveDepth to z_t + intakeHeight;
 *  - radial screw holes (from inside the socket bore to beyond the collar);
 *  - the vertical wire hole (bottom inside the tunnel, top 0.5 above the
 *    surface it opens into);
 *  - the teardrop wire tunnel (from inside the hole's footprint to 1 beyond the rim).
 */
import type { Manifold, Scope } from '../kernel';
import type { BaseSpec } from '../layout';
import { assertSimpleCCW } from '../profile';
import { baseProfile } from '../profiles/base';
import type { Resolution } from '../quality';
import {
  extrudeBetween,
  radialCylinder,
  radialPrism,
  radialRect,
  rotatePolygon,
  teardrop,
  unionSection,
  verticalCylinder,
  type Polygon,
} from './cutters';

export function baseCutters(s: Scope, spec: BaseSpec, res: Resolution): Manifold[] {
  const cutters: Manifold[] = [];
  const H = spec.height;
  const { intakes, screws, wire } = spec;
  if (intakes.count > 0) {
    const rects: Polygon[] = [];
    for (const band of intakes.bands) {
      const rect = radialRect(band.rIn, band.rOut, intakes.width);
      for (const az of intakes.azimuths) rects.push(rotatePolygon(rect, az));
    }
    const section = unionSection(s, rects);
    cutters.push(extrudeBetween(s, section, H - intakes.grooveDepth, H + intakes.height));
  }
  for (const az of screws.azimuths) {
    cutters.push(radialCylinder(s, az, screws.r0, screws.r1, screws.z, screws.radius, res.cutter));
  }
  const a = (wire.azimuth * Math.PI) / 180;
  cutters.push(
    verticalCylinder(
      s,
      wire.holeR * Math.cos(a),
      wire.holeR * Math.sin(a),
      wire.holeBottomZ,
      wire.holeTopZ,
      wire.radius,
      res.cutter,
    ),
  );
  cutters.push(radialPrism(s, teardrop(wire.radius, res.cutter), wire.azimuth, wire.tunnelStart, wire.tunnelEnd, wire.tunnelZ));
  return cutters;
}

export function buildBase(s: Scope, spec: BaseSpec, res: Resolution): Manifold {
  const profile = baseProfile(spec, res.arcPerQuarter);
  assertSimpleCCW(profile, 'base profile');
  const body = s.add(s.k.Manifold.revolve([profile], res.revolve(spec.radius)));
  const cutters = baseCutters(s, spec, res);
  const all = s.add(s.k.Manifold.union(cutters));
  return s.add(body.subtract(all));
}
