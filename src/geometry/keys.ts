/**
 * Cache keys. `partsKey(params)` changes exactly when a part mesh (or a part's
 * copy count) would change: it is the canonical JSON of the part specs, which
 * are all the builders read. The printer preset only matters through bedZ
 * (the maximum segment height), which the specs already reflect.
 */
import { derive } from './derive';
import type { PartSpecs } from './layout';
import type { LampParams, PartId, Quality } from './types';

/** JSON with object keys sorted at every level (arrays keep their order). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** The spec a part is built from. */
export function specFor(specs: PartSpecs, id: PartId): PartSpecs[keyof PartSpecs] {
  switch (id) {
    case 'base':
      return specs.base;
    case 'inner-segment':
      return specs.inner;
    case 'outer-segment':
      return specs.outer;
    case 'top-cover':
      return specs.cover;
    case 'fit-test':
      return specs.fitTest;
  }
}

/** Mesh cache key of one part at one quality. */
export function partCacheKey(id: PartId, quality: Quality, specs: PartSpecs): string {
  return `${id}|${quality}|${canonicalJson(specFor(specs, id))}`;
}

export function partsKey(params: LampParams): string {
  const { dims, layout } = derive(params);
  if (!layout) return `invalid:${canonicalJson(params)}`;
  return canonicalJson({ specs: layout.specs, counts: [dims.inner.count, dims.outer.count] });
}
