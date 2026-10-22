import { describe, expect, it } from 'vitest';
import { PARAM_META, defaultParams } from '../geometry';
import { ALL_URL_KEYS, CODEC_KEYS, ENUM_PATHS, ENUM_SPECS, NUMERIC_URL_KEYS, PARAM_SPECS, formatNumber } from './paramSpec';
import { enumValues, getEnumParam, withEnumParam } from './paths';

function numericLeaves(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [];
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'number' ? [`${prefix}${k}`] : typeof v === 'object' && v !== null ? numericLeaves(v, `${prefix}${k}.`) : [],
  );
}

describe('paramSpec', () => {
  it('every PARAM_META path has exactly one URL key', () => {
    expect(PARAM_SPECS.map((s) => s.path)).toEqual(PARAM_META.map((m) => m.path));
    expect(Object.keys(NUMERIC_URL_KEYS).sort()).toEqual(PARAM_META.map((m) => m.path).sort());
    for (const s of PARAM_SPECS) expect(s.key, s.path).toMatch(/^[a-z]{2,3}$/);
  });
  it('covers every numeric leaf of defaultParams()', () => {
    const leaves = numericLeaves(defaultParams()).filter((p) => p !== 'version');
    expect(Object.keys(NUMERIC_URL_KEYS).sort()).toEqual(leaves.sort());
  });
  it('all keys (numeric, enum, codec) are unique', () => {
    expect(new Set(ALL_URL_KEYS).size).toBe(ALL_URL_KEYS.length);
    expect(ALL_URL_KEYS).toEqual(expect.arrayContaining(Object.values(CODEC_KEYS)));
  });
  it('enum codes are unique per enum and cover every value', () => {
    for (const path of ENUM_PATHS) {
      const codes = Object.values(ENUM_SPECS[path].codes as Record<string, string>);
      expect(new Set(codes).size, path).toBe(codes.length);
      expect(ENUM_SPECS[path].key).toMatch(/^[a-z]{2}$/);
      for (const v of enumValues(path)) expect(getEnumParam(withEnumParam(defaultParams(), path, v), path)).toBe(v);
    }
  });
  it('formats numbers as the shortest decimal at the precision', () => {
    expect(formatNumber(1500, 0)).toBe('1500');
    expect(formatNumber(0.8, 2)).toBe('0.8');
    expect(formatNumber(0.30000000000000004, 2)).toBe('0.3');
    expect(formatNumber(3.25, 1)).toBe('3.3');
    expect(formatNumber(-0.0001, 1)).toBe('0');
  });
});
