/**
 * Test fixtures for the preview: hand-built PartMeshes (engine-agnostic, no worker)
 * plus real derived dims from the geometry barrel.
 */
import { defaultParams, deriveDims, type DerivedDims, type PartId, type PartMesh } from '../geometry';

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

/** One mesh per assembly part, sized from the dims. */
export function fixtureParts(d: DerivedDims = defaultDims()): PartMesh[] {
  return [
    tubeMesh('base', 120, 15, d.base.height),
    { ...tubeMesh('inner-segment', d.inner.D / 2, d.inner.D / 2 - 0.8, d.inner.height), copies: d.inner.count },
    { ...tubeMesh('outer-segment', d.outer.D / 2, d.outer.D / 2 - 0.8, d.outer.height), copies: d.outer.count },
    tubeMesh('top-cover', d.cover.od / 2, 12, 3),
  ];
}
