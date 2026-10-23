/**
 * The assembled lamp as (r, z) profiles in world coordinates: base, every
 * segment, the cover (flipped), the plate clamp, the weight plate (not
 * printed, but it must fit) and the rod. Revolved parts interfere in 3D
 * exactly when their profiles overlap in this half plane, so the
 * interference tests intersect these polygons (CrossSection) instead of
 * building and intersecting solids. A segment is its form's envelope: the
 * exact profile of a round form, the profile bounding every rib of a ribbed
 * one (a conservative test there).
 */
import { derive } from './derive';
import type { Kernel } from './kernel';
import { scoped } from './kernel';
import { flipProfile, translateProfile, type Profile } from './profile';
import { baseProfile } from './profiles/base';
import { clampProfile } from './profiles/clamp';
import { coverProfile } from './profiles/cover';
import { segmentEnvelope } from './profiles/forms';
import type { LampParams, PartId } from './types';

export interface SectionPiece {
  /** e.g. `outer-segment#3` */
  name: string;
  part: PartId | 'rod' | 'plate';
  /** Index within the stack (0 = bottom); 0 for single parts. */
  index: number;
  polygon: Profile;
}

export function assemblySection(p: LampParams, arcSegments = 8): SectionPiece[] {
  const { dims, layout } = derive(p);
  if (!layout) return [];
  const { specs } = layout;
  const out: SectionPiece[] = [{ name: 'base', part: 'base', index: 0, polygon: baseProfile(specs.base, arcSegments) }];
  for (const [part, stack] of [
    ['inner-segment', 'inner'],
    ['outer-segment', 'outer'],
  ] as const) {
    const s = dims[stack];
    const straight = segmentEnvelope(specs[stack]);
    const byForm = new Map(specs.variants[stack].map((v) => [v.form, segmentEnvelope(v.spec)]));
    for (let k = 0; k < s.count; k++) {
      const prof = byForm.get(s.forms[k] ?? 'straight') ?? straight;
      out.push({ name: `${part}#${k + 1}`, part, index: k, polygon: translateProfile(prof, s.stackBottomZ + k * s.pitch) });
    }
  }
  out.push({
    name: 'top-cover',
    part: 'top-cover',
    index: 0,
    polygon: flipProfile(coverProfile(specs.cover, arcSegments), dims.cover.topZ),
  });
  out.push({
    name: 'plate-clamp',
    part: 'plate-clamp',
    index: 0,
    polygon: translateProfile(clampProfile(specs.clamp), layout.base.clampBottomZ),
  });
  const plateTop = layout.base.pocketDepth;
  const plateBottom = plateTop - p.plate.thickness;
  out.push({
    name: 'plate',
    part: 'plate',
    index: 0,
    polygon: [
      [p.plate.bore / 2, plateBottom],
      [p.plate.od / 2, plateBottom],
      [p.plate.od / 2, plateTop],
      [p.plate.bore / 2, plateTop],
    ],
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
