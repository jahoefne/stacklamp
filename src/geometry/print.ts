/**
 * Slicer settings that follow from the nozzle: what PRINT-PLAN.md tells the
 * maker for the normal-mode parts and what the mass estimates (estimate.ts)
 * assume. The 0.6 mm values are the ones calibrated against Bambu Studio
 * slices; the others follow the same rules on the other nozzles' profiles.
 * Pure data, no kernel.
 */
import type { NozzleId, NozzlePreset } from './types';

export interface ShellSettings {
  /** Wall thickness (loops × line width), mm. */
  wall: number;
  /** Top / bottom shell thickness, mm. */
  topBottom: number;
  /** Sparse infill density, 0..1. */
  infill: number;
}

/** Base: 4 walls, 20 % gyroid, and a top/bottom shell of about BASE_SHELL_MM in whole layers. */
export const BASE_WALLS = 4;
export const BASE_INFILL = 0.2;
/** 5 layers at 0.3 mm, the calibrated original. */
export const BASE_SHELL_MM = 1.5;
/** Cover: 3 walls, 20 % infill, at the nozzle's fine layer height. */
export const COVER_WALLS = 3;
export const COVER_INFILL = 0.2;

/**
 * Top and bottom shell of the cover, mm, as Bambu Studio's Standard profile for the nozzle
 * lays them down at the fine layer height. The profiles ask for 3 top layers but at least
 * 0.8 mm (5 layers / 1.0 mm on the 0.4 nozzle), rounded UP to whole layers, and 3 bottom
 * layers: 0.4 → 5 × 0.2 / 3 × 0.2, 0.6 → 4 × 0.2 / 3 × 0.2, 0.8 → 4 × 0.24 / 3 × 0.24.
 */
const COVER_SHELLS: Record<NozzleId, [top: number, bottom: number]> = {
  '0.4': [1.0, 0.6],
  '0.6': [0.8, 0.6],
  '0.8': [0.96, 0.72],
};

/** Top and bottom shell layers of the base at the nozzle's layer height (8 / 5 / 4). */
export const baseShellLayers = (nz: NozzlePreset): number => Math.max(3, Math.round(BASE_SHELL_MM / nz.layer));

export function baseShell(nz: NozzlePreset): ShellSettings {
  return { wall: BASE_WALLS * nz.lineWidth, topBottom: baseShellLayers(nz) * nz.layer, infill: BASE_INFILL };
}

/**
 * The estimate erodes the cover by the mean of its top and bottom shell. The first solid
 * layer over the sparse core is bridged as a round bead of the line width rather than a flat
 * layer (Bambu's slices: 8.7 / 12.9 / 16.3 g of "Bridge" on the 0.4 / 0.6 / 0.8 nozzle, in the
 * ratio of π/4 × line width), so that bead's extra height joins the top shell. With it the
 * cover is within 5 % of the slices on every nozzle; without it the 0.8 mm cover is 6 % light.
 * The base keeps the plain shell model: it matches within 3 % on every nozzle as it is.
 */
export function coverShell(nz: NozzlePreset): ShellSettings {
  const [top, bottom] = COVER_SHELLS[nz.id];
  const bridge = Math.max(0, (nz.lineWidth * Math.PI) / 4 - nz.fineLayer);
  return { wall: COVER_WALLS * nz.lineWidth, topBottom: (top + bridge + bottom) / 2, infill: COVER_INFILL };
}
