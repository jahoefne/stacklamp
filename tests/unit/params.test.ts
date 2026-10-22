import { describe, expect, it } from 'vitest';
import { NOZZLES, NOZZLE_IDS, PARAM_META, PARAM_META_BY_PATH, defaultParams, deriveDims } from '../../src/geometry';
import { withNozzle } from '../helpers/params';

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
  it('every nozzle has a wall inside its range and the wall field, 1.2–1.5 × the nozzle, that derives without a vase-wall warning', () => {
    const wall = PARAM_META_BY_PATH.get('segments.wall')!;
    const diameters = NOZZLE_IDS.map((id) => NOZZLES[id].diameter);
    expect(diameters).toEqual([...diameters].sort((a, b) => a - b));
    for (const id of NOZZLE_IDS) {
      const nz = NOZZLES[id];
      expect(nz.id).toBe(id);
      expect(nz.wall, id).toBeGreaterThanOrEqual(Math.max(wall.min, nz.wallRange[0]));
      expect(nz.wall, id).toBeLessThanOrEqual(Math.min(wall.max, nz.wallRange[1]));
      expect(nz.wall / nz.diameter, id).toBeGreaterThanOrEqual(1.2);
      expect(nz.wall / nz.diameter, id).toBeLessThanOrEqual(1.5);
      expect(nz.fineLayer, id).toBeLessThanOrEqual(nz.layer);
      const d = deriveDims(withNozzle(id));
      expect(d.ok, id).toBe(true);
      expect(d.messages.map((m) => m.code), id).not.toContain('vase-wall');
    }
  });
});
