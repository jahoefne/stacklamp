/**
 * Stored bands → fitted bands (exactly N, bottom → top), and the pure edits on them.
 */
import type { PetgColour } from '../geometry';
import type { GeneratorSpec, LampConfig, Stack } from './config';
import { generateBands } from './generators';

/**
 * Fit a stack's stored bands to `n` segments.
 * - A generator-driven stack (gen with ≥ 1 colour) regenerates for n (mirrored stays mirrored).
 * - Otherwise the stored pattern repeats to length n (longer patterns are truncated).
 * - Ids missing from the palette become palette[0].
 */
export function fitBands(
  stored: readonly string[],
  n: number,
  palette: readonly PetgColour[],
  gen: GeneratorSpec | null,
): string[] {
  if (n <= 0) return [];
  const fallback = palette[0]?.id ?? 'clr';
  const known = new Set(palette.map((c) => c.id));
  let out: string[];
  if (gen && gen.colours.length > 0) out = generateBands(gen, n);
  else if (stored.length > 0) out = Array.from({ length: n }, (_, i) => stored[i % stored.length]!);
  else out = [];
  if (out.length < n) out = [...out, ...Array<string>(n - out.length).fill(fallback)];
  return out.map((id) => (known.has(id) ? id : fallback));
}

/**
 * Paint one band: materialise `[...fitted(n), ...stored.slice(n)]` (so bands beyond N survive),
 * set `index`, and clear the stack's generator. Returns `config` unchanged when the index is out
 * of range, the colour is unknown, or the band already has that colour.
 */
export function paintBand(config: LampConfig, stack: Stack, index: number, colourId: string, n: number): LampConfig {
  if (!Number.isInteger(index) || index < 0 || index >= n) return config;
  if (!config.palette.some((c) => c.id === colourId)) return config;
  const stored = config.bands[stack];
  const fitted = fitBands(stored, n, config.palette, config.gen[stack]);
  if (fitted[index] === colourId) return config;
  const next = [...fitted, ...stored.slice(n)];
  next[index] = colourId;
  return {
    ...config,
    bands: { ...config.bands, [stack]: next },
    gen: { ...config.gen, [stack]: null },
  };
}

/** Replace every `from` id with `to`. */
export function replaceColour(bands: readonly string[], from: string, to: string): string[] {
  return bands.map((id) => (id === from ? to : id));
}

export function bandsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x === b[i]));
}
