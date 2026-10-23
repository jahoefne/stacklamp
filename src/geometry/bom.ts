/**
 * Bill of materials from built parts: per mesh (copies, volume, mass, filament
 * length; a segment stack has one mesh per form in use) and per colour (how
 * many inner/outer segments, mass, length). Pure.
 */
import { DEFAULT_FORM, partFileStem } from './forms';
import type { Bom, BomColourRow, BomPartRow, ColourPlan, DerivedDims, PartMesh } from './types';

/** PETG density, g/cm³. */
export const PETG_DENSITY_G_CM3 = 1.27;
/** Filament diameter, mm. */
export const FILAMENT_DIAMETER_MM = 1.75;
const FILAMENT_AREA_MM2 = Math.PI * (FILAMENT_DIAMETER_MM / 2) ** 2;

/** Filament length for a volume, metres. */
export const metresOf = (volumeMm3: number): number => volumeMm3 / FILAMENT_AREA_MM2 / 1000;
/** Mass of a solid volume, grams. */
export const gramsOf = (volumeMm3: number): number => (volumeMm3 * PETG_DENSITY_G_CM3) / 1000;
/** Filament length for a printed mass, metres. */
export const metresOfGrams = (grams: number): number => metresOf((grams * 1000) / PETG_DENSITY_G_CM3);

/**
 * One part row per mesh (`file` is the ZIP file stem, e.g. `inner-segment-ball`), one colour
 * row per colour id. A band's mass is the mesh of its stack with the band's form (the stack's
 * only mesh when the dims or the meshes carry no forms).
 */
export function computeBom(parts: readonly PartMesh[], dims: DerivedDims, plan: ColourPlan): Bom {
  const rows: BomPartRow[] = parts.map((m) => ({
    part: m.id,
    ...(m.form ? { form: m.form } : {}),
    file: partFileStem(m.id, m.form),
    copies: m.copies,
    volumeMm3Each: m.volume,
    gramsEach: m.massGrams.solid,
    gramsEstimateEach: m.massGrams.estimate,
    // filament actually printed: the realistic estimate (walls + infill), not the solid volume
    metresEach: metresOfGrams(m.massGrams.estimate),
    fitsBed: dims.fit[m.id].fitsBed,
    fitsZ: dims.fit[m.id].fitsZ,
  }));
  const meshOf = (stack: 'inner' | 'outer', band: number): PartMesh | undefined => {
    const id = stack === 'inner' ? 'inner-segment' : 'outer-segment';
    const meshes = parts.filter((m) => m.id === id);
    const form = dims[stack].forms?.[band] ?? DEFAULT_FORM;
    return meshes.find((m) => (m.form ?? DEFAULT_FORM) === form) ?? (meshes.length === 1 ? meshes[0] : undefined);
  };
  const colours = new Map<string, BomColourRow>();
  const add = (stack: 'inner' | 'outer', id: string, band: number): void => {
    const row = colours.get(id) ?? { colourId: id, inner: 0, outer: 0, grams: 0, metres: 0 };
    const m = meshOf(stack, band);
    row[stack] += 1;
    if (m) {
      row.grams += m.massGrams.estimate;
      row.metres += metresOfGrams(m.massGrams.estimate);
    }
    colours.set(id, row);
  };
  plan.inner.forEach((id, k) => add('inner', id, k));
  plan.outer.forEach((id, k) => add('outer', id, k));
  const totalGrams = rows.reduce((s, r) => s + r.gramsEstimateEach * r.copies, 0);
  const totalMetres = rows.reduce((s, r) => s + r.metresEach * r.copies, 0);
  return { parts: rows, colours: [...colours.values()], totalGrams, totalMetres, densityGcm3: PETG_DENSITY_G_CM3 };
}
