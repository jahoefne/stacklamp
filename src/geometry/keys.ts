/**
 * Cache keys. `partsKey(params)` changes exactly when a part mesh (or a part's
 * copy count) would change: it is the canonical JSON of the part specs, which
 * are all the builders read. The printer preset only matters through bedZ
 * (the maximum segment height), which the specs already reflect. The nozzle
 * is in the specs too (layer height, shells): it changes the mass estimates,
 * not the geometry, so a nozzle change rebuilds the parts. The segment forms
 * are in the specs as variants (one per form in use per stack).
 */
import { derive } from './derive';
import type { PartSpecs, SegmentSpec } from './layout';
import type { FormId, LampParams, PartId, Quality } from './types';

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

/**
 * The segment spec a segment part is built from: the stack's variant with `form`
 * (the stack's straight spec when `form` is absent or not in use), or the fit test.
 */
export function segmentSpecFor(specs: PartSpecs, id: 'inner-segment' | 'outer-segment' | 'fit-test', form?: FormId): SegmentSpec {
  if (id === 'fit-test') return specs.fitTest;
  const stack = id === 'inner-segment' ? 'inner' : 'outer';
  if (form === undefined) return specs[stack];
  return specs.variants[stack].find((v) => v.form === form)?.spec ?? specs[stack];
}

/** The spec a part is built from. */
export function specFor(specs: PartSpecs, id: PartId, form?: FormId): PartSpecs['base' | 'cover' | 'clamp'] | SegmentSpec {
  switch (id) {
    case 'base':
      return specs.base;
    case 'inner-segment':
    case 'outer-segment':
    case 'fit-test':
      return segmentSpecFor(specs, id, form);
    case 'top-cover':
      return specs.cover;
    case 'plate-clamp':
      return specs.clamp;
  }
}

/** Mesh cache key of one part (one form of a segment stack) at one quality. */
export function partCacheKey(id: PartId, quality: Quality, specs: PartSpecs, form?: FormId): string {
  return `${id}${form ? `#${form}` : ''}|${quality}|${canonicalJson(specFor(specs, id, form))}`;
}

export function partsKey(params: LampParams): string {
  const { dims, layout } = derive(params);
  if (!layout) return `invalid:${canonicalJson(params)}`;
  return canonicalJson({ specs: layout.specs, counts: [dims.inner.count, dims.outer.count] });
}
