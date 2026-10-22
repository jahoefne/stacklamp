/**
 * The assembled lamp as (r, z) profiles in world coordinates: base, every
 * segment, the cover (flipped) and the rod. Revolved parts interfere in 3D
 * exactly when their profiles overlap in this half plane, so the
 * interference tests intersect these polygons (CrossSection) instead of
 * building and intersecting solids.
 */
import { derive } from './derive';
import type { Kernel } from './kernel';
import { scoped } from './kernel';
import { flipProfile, translateProfile, type Profile } from './profile';
import { baseProfile } from './profiles/base';
import { coverProfile } from './profiles/cover';
import { segmentProfile } from './profiles/segment';
import type { LampParams, PartId } from './types';

export interface SectionPiece {
  /** e.g. `outer-segment#3` */
  name: string;
  part: PartId | 'rod';
  /** Index within the stack (0 = bottom); 0 for single parts. */
  index: number;
  polygon: Profile;
}

export function assemblySection(p: LampParams, arcSegments = 8): SectionPiece[] {
  const { dims, layout } = derive(p);
  if (!layout) return [];
  const { specs } = layout;
  const out: SectionPiece[] = [{ name: 'base', part: 'base', index: 0, polygon: baseProfile(specs.base, arcSegments) }];
  for (const [part, spec, s] of [
    ['inner-segment', specs.inner, dims.inner],
    ['outer-segment', specs.outer, dims.outer],
  ] as const) {
    const prof = segmentProfile(spec);
    for (let k = 0; k < s.count; k++) {
      out.push({ name: `${part}#${k + 1}`, part, index: k, polygon: translateProfile(prof, s.stackBottomZ + k * s.pitch) });
    }
  }
  out.push({
    name: 'top-cover',
    part: 'top-cover',
    index: 0,
    polygon: flipProfile(coverProfile(specs.cover, arcSegments), dims.cover.topZ),
  });
  const r = dims.rod.diameter / 2;
  out.push({
    name: 'rod',
    part: 'rod',
    index: 0,
    polygon: [
      [0, dims.rod.bottomZ],
      [r, dims.rod.bottomZ],
      [r, dims.rod.topZ],
      [0, dims.rod.topZ],
    ],
  });
  return out;
}

/** Area of the overlap of two profiles, mm² (0 when they only touch). */
export function overlapArea(k: Kernel, a: Profile, b: Profile): number {
  return scoped(k, (s) => {
    const ca = s.add(new k.CrossSection([a], 'Positive'));
    const cb = s.add(new k.CrossSection([b], 'Positive'));
    return s.add(k.CrossSection.intersection(ca, cb)).area();
  });
}
