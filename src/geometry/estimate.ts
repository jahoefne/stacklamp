/**
 * Realistic printed volume of each part (what the slicer will extrude), for
 * the mass estimates. Calibrated against Bambu Studio slices of the default,
 * LED-tube and A1-mini lamps with the settings PRINT-PLAN.md recommends
 * (within ~4 %).
 *
 *  - Segments and fit test (spiral vase, one line of width w at layer height
 *    h): the extruded line has rounded flanks, so it holds (w − h·(1 − π/4))·h
 *    instead of w·h per mm.
 *  - Base and cover (walls + 20 % infill): the infill core is the (r, z)
 *    profile eroded by the wall thickness sideways and by the top/bottom
 *    shell thickness vertically (an elliptical erosion: scale z, offset,
 *    scale back), revolved. Cover slits get walls too: their plan area
 *    dilated by the wall thickness is taken out of the plate's core.
 *  - Base: tree supports under the plate pocket ceiling ≈ 8 % of the pocket volume.
 *  - Plate clamp: printed solid (100 % infill), so the estimate is the volume.
 *
 * The layer heights, line widths and shells come with the specs (layout.ts
 * derives them from the nozzle via print.ts).
 */
import { slitPolygons } from './build/cover';
import type { CrossSection, Scope, Vec2 } from './kernel';
import type { BaseSpec, CoverSpec, SegmentSpec } from './layout';
import type { ShellSettings } from './print';
import { revolvedVolume, type Profile } from './profile';
import { baseProfile } from './profiles/base';
import { coverProfile } from './profiles/cover';

/** Tree supports under the pocket ceiling, as a fraction of the pocket volume. */
export const SUPPORT_FRACTION = 0.08;

/** Share of the solid wall a vase-mode line of width `wall` at layer height `layer` actually fills. */
export const vaseFill = (wall: number, layer: number): number => Math.max(0.5, 1 - (layer * (1 - Math.PI / 4)) / wall);

/** Volume of the tree supports under the base's pocket ceiling, mm³. */
export const supportVolume = (pocketRadius: number, pocketDepth: number): number =>
  SUPPORT_FRACTION * Math.PI * pocketRadius * pocketRadius * pocketDepth;

/** Revolved volume of the region of `profile` farther than the shell from its boundary, mm³. */
export function coreVolume(s: Scope, profile: Profile, shell: ShellSettings, arcSegments = 16): number {
  const k = shell.wall / shell.topBottom;
  const scaled = s.add(new s.k.CrossSection([profile.map(([r, z]) => [r, z * k] as Vec2)], 'Positive'));
  const core = s.add(scaled.offset(-shell.wall, 'Round', 2, arcSegments * 4));
  let v = 0;
  for (const poly of core.toPolygons()) v += revolvedVolume(poly.map(([r, z]) => [r, z / k] as [number, number]));
  return Math.max(0, v);
}

/** Plan area of the cover slits grown by the wall thickness (cut out of the plate core), mm². */
function slitWallArea(s: Scope, spec: CoverSpec, shell: ShellSettings, segments: number): number {
  const polys = slitPolygons(spec, segments);
  if (polys.length === 0) return 0;
  const slits: CrossSection = s.add(new s.k.CrossSection(polys as Vec2[][], 'Positive'));
  return s.add(slits.offset(shell.wall, 'Round', 2, segments)).area();
}

export function printedSegment(volume: number, spec: SegmentSpec): number {
  return volume * vaseFill(spec.wall, spec.layer);
}

export function printedBase(s: Scope, volume: number, spec: BaseSpec, arcSegments: number): number {
  const shell = spec.shell;
  const core = coreVolume(s, baseProfile(spec, arcSegments), shell, arcSegments);
  return volume - (1 - shell.infill) * core + supportVolume(spec.pocketRadius, spec.pocketDepth);
}

/** The clamp is printed solid: a 3 mm disc whose screw head bears on it. */
export function printedClamp(volume: number): number {
  return volume;
}

export function printedCover(s: Scope, volume: number, spec: CoverSpec, arcSegments: number, cutterSegments: number): number {
  const shell = spec.shell;
  let core = coreVolume(s, coverProfile(spec, arcSegments), shell, arcSegments);
  const plateCore = Math.max(0, spec.plate - 2 * shell.topBottom);
  core = Math.max(0, core - slitWallArea(s, spec, shell, cutterSegments) * plateCore);
  return volume - (1 - shell.infill) * core;
}
