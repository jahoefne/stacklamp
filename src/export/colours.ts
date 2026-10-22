/** Colour plan helpers for the documents and the 3MF viewer hints. */
import type { ColourPlan, PetgColour } from '../geometry/types';

/** Neutral viewer colour for the base and the cover. */
export const NEUTRAL_COLOUR: PetgColour = { id: 'graphite', name: 'Graphite', hex: '#2b2b2e' };

export function colourById(plan: ColourPlan, id: string): PetgColour {
  return plan.palette.find((c) => c.id === id) ?? { id, name: id, hex: '#cccccc' };
}

/** Counts per colour id in first-appearance order. */
export function colourCounts(bands: readonly string[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of bands) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count }));
}

/** "Amber × 4, Teal × 4, Clear × 3" */
export function colourSummary(plan: ColourPlan, bands: readonly string[]): string {
  if (bands.length === 0) return '–';
  return colourCounts(bands)
    .map(({ id, count }) => `${colourById(plan, id).name} × ${count}`)
    .join(', ');
}

/** The most used colour of a stack (viewer hint for its 3MF). */
export function dominantColour(plan: ColourPlan, bands: readonly string[]): PetgColour {
  const counts = colourCounts(bands);
  if (counts.length === 0) return plan.palette[0] ?? NEUTRAL_COLOUR;
  let best = counts[0]!;
  for (const c of counts) if (c.count > best.count) best = c;
  return colourById(plan, best.id);
}
