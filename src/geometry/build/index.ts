/**
 * Part builders: PartId (+ form for a segment stack) + specs + quality →
 * Manifold (caller owns it) or PartMesh (all WASM memory freed). The kernel is
 * passed in; nothing here imports manifold-3d at runtime.
 */
import { scoped, type Kernel, type Manifold, type Scope } from '../kernel';
import { FIT_TEST_COPIES, type PartSpecs } from '../layout';
import { printedBase, printedClamp, printedCover, printedSegment } from '../estimate';
import { segmentSpecFor } from '../keys';
import { toPartMesh } from '../mesh';
import { resolution, type Resolution } from '../quality';
import type { FormId, PartId, PartMesh, Quality } from '../types';
import { buildBase } from './base';
import { buildClamp } from './clamp';
import { buildCover } from './cover';
import { buildSegment } from './segment';

export { buildBase, baseCutters } from './base';
export { buildClamp } from './clamp';
export { buildCover, slitPolygons } from './cover';
export { buildSegment, segmentRMax } from './segment';
export { segmentSpecFor } from '../keys';

export class BuildError extends Error {
  override name = 'BuildError';
}

/**
 * Build a part's solid inside the scope (the scope owns it). For a segment stack,
 * `form` picks the variant (default: the stack's straight spec).
 */
export function buildInScope(s: Scope, id: PartId, specs: PartSpecs, res: Resolution, form?: FormId): Manifold {
  switch (id) {
    case 'base':
      return buildBase(s, specs.base, res);
    case 'inner-segment':
    case 'outer-segment':
    case 'fit-test':
      return buildSegment(s, segmentSpecFor(specs, id, form), res);
    case 'top-cover':
      return buildCover(s, specs.cover, res);
    case 'plate-clamp':
      return buildClamp(s, specs.clamp, res);
  }
}

/** Build a part's solid; the caller owns the result (dispose it with kernel.dispose). */
export function buildPart(k: Kernel, id: PartId, specs: PartSpecs, quality: Quality, form?: FormId): Manifold {
  return scoped(k, (s) => s.keep(buildInScope(s, id, specs, resolution(quality), form)));
}

/** The printed-volume estimate of a part (see estimate.ts). */
function printedVolume(s: Scope, id: PartId, specs: PartSpecs, res: Resolution, form?: FormId): (volume: number) => number {
  switch (id) {
    case 'base':
      return (v) => printedBase(s, v, specs.base, res.arcPerQuarter);
    case 'top-cover':
      return (v) => printedCover(s, v, specs.cover, Math.max(2, Math.round(res.arcPerQuarter / 2)), res.cutter);
    case 'plate-clamp':
      return (v) => printedClamp(v);
    case 'inner-segment':
    case 'outer-segment':
    case 'fit-test':
      return (v) => printedSegment(v, segmentSpecFor(specs, id, form));
  }
}

/** Copies of a part in the lamp (fit test: two rings to push together). A segment stack's variants split the count by form. */
export function copiesOf(id: PartId, counts: { inner: number; outer: number }): number {
  if (id === 'inner-segment') return counts.inner;
  if (id === 'outer-segment') return counts.outer;
  if (id === 'fit-test') return FIT_TEST_COPIES;
  return 1;
}

/**
 * Build a part and convert it to a PartMesh; every WASM object is freed, also on
 * failure. A segment mesh carries its form (the variant's, or straight).
 */
export function buildPartMesh(k: Kernel, id: PartId, specs: PartSpecs, quality: Quality, copies: number, form?: FormId): PartMesh {
  const res = resolution(quality);
  const meshForm = id === 'inner-segment' || id === 'outer-segment' ? segmentSpecFor(specs, id, form).form : undefined;
  return scoped(k, (s) => {
    const m = buildInScope(s, id, specs, res, form);
    const status = m.status();
    if (status !== 'NoError') throw new BuildError(`${id}${meshForm ? ` (${meshForm})` : ''}: Manifold status ${status}`);
    if (m.isEmpty()) throw new BuildError(`${id}: the solid is empty`);
    return toPartMesh(s, m, { id, form: meshForm, quality, copies, normals: res.normals, printed: printedVolume(s, id, specs, res, form) });
  });
}
