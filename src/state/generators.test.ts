import { describe, expect, it } from 'vitest';
import {
  alternate,
  freshSeed,
  generateBands,
  gradient,
  mirrorBands,
  mulberry32,
  normalizeSpec,
  random,
  specEquals,
  specsForTarget,
} from './generators';

const COLOURS = ['clr', 'smk', 'amb', 'org', 'red', 'vio', 'blu', 'tea', 'grn'];

describe('mulberry32', () => {
  it('is deterministic per seed and spans [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });
  it('freshSeed stays below 36^4 (≤ 4 base-36 chars)', () => {
    expect(freshSeed(() => 0.999999999)).toBeLessThan(36 ** 4);
    expect(freshSeed(() => 0)).toBe(0);
  });
});

describe('alternate / gradient', () => {
  it('alternate = colours[i % k]', () => {
    expect(alternate(['a', 'b', 'c'], 7)).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a']);
  });
  it('gradient = contiguous runs colours[min(k−1, floor(i·k/n))]', () => {
    expect(gradient(['a', 'b', 'c'], 11)).toEqual(['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'c', 'c', 'c']);
    expect(gradient(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    expect(gradient(['a'], 3)).toEqual(['a', 'a', 'a']);
    for (let n = 1; n < 40; n++) {
      const g = gradient(COLOURS.slice(0, 4), n);
      // runs are contiguous: each colour's indices form one block
      for (const c of new Set(g)) {
        const idx = g.flatMap((x, i) => (x === c ? [i] : []));
        expect(idx[idx.length - 1]! - idx[0]! + 1).toBe(idx.length);
      }
    }
  });
  it('empty colour list ⇒ []', () => {
    expect(generateBands({ kind: 'gradient', colours: [] }, 5)).toEqual([]);
    expect(generateBands({ kind: 'random', colours: [], seed: 1 }, 5)).toEqual([]);
  });
});

describe('random (shuffle-bag)', () => {
  it('is deterministic for a seed', () => {
    expect(random(COLOURS, 30, 7)).toEqual(random(COLOURS, 30, 7));
    expect(random(COLOURS, 30, 7)).not.toEqual(random(COLOURS, 30, 8));
  });
  it('never puts equal colours next to each other when k > 1', () => {
    for (let k = 2; k <= COLOURS.length; k++) {
      for (let seed = 0; seed < 40; seed++) {
        const out = random(COLOURS.slice(0, k), 50, seed);
        expect(out).toHaveLength(50);
        for (let i = 1; i < out.length; i++) expect(out[i], `k=${k} seed=${seed} i=${i}`).not.toBe(out[i - 1]);
      }
    }
  });
  it('k = 1 repeats the only colour; duplicates in the input are ignored', () => {
    expect(random(['red'], 4, 3)).toEqual(['red', 'red', 'red', 'red']);
    const out = random(['red', 'red', 'blu'], 10, 3);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
  });
  it('uses every colour about equally (bag rounds)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const out = random(COLOURS.slice(0, 4), 40, seed);
      const counts = new Map<string, number>();
      for (const c of out) counts.set(c, (counts.get(c) ?? 0) + 1);
      for (const c of COLOURS.slice(0, 4)) expect(Math.abs((counts.get(c) ?? 0) - 10)).toBeLessThanOrEqual(1);
    }
  });
});

describe('mirror', () => {
  it('out[i] = b[min(i, n−1−i)] gives a palindrome', () => {
    expect(mirrorBands(['a', 'b', 'c'], 5)).toEqual(['a', 'b', 'c', 'b', 'a']);
    expect(mirrorBands(['a', 'b', 'c'], 6)).toEqual(['a', 'b', 'c', 'c', 'b', 'a']);
  });
  it('a mirrored gradient runs a → z → a over the whole stack', () => {
    const out = generateBands({ kind: 'gradient', colours: ['a', 'b', 'c'], mirrored: true }, 11);
    expect(out).toEqual([...out].reverse());
    expect(out[0]).toBe('a');
    expect(out[5]).toBe('c');
  });
  it('mirrored random is a palindrome and deterministic', () => {
    const spec = { kind: 'random' as const, colours: COLOURS, seed: 99, mirrored: true };
    const out = generateBands(spec, 13);
    expect(out).toEqual([...out].reverse());
    expect(generateBands(spec, 13)).toEqual(out);
  });
});

describe('specs', () => {
  it('normalizeSpec keeps seed only for random and mirrored only when true', () => {
    expect(normalizeSpec({ kind: 'gradient', colours: ['a', 'a', 'b'], seed: 3, mirrored: false })).toEqual({
      kind: 'gradient',
      colours: ['a', 'b'],
    });
    expect(normalizeSpec({ kind: 'random', colours: ['a'] })).toEqual({ kind: 'random', colours: ['a'], seed: 0 });
    expect(specEquals({ kind: 'random', colours: ['a'] }, { kind: 'random', colours: ['a'], seed: 0, mirrored: false })).toBe(true);
    expect(specEquals({ kind: 'random', colours: ['a'], seed: 1 }, { kind: 'random', colours: ['a'], seed: 2 })).toBe(false);
    expect(specEquals(null, null)).toBe(true);
    expect(specEquals(null, { kind: 'alternate', colours: ['a'] })).toBe(false);
  });
  it("target 'both' gives the outer stack seed + 1", () => {
    const s = specsForTarget('random', ['a', 'b'], 'both', 10);
    expect(s.inner?.seed).toBe(10);
    expect(s.outer?.seed).toBe(11);
    expect(specsForTarget('gradient', ['a', 'b'], 'inner', 10)).toEqual({ inner: { kind: 'gradient', colours: ['a', 'b'] } });
  });
});
