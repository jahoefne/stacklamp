/**
 * PartMesh (worker output, print frame, mm) → three.js BufferGeometry.
 * One shared geometry per part id; LampScene creates one Mesh per copy on top.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PartId, PartMesh } from '../geometry';

export const CREASE_ANGLE = (30 * Math.PI) / 180;

/**
 * Builds a geometry with position + Uint32 index. Uses the worker's normals when it
 * sent them; otherwise derives creased normals (smooth across the 2.8° facets of a
 * revolve, sharp at real edges). toCreasedNormals de-indexes, so that geometry has no index.
 */
export function partMeshToGeometry(m: PartMesh): BufferGeometry {
  let g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  if (m.indices.length > 0) g.setIndex(new BufferAttribute(m.indices, 1));
  const vertexCount = m.positions.length / 3;
  if (m.normals && m.normals.length === m.positions.length) {
    g.setAttribute('normal', new BufferAttribute(m.normals, 3));
  } else {
    const creased = toCreasedNormals(g, CREASE_ANGLE);
    if (creased !== g) g.dispose();
    g = creased;
  }
  g.name = m.id;
  g.userData = { partId: m.id, triangleCount: m.triangleCount, sourceVertexCount: vertexCount };
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Keeps the current geometry per part id. `swap()` builds the new set first and
 * disposes the previous geometries afterwards, so the old meshes stay valid until
 * the caller has re-pointed them.
 */
export class GeometrySet {
  private current = new Map<PartId, BufferGeometry>();
  private sources = new Map<PartId, PartMesh>();

  get(id: PartId): BufferGeometry | undefined {
    return this.current.get(id);
  }

  ids(): PartId[] {
    return [...this.current.keys()];
  }

  /** Returns the new map and a function that disposes the geometries it replaced. */
  swap(parts: readonly PartMesh[]): { geometries: Map<PartId, BufferGeometry>; disposeOld: () => void } {
    const next = new Map<PartId, BufferGeometry>();
    const nextSources = new Map<PartId, PartMesh>();
    const reused = new Set<BufferGeometry>();
    for (const m of parts) {
      if (m.id === 'fit-test') continue;
      const prev = this.current.get(m.id);
      // Same PartMesh object (e.g. a cached build) → keep its geometry.
      if (prev && this.sources.get(m.id) === m) {
        next.set(m.id, prev);
        reused.add(prev);
      } else {
        next.set(m.id, partMeshToGeometry(m));
      }
      nextSources.set(m.id, m);
    }
    const old = [...this.current.values()].filter((g) => !reused.has(g));
    this.current = next;
    this.sources = nextSources;
    return { geometries: next, disposeOld: () => old.forEach((g) => g.dispose()) };
  }

  dispose(): void {
    this.current.forEach((g) => g.dispose());
    this.current.clear();
    this.sources.clear();
  }
}
