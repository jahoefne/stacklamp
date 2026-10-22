/**
 * Pure, seeded colour-band generators. Same spec + same n ⇒ same output, everywhere
 * (the URL stores only the spec; the decoder re-runs it to validate the bands).
 */
import type { GeneratorKind, GeneratorSpec, GenTarget, Stack } from './config';

/** mulberry32 PRNG: deterministic floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeds are kept below 36⁴ so they encode in at most four base-36 chars. */
export const SEED_LIMIT = 36 ** 4;

export function freshSeed(random: () => number = Math.random): number {
  return Math.floor(random() * SEED_LIMIT);
}

export function uniqueColours(colours: readonly string[]): string[] {
  return [...new Set(colours)];
}

/** Canonical form: colours de-duplicated, seed only for random (default 0), mirrored only when true. */
export function normalizeSpec(spec: GeneratorSpec): GeneratorSpec {
  const out: GeneratorSpec = { kind: spec.kind, colours: uniqueColours(spec.colours) };
  if (spec.kind === 'random') out.seed = (spec.seed ?? 0) >>> 0;
  if (spec.mirrored) out.mirrored = true;
  return out;
}

export function specEquals(a: GeneratorSpec | null, b: GeneratorSpec | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const x = normalizeSpec(a);
  const y = normalizeSpec(b);
  return (
    x.kind === y.kind &&
    x.seed === y.seed &&
    !!x.mirrored === !!y.mirrored &&
    x.colours.length === y.colours.length &&
    x.colours.every((c, i) => c === y.colours[i])
  );
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** colours[i % k] */
export function alternate(colours: readonly string[], n: number): string[] {
  const k = colours.length;
  return k === 0 ? [] : Array.from({ length: n }, (_, i) => colours[i % k]!);
}

/** Contiguous runs: colours[min(k − 1, floor(i·k/n))]. */
export function gradient(colours: readonly string[], n: number): string[] {
  const k = colours.length;
  return k === 0 ? [] : Array.from({ length: n }, (_, i) => colours[Math.min(k - 1, Math.floor((i * k) / n))]!);
}

/**
 * Shuffle-bag: every colour appears once per round, in random order. When k > 1 no two
 * neighbours are equal (a draw that would repeat the previous colour takes another one
 * from the bag, adding a fresh round underneath if the bag holds nothing else).
 */
export function random(input: readonly string[], n: number, seed: number): string[] {
  const colours = uniqueColours(input);
  const k = colours.length;
  if (k === 0) return [];
  const rand = mulberry32(seed);
  const out: string[] = [];
  let bag: string[] = [];
  let prev: string | undefined;
  for (let i = 0; i < n; i++) {
    if (bag.length === 0) bag = shuffle([...colours], rand);
    let j = bag.length - 1;
    if (k > 1) {
      while (bag[j] === prev) {
        j--;
        if (j < 0) {
          bag = [...shuffle([...colours], rand), ...bag];
          j = bag.length - 1;
          while (bag[j] === prev) j--;
          break;
        }
      }
    }
    const [pick] = bag.splice(j, 1);
    out.push(pick!);
    prev = pick;
  }
  return out;
}

/** out[i] = b[min(i, n − 1 − i)]: the first ceil(n/2) bands reflected about the middle. */
export function mirrorBands(b: readonly string[], n: number): string[] {
  return Array.from({ length: n }, (_, i) => b[Math.min(i, n - 1 - i)]!);
}

/**
 * Bands for a spec, bottom → top. A mirrored spec generates ceil(n/2) bands and reflects
 * them, so a mirrored gradient runs a → z → a. Empty colour list ⇒ [].
 */
export function generateBands(spec: GeneratorSpec, n: number): string[] {
  const s = normalizeSpec(spec);
  if (n <= 0 || s.colours.length === 0) return [];
  const m = s.mirrored ? Math.ceil(n / 2) : n;
  const base = generateBase(s.kind, s.colours, m, s.seed ?? 0);
  return s.mirrored ? mirrorBands(base, n) : base;
}

export function generateBase(kind: GeneratorKind, colours: readonly string[], n: number, seed = 0): string[] {
  switch (kind) {
    case 'alternate':
      return alternate(colours, n);
    case 'gradient':
      return gradient(colours, n);
    case 'random':
      return random(colours, n, seed);
  }
}

/** Specs for a generator applied to `target`: 'both' gives the outer stack seed + 1. */
export function specsForTarget(
  kind: GeneratorKind,
  colours: readonly string[],
  target: GenTarget,
  seed: number,
): Partial<Record<Stack, GeneratorSpec>> {
  const make = (s: number): GeneratorSpec =>
    normalizeSpec(kind === 'random' ? { kind, colours: [...colours], seed: s } : { kind, colours: [...colours] });
  if (target === 'both') return { inner: make(seed), outer: make(seed + 1) };
  return { [target]: make(seed) };
}
