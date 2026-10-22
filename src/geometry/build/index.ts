/**
 * Part builders: PartId + specs + quality → Manifold (caller owns it) or
 * PartMesh (all WASM memory freed). The kernel is passed in; nothing here
 * imports manifold-3d at runtime.
 */
import { scoped, type Kernel, type Manifold, type Scope } from '../kernel';
import { FIT_TEST_COPIES, type PartSpecs } from '../layout';
import { toPartMesh, type MassModel } from '../mesh';
import { resolution, type Resolution } from '../quality';
import type { PartId, PartMesh, Quality } from '../types';
import { buildBase } from './base';
import { buildCover } from './cover';
import { buildSegment } from './segment';

export { buildBase, baseCutters } from './base';
export { buildCover, slitPolygons } from './cover';
export { buildSegment, segmentRMax } from './segment';

export class BuildError extends Error {
  override name = 'BuildError';
}

/** Build a part's solid inside the scope (the scope owns it). */
export function buildInScope(s: Scope, id: PartId, specs: PartSpecs, res: Resolution): Manifold {
  switch (id) {
    case 'base':
      return buildBase(s, specs.base, res);
    case 'inner-segment':
      return buildSegment(s, specs.inner, res);
    case 'outer-segment':
      return buildSegment(s, specs.outer, res);
    case 'top-cover':
      return buildCover(s, specs.cover, res);
    case 'fit-test':
      return buildSegment(s, specs.fitTest, res);
  }
}

/** Build a part's solid; the caller owns the result (dispose it with kernel.dispose). */
export function buildPart(k: Kernel, id: PartId, specs: PartSpecs, quality: Quality): Manifold {
  return scoped(k, (s) => s.keep(buildInScope(s, id, specs, resolution(quality))));
}

export const massModel = (id: PartId): MassModel => (id === 'base' || id === 'top-cover' ? 'solid' : 'vase');

/** Copies of a part in the lamp (fit test: two rings to push together). */
export function copiesOf(id: PartId, counts: { inner: number; outer: number }): number {
  if (id === 'inner-segment') return counts.inner;
  if (id === 'outer-segment') return counts.outer;
  if (id === 'fit-test') return FIT_TEST_COPIES;
  return 1;
}

/** Build a part and convert it to a PartMesh; every WASM object is freed, also on failure. */
export function buildPartMesh(k: Kernel, id: PartId, specs: PartSpecs, quality: Quality, copies: number): PartMesh {
  const res = resolution(quality);
  return scoped(k, (s) => {
    const m = buildInScope(s, id, specs, res);
    const status = m.status();
    if (status !== 'NoError') throw new BuildError(`${id}: Manifold status ${status}`);
    if (m.isEmpty()) throw new BuildError(`${id}: the solid is empty`);
    return toPartMesh(s, m, { id, quality, copies, normals: res.normals, mass: massModel(id) });
  });
}
