/**
 * Circular resolution per quality. Preview: 128 segments for every revolve,
 * 24 for cutter circles, coarse profile arcs. Export: about 1 mm chords on the
 * largest radius (multiple of 8, 192…1024), 48 for cutter circles.
 */
import type { Quality } from './types';

export interface Resolution {
  quality: Quality;
  /** Segments around the axis for a revolve whose largest radius is `rMax`. */
  revolve(rMax: number): number;
  /** Segments of a full cutter circle (screw holes, wire hole, tunnel, slit ends). */
  cutter: number;
  /** Segments per 90° of a profile arc (base top edge, cover edge). */
  arcPerQuarter: number;
  /** Preview meshes carry normals. */
  normals: boolean;
}

export const PREVIEW_REVOLVE_SEGMENTS = 128;
export const EXPORT_MIN_SEGMENTS = 192;
export const EXPORT_MAX_SEGMENTS = 1024;
/** Target chord length on the largest radius at export quality, mm. */
export const EXPORT_CHORD = 1;

export const roundUp8 = (n: number): number => Math.ceil(n / 8) * 8;

export function exportRevolveSegments(rMax: number): number {
  const n = roundUp8((2 * Math.PI * Math.max(0, rMax)) / EXPORT_CHORD);
  return Math.min(EXPORT_MAX_SEGMENTS, Math.max(EXPORT_MIN_SEGMENTS, n));
}

export const PREVIEW: Resolution = {
  quality: 'preview',
  revolve: () => PREVIEW_REVOLVE_SEGMENTS,
  cutter: 24,
  arcPerQuarter: 4,
  normals: true,
};

export const EXPORT: Resolution = {
  quality: 'export',
  revolve: exportRevolveSegments,
  cutter: 48,
  arcPerQuarter: 12,
  normals: false,
};

export const resolution = (q: Quality): Resolution => (q === 'preview' ? PREVIEW : EXPORT);
