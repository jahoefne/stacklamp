/**
 * Cutter shapes. The 2D outlines are pure polygon helpers (also used by
 * tests); the 3D helpers create kernel objects inside a Scope.
 *
 * Rules every cutter follows: it overshoots free air by CUTTER_OVERSHOOT
 * where it breaks through a surface, and none of its faces is tangent to or
 * coplanar with a face of the body it cuts.
 */
import type { CrossSection, Manifold, Scope, Vec2 } from '../kernel';
import type { Mat4 as KernelMat4 } from 'manifold-3d';
import { radialFrame, type Mat4 } from '../placements';

/** A column-major 4×4 as the kernel's 16-tuple. */
export function kernelMat4(m: Mat4): KernelMat4 {
  if (m.length !== 16) throw new Error(`A 4×4 matrix needs 16 numbers, not ${m.length}`);
  return m as unknown as KernelMat4;
}

export type Polygon = Vec2[];

/** Rotate polygon points about the origin by `deg` degrees (CCW). */
export function rotatePolygon(poly: readonly Vec2[], deg: number): Polygon {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return poly.map(([x, y]) => [x * c - y * s, x * s + y * c] as Vec2);
}

/** Rectangle along +x from rIn to rOut, `width` wide, centred on the x axis (CCW). */
export function radialRect(rIn: number, rOut: number, width: number): Polygon {
  const h = width / 2;
  return [
    [rIn, -h],
    [rOut, -h],
    [rOut, h],
    [rIn, h],
  ];
}

/** Stadium (slot with round ends) along +x from rIn to rOut (outermost points), `width` wide (CCW). */
export function stadium(rIn: number, rOut: number, width: number, segments: number): Polygon {
  const r = width / 2;
  const half = Math.max(2, Math.round(segments / 2));
  const c0 = rIn + r;
  const c1 = rOut - r;
  const pts: Polygon = [];
  for (let i = 0; i <= half; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / half;
    pts.push([c1 + r * Math.cos(a), r * Math.sin(a)]);
  }
  for (let i = 0; i <= half; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / half;
    pts.push([c0 + r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Teardrop section (x across, y up) of a horizontal hole of radius r, centred
 * on the origin: a circle whose top is a 45° roof meeting at (0, r·√2), so
 * the hole prints without supports (CCW).
 */
export function teardrop(r: number, segments: number): Polygon {
  const n = Math.max(6, Math.round((segments * 3) / 4));
  const pts: Polygon = [[0, r * Math.SQRT2]];
  for (let i = 0; i <= n; i++) {
    const a = (3 * Math.PI) / 4 + ((3 * Math.PI) / 2) * (i / n);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/** One CrossSection from several (possibly overlapping) polygons: their union. */
export function unionSection(s: Scope, polys: readonly Polygon[]): CrossSection {
  return s.add(new s.k.CrossSection(polys as Vec2[][], 'Positive'));
}

/** Extrude a section from z0 to z1. */
export function extrudeBetween(s: Scope, section: CrossSection, z0: number, z1: number): Manifold {
  const solid = s.add(section.extrude(z1 - z0));
  return s.swap(solid, solid.translate([0, 0, z0]));
}

/** A vertical cylinder at (x, y) from z0 to z1. */
export function verticalCylinder(s: Scope, x: number, y: number, z0: number, z1: number, radius: number, segments: number): Manifold {
  const c = s.add(s.k.Manifold.cylinder(z1 - z0, radius, radius, segments));
  return s.swap(c, c.translate([x, y, z0]));
}

/** A horizontal cylinder along the radial direction at `azimuth`, from radius r0 to r1 at height z. */
export function radialCylinder(
  s: Scope,
  azimuth: number,
  r0: number,
  r1: number,
  z: number,
  radius: number,
  segments: number,
): Manifold {
  const c = s.add(s.k.Manifold.cylinder(r1 - r0, radius, radius, segments));
  return s.swap(c, c.transform(kernelMat4(radialFrame(azimuth, r0, z))));
}

/** A section (x across, y up) swept along the radial direction at `azimuth` from r0 to r1, centred at height z. */
export function radialPrism(s: Scope, section: Polygon, azimuth: number, r0: number, r1: number, z: number): Manifold {
  const cs = s.add(new s.k.CrossSection([section], 'Positive'));
  const solid = s.add(cs.extrude(r1 - r0));
  return s.swap(solid, solid.transform(kernelMat4(radialFrame(azimuth, r0, z))));
}
