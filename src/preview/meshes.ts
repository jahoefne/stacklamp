/**
 * PartMesh (worker output, print frame, mm) → three.js BufferGeometry.
 * One shared geometry per mesh key; LampScene creates one Mesh per copy on top.
 *
 * A segment stack arrives as one PartMesh per body form in use (same `id`, different
 * `form`), so geometries are keyed by `meshKey`: the part id, plus `|form` for a segment.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FormId, PartId, PartMesh } from '../geometry';

export const CREASE_ANGLE = (30 * Math.PI) / 180;

/** `base`, `top-cover`, … for a part without a form; `inner-segment|ball` for a segment. */
export type MeshKey = PartId | `${PartId}|${FormId}`;

/** Key of the geometry a PartMesh becomes (and of the band that wants that form). */
export function meshKey(id: PartId, form?: FormId): MeshKey {
  return form ? `${id}|${form}` : id;
}

/** The part id a mesh key belongs to. */
export function keyPart(key: MeshKey): PartId {
  return key.split('|', 1)[0] as PartId;
}

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
  g.name = meshKey(m.id, m.form);
  g.userData = { partId: m.id, form: m.form, triangleCount: m.triangleCount, sourceVertexCount: vertexCount };
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * The geometry a copy of `id` shows when its band has `form`: the mesh of that form, else
 * the stack's straight (or formless) mesh, else any mesh of the part. The fallbacks cover a
 * parts set that is one build behind the dims (a form was just painted and its mesh is
 * still being built); undefined only when the part has no geometry at all.
 */
export function geometryFor(
  geometries: ReadonlyMap<MeshKey, BufferGeometry>,
  id: PartId,
  form?: FormId,
): BufferGeometry | undefined {
  const exact = geometries.get(meshKey(id, form));
  if (exact) return exact;
  const plain = geometries.get(meshKey(id, 'straight')) ?? geometries.get(id);
  if (plain) return plain;
  for (const [key, g] of geometries) if (keyPart(key) === id) return g;
  return undefined;
}

/**
 * Keeps the current geometry per mesh key. `swap()` builds the new set first and
 * disposes the previous geometries afterwards, so the old meshes stay valid until
 * the caller has re-pointed them.
 */
export class GeometrySet {
  private current = new Map<MeshKey, BufferGeometry>();
  private sources = new Map<MeshKey, PartMesh>();

  get(key: MeshKey): BufferGeometry | undefined {
    return this.current.get(key);
  }

  /** Mesh keys of the current set (several per segment stack when it has forms). */
  ids(): MeshKey[] {
    return [...this.current.keys()];
  }

  /** Number of geometries per part id (a segment stack has one per form in use). */
  countsByPart(): Partial<Record<PartId, number>> {
    const out: Partial<Record<PartId, number>> = {};
    for (const key of this.current.keys()) {
      const id = keyPart(key);
      out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  }

  /**
   * Returns the new map and a function that disposes every geometry it replaced. A key
   * that appears twice in `parts` keeps its first mesh (the second is never built).
   */
  swap(parts: readonly PartMesh[]): { geometries: Map<MeshKey, BufferGeometry>; disposeOld: () => void } {
    const next = new Map<MeshKey, BufferGeometry>();
    const nextSources = new Map<MeshKey, PartMesh>();
    const reused = new Set<BufferGeometry>();
    for (const m of parts) {
      if (m.id === 'fit-test') continue;
      const key = meshKey(m.id, m.form);
      if (next.has(key)) continue;
      const prev = this.current.get(key);
      // Same PartMesh object (e.g. a cached build) → keep its geometry.
      if (prev && this.sources.get(key) === m) {
        next.set(key, prev);
        reused.add(prev);
      } else {
        next.set(key, partMeshToGeometry(m));
      }
      nextSources.set(key, m);
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
