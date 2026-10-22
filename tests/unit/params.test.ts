import { describe, expect, it } from 'vitest';
import { PARAM_META, defaultParams, deriveDims } from '../../src/geometry';

function numericLeaves(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [];
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'number' ? [`${prefix}${k}`] : typeof v === 'object' && v !== null ? numericLeaves(v, `${prefix}${k}.`) : [],
  );
}

describe('params', () => {
  it('PARAM_META covers every numeric leaf of defaultParams exactly once', () => {
    const leaves = numericLeaves(defaultParams()).filter((p) => p !== 'version');
    const metaPaths = PARAM_META.map((m) => m.path);
    expect([...metaPaths].sort()).toEqual([...leaves].sort());
    expect(new Set(metaPaths).size).toBe(metaPaths.length);
  });
  it('defaults are within their meta ranges and derive without errors', () => {
    const p = defaultParams();
    for (const m of PARAM_META) {
      const [g, k] = m.path.split('.') as [keyof typeof p, string];
      const v = (p[g] as Record<string, number>)[k]!;
      expect(v, m.path).toBeGreaterThanOrEqual(m.min);
      expect(v, m.path).toBeLessThanOrEqual(m.max);
    }
    const d = deriveDims(p);
    expect(d.ok).toBe(true);
    expect(d.outer.count).toBeGreaterThan(0);
    expect(d.totalHeight).toBeGreaterThan(p.core.length);
  });
});
