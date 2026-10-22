/**
 * Manifold → PartMesh: copy the buffers out of the WASM heap (fresh,
 * transferable typed arrays), merge the vertices Manifold split for differing
 * properties (export: positions only, shared edges, closed mesh), keep the
 * split vertices with their normals for the preview, and measure volume,
 * bounding box and mass.
 */
import { PETG_DENSITY_G_CM3 } from './bom';
import type { Manifold, Scope } from './kernel';
import type { PartId, PartMesh, Quality } from './types';

/** Edges sharper than this keep separate normals on each side in preview meshes, degrees. */
export const PREVIEW_SHARP_ANGLE = 35;
/** Shell thickness assumed for solid parts (4 walls / 5 top-bottom layers), mm. */
export const SHELL_THICKNESS = 1.6;
/** Infill of solid parts. */
export const INFILL = 0.2;

/** What toPartMesh reads of a manifold-3d Mesh. */
export interface MeshLike {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  mergeFromVert?: Uint32Array | undefined;
  mergeToVert?: Uint32Array | undefined;
}

/**
 * Indexed positions with the split vertices merged again (union-find over the
 * merge pairs, each group keeps its smallest index); merged-away vertices are
 * dropped. Fresh buffers.
 */
export function mergedPositions(mesh: MeshLike): { positions: Float32Array; indices: Uint32Array } {
  const { numProp, vertProperties, triVerts } = mesh;
  const numVert = vertProperties.length / numProp;
  const from = mesh.mergeFromVert ?? new Uint32Array(0);
  const to = mesh.mergeToVert ?? new Uint32Array(0);
  const target = new Uint32Array(numVert);
  for (let v = 0; v < numVert; v++) target[v] = v;
  const root = (v: number): number => {
    let r = v;
    while (target[r] !== r) r = target[r]!;
    for (let x = v; target[x] !== r; ) {
      const next = target[x]!;
      target[x] = r;
      x = next;
    }
    return r;
  };
  for (let i = 0; i < Math.min(from.length, to.length); i++) {
    const ra = root(from[i]!);
    const rb = root(to[i]!);
    if (ra < rb) target[rb] = ra;
    else if (rb < ra) target[ra] = rb;
  }
  const newIndex = new Int32Array(numVert).fill(-1);
  let kept = 0;
  for (let v = 0; v < numVert; v++) {
    target[v] = root(v);
    if (target[v] === v) newIndex[v] = kept++;
  }
  const positions = new Float32Array(kept * 3);
  for (let v = 0; v < numVert; v++) {
    const n = newIndex[v]!;
    if (n < 0) continue;
    positions[n * 3] = vertProperties[v * numProp]!;
    positions[n * 3 + 1] = vertProperties[v * numProp + 1]!;
    positions[n * 3 + 2] = vertProperties[v * numProp + 2]!;
  }
  const indices = new Uint32Array(triVerts.length);
  for (let i = 0; i < triVerts.length; i++) indices[i] = newIndex[target[triVerts[i]!]!]!;
  return { positions, indices };
}

/** Positions and normals (properties 3..5) of every vertex, unmerged. Fresh buffers. */
export function positionsAndNormals(mesh: MeshLike): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const { numProp, vertProperties, triVerts } = mesh;
  if (numProp < 6) throw new Error(`Expected normals in the mesh (numProp ${numProp})`);
  const numVert = vertProperties.length / numProp;
  const positions = new Float32Array(numVert * 3);
  const normals = new Float32Array(numVert * 3);
  for (let v = 0; v < numVert; v++) {
    for (let j = 0; j < 3; j++) {
      positions[v * 3 + j] = vertProperties[v * numProp + j]!;
      normals[v * 3 + j] = vertProperties[v * numProp + 3 + j]!;
    }
  }
  return { positions, normals, indices: new Uint32Array(triVerts) };
}

export type MassModel = 'vase' | 'solid';

/** Solid mass and a realistic estimate (vase parts print solid walls; solid parts get a shell + infill). */
export function massOf(volume: number, surfaceArea: number, model: MassModel): { solid: number; estimate: number } {
  const solid = (volume * PETG_DENSITY_G_CM3) / 1000;
  if (model === 'vase') return { solid, estimate: solid };
  const shell = Math.min(volume, surfaceArea * SHELL_THICKNESS);
  const printed = shell + INFILL * (volume - shell);
  return { solid, estimate: (printed * PETG_DENSITY_G_CM3) / 1000 };
}

export interface ToPartMeshOptions {
  id: PartId;
  quality: Quality;
  copies: number;
  normals: boolean;
  mass: MassModel;
}

export function toPartMesh(s: Scope, m: Manifold, o: ToPartMeshOptions): PartMesh {
  const volume = m.volume();
  const area = m.surfaceArea();
  const box = m.boundingBox();
  const base = {
    id: o.id,
    quality: o.quality,
    triangleCount: m.numTri(),
    volume,
    bbox: {
      min: [box.min[0], box.min[1], box.min[2]] as [number, number, number],
      max: [box.max[0], box.max[1], box.max[2]] as [number, number, number],
    },
    copies: o.copies,
    massGrams: massOf(volume, area, o.mass),
  };
  if (o.normals) {
    const withNormals = s.add(m.calculateNormals(0, PREVIEW_SHARP_ANGLE));
    const { positions, normals, indices } = positionsAndNormals(withNormals.getMesh());
    return { ...base, positions, indices, normals };
  }
  const { positions, indices } = mergedPositions(m.getMesh());
  return { ...base, positions, indices };
}

/** Deep copy (fresh buffers) of a PartMesh, e.g. before transferring a cached one. */
export function clonePartMesh(m: PartMesh, copies = m.copies): PartMesh {
  const out: PartMesh = {
    ...m,
    positions: m.positions.slice(),
    indices: m.indices.slice(),
    bbox: { min: [...m.bbox.min], max: [...m.bbox.max] },
    massGrams: { ...m.massGrams },
    copies,
  };
  if (m.normals) out.normals = m.normals.slice();
  else delete out.normals;
  return out;
}
