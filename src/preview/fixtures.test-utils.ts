/**
 * Test fixtures for the preview: hand-built PartMeshes (engine-agnostic, no worker)
 * plus real derived dims from the geometry barrel.
 */
import { defaultParams, deriveDims, type DerivedDims, type FormId, type PartId, type PartMesh } from '../geometry';

/** Closed annular tube, print frame (bed at z = 0), `n` facets. */
export function tubeMesh(id: PartId, ro: number, ri: number, h: number, n = 32, withNormals = false): PartMesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const [r, z, sign] of [
    [ro, 0, 1],
    [ro, h, 1],
    [ri, 0, -1],
    [ri, h, -1],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      pos.push(r * Math.cos(a), r * Math.sin(a), z);
      nor.push(sign * Math.cos(a), sign * Math.sin(a), 0);
    }
  }
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    quad(k, k1, n + k1, n + k);
    quad(2 * n + k1, 2 * n + k, 3 * n + k, 3 * n + k1);
    quad(n + k, n + k1, 3 * n + k1, 3 * n + k);
    quad(k1, k, 2 * n + k, 2 * n + k1);
  }
  const positions = new Float32Array(pos);
  const mesh: PartMesh = {
    id,
    quality: 'preview',
    positions,
    indices: new Uint32Array(idx),
    triangleCount: idx.length / 3,
    volume: Math.PI * (ro * ro - ri * ri) * h,
    bbox: { min: [-ro, -ro, 0], max: [ro, ro, h] },
    copies: 1,
    massGrams: { solid: 1, estimate: 1 },
  };
  if (withNormals) mesh.normals = new Float32Array(nor);
  return mesh;
}

export function defaultDims(): DerivedDims {
  return deriveDims(defaultParams());
}

/**
 * A segment stack as the worker yields it: one mesh per distinct form in `forms` (first use
 * first), each with `form` set and as many copies as bands with that form. A non-straight
 * form gets a slightly wider tube so the geometries differ.
 */
export function stackMeshes(id: 'inner-segment' | 'outer-segment', D: number, height: number, forms: readonly FormId[]): PartMesh[] {
  const copies = new Map<FormId, number>();
  for (const f of forms) copies.set(f, (copies.get(f) ?? 0) + 1);
  return [...copies].map(([form, n]) => {
    const ro = D / 2 + (form === 'straight' ? 0 : 5);
    return { ...tubeMesh(id, ro, D / 2 - 0.8, height), form, copies: n };
  });
}

/** One mesh per assembly part (one per form in use for a segment stack), sized from the dims. */
export function fixtureParts(d: DerivedDims = defaultDims()): PartMesh[] {
  return [
    tubeMesh('base', 120, 15, d.base.height),
    ...stackMeshes('inner-segment', d.inner.D, d.inner.height, d.inner.forms),
    ...stackMeshes('outer-segment', d.outer.D, d.outer.height, d.outer.forms),
    tubeMesh('top-cover', d.cover.od / 2, 12, 3),
    tubeMesh('plate-clamp', d.base.clampDiameter / 2, 2.25, 3),
  ];
}

/** Bands of the inner stack that get the ball form in `formFixture` (the rest is straight). */
export const BALL_BANDS: readonly number[] = [1, 4];

/**
 * Default lamp whose inner stack has two ball bands (1 and 4, counted from the bottom) and
 * straight bands elsewhere: two inner meshes (ball × 2, straight × the rest). The outer
 * stack stays straight.
 */
export function formFixture(): { dims: DerivedDims; parts: PartMesh[] } {
  const p = defaultParams();
  const n = deriveDims(p).inner.count;
  p.forms.inner = Array.from({ length: n }, (_, k): FormId => (BALL_BANDS.includes(k) ? 'ball' : 'straight'));
  const dims = deriveDims(p);
  return { dims, parts: fixtureParts(dims) };
}
