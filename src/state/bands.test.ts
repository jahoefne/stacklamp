import { describe, expect, it } from 'vitest';
import { fitBands, paintBand, replaceColour } from './bands';
import { defaultConfig } from './config';
import type { LampConfig } from './config';
import { generateBands } from './generators';
import { DEFAULT_PALETTE } from './palette';

const P = DEFAULT_PALETTE;

describe('fitBands', () => {
  it('repeats a shorter stored pattern and truncates a longer one', () => {
    expect(fitBands(['red', 'blu'], 5, P, null)).toEqual(['red', 'blu', 'red', 'blu', 'red']);
    expect(fitBands(['red', 'blu', 'grn', 'tea'], 2, P, null)).toEqual(['red', 'blu']);
  });
  it('maps unknown ids to palette[0] and fills an empty pattern with it', () => {
    expect(fitBands(['red', 'zzz'], 3, P, null)).toEqual(['red', 'clr', 'red']);
    expect(fitBands([], 3, P, null)).toEqual(['clr', 'clr', 'clr']);
    expect(fitBands(['red'], 0, P, null)).toEqual([]);
  });
  it('regenerates generator-driven stacks for any n (mirrored stays mirrored)', () => {
    const gen = { kind: 'gradient' as const, colours: ['amb', 'org', 'red'], mirrored: true };
    for (const n of [3, 8, 11, 17]) {
      const out = fitBands(['grn'], n, P, gen);
      expect(out).toEqual(generateBands(gen, n));
      expect(out).toEqual([...out].reverse());
    }
  });
  it('an empty generator falls back to the stored pattern', () => {
    expect(fitBands(['red'], 2, P, { kind: 'alternate', colours: [] })).toEqual(['red', 'red']);
  });
});

describe('paintBand', () => {
  const base = (): LampConfig => ({ ...defaultConfig(), bands: { inner: ['red', 'blu', 'grn', 'tea', 'vio'], outer: [] } });

  it('materialises fitted(n) + stored beyond n, sets the band and clears the generator', () => {
    const c = defaultConfig();
    const fitted = fitBands(c.bands.outer, 6, c.palette, c.gen.outer);
    const next = paintBand(c, 'outer', 2, 'blu', 6);
    expect(next.gen.outer).toBeNull();
    expect(next.bands.outer.slice(0, 6)).toEqual(fitted.map((id, i) => (i === 2 ? 'blu' : id)));
    expect(next.gen.inner).toBe(c.gen.inner);
  });
  it('keeps stored bands beyond N (lossless across N changes)', () => {
    const c = base();
    const next = paintBand(c, 'inner', 0, 'amb', 3);
    expect(next.bands.inner).toEqual(['amb', 'blu', 'grn', 'tea', 'vio']);
  });
  it('is a no-op (same reference) for out-of-range, unknown colour or unchanged band', () => {
    const c = base();
    expect(paintBand(c, 'inner', 3, 'amb', 3)).toBe(c);
    expect(paintBand(c, 'inner', -1, 'amb', 3)).toBe(c);
    expect(paintBand(c, 'inner', 0, 'nope', 3)).toBe(c);
    expect(paintBand(c, 'inner', 0, 'red', 3)).toBe(c);
  });
});

describe('replaceColour', () => {
  it('replaces every occurrence', () => {
    expect(replaceColour(['a', 'b', 'a'], 'a', 'c')).toEqual(['c', 'b', 'c']);
  });
});
