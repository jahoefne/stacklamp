/**
 * Worker-side request handling, free of worker globals so it runs in Node
 * tests: builds PartMeshes (LRU cache keyed by part, form, quality and the
 * part's spec), and export ZIPs (refused while deriveDims reports errors).
 *
 * A segment stack yields one mesh per form in use (its variants, in order of
 * first appearance from the bottom), so a part id can stand for several
 * meshes; every other part is one mesh.
 */
import {
  ASSEMBLY_PART_IDS,
  type ExportRequest,
  type ExportResult,
  type ExportStage,
  type FormId,
  type LampParams,
  type PartId,
  type PartMesh,
  type Quality,
} from '../geometry/types';
import { buildPartMesh, copiesOf } from '../geometry/build';
import { derive } from '../geometry/derive';
import { DEFAULT_FORM } from '../geometry/forms';
import type { Kernel } from '../geometry/kernel';
import { partCacheKey } from '../geometry/keys';
import type { PartSpecs } from '../geometry/layout';
import { clonePartMesh } from '../geometry/mesh';
import { buildBundle, exportPartIds } from '../export/bundle';
import type { Post, WorkerRequest } from './protocol';

/** Enough for every part at one quality plus a few forms per stack. */
export const DEFAULT_CACHE_SIZE = 16;

/** One mesh to build: a part, the segment form it has (none for other parts) and its copies. */
export interface MeshJob {
  id: PartId;
  form?: FormId;
  copies: number;
}

/**
 * The meshes the given parts stand for, in build (and ZIP) order: each segment stack
 * one per variant with the copies its bands need, every other part one.
 */
export function meshJobs(specs: PartSpecs, counts: { inner: number; outer: number }, ids: readonly PartId[]): MeshJob[] {
  return ids.flatMap((id): MeshJob[] => {
    if (id === 'inner-segment' || id === 'outer-segment') {
      const variants = specs.variants[id === 'inner-segment' ? 'inner' : 'outer'];
      return variants.map((v) => ({ id, form: v.form, copies: v.bands.length }));
    }
    return [{ id, copies: copiesOf(id, counts) }];
  });
}

const clock = (): number => {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
};

export interface HandlerStats {
  hits: number;
  misses: number;
  /** Milliseconds of the last build per `id|quality` (a segment form other than straight: `id#form|quality`). */
  lastMs: Record<string, number>;
}

/** Buffers of a PartMesh, for postMessage's transfer list. */
export function meshTransfers(parts: readonly PartMesh[]): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const m of parts) {
    out.push(m.positions.buffer as ArrayBuffer, m.indices.buffer as ArrayBuffer);
    if (m.normals) out.push(m.normals.buffer as ArrayBuffer);
  }
  return out;
}

export class GeometryHandler {
  readonly stats: HandlerStats = { hits: 0, misses: 0, lastMs: {} };
  private readonly cache = new Map<string, PartMesh>();

  private readonly kernel: Kernel;
  private readonly cacheSize: number;

  constructor(kernel: Kernel, cacheSize = DEFAULT_CACHE_SIZE) {
    this.kernel = kernel;
    this.cacheSize = cacheSize;
  }

  clearCache(): void {
    this.cache.clear();
  }

  get cacheKeys(): string[] {
    return [...this.cache.keys()];
  }

  /**
   * Build the given parts (default: the assembly parts): one mesh per part, except a
   * segment stack, which yields one per form in use (all with the stack's id, each with
   * its form and the copies its bands need). Every returned mesh has fresh buffers (safe
   * to transfer). `onPart` is called before each mesh with the number of meshes already
   * built. Throws when the parameters cannot be laid out or a part fails to build.
   */
  buildParts(params: LampParams, quality: Quality, ids: readonly PartId[] = ASSEMBLY_PART_IDS, onPart?: (id: PartId, index: number) => void): PartMesh[] {
    const { dims, layout } = derive(params);
    if (!layout) throw new Error(dims.messages[0]?.text ?? 'The parameters are invalid.');
    const counts = { inner: dims.inner.count, outer: dims.outer.count };
    return meshJobs(layout.specs, counts, ids).map((job, index) => {
      onPart?.(job.id, index);
      return this.buildMesh(layout.specs, quality, job);
    });
  }

  /** One mesh from the cache, or built and cached. */
  private buildMesh(specs: PartSpecs, quality: Quality, { id, form, copies }: MeshJob): PartMesh {
    const key = partCacheKey(id, quality, specs, form);
    const hit = this.cache.get(key);
    if (hit) {
      this.stats.hits++;
      this.cache.delete(key);
      this.cache.set(key, hit);
      return clonePartMesh(hit, copies);
    }
    this.stats.misses++;
    const t0 = clock();
    const mesh = buildPartMesh(this.kernel, id, specs, quality, copies, form);
    // straight segments keep the plain `id|quality` key
    this.stats.lastMs[form && form !== DEFAULT_FORM ? `${id}#${form}|${quality}` : `${id}|${quality}`] = clock() - t0;
    this.cache.set(key, mesh);
    while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
    return clonePartMesh(mesh, copies);
  }

  /**
   * Build the export-quality parts and the ZIP. Throws when deriveDims reports errors.
   * Progress: one step per mesh (the stage is its part id, so a stack with several forms
   * reports its id several times), then `docs` and `zip`; `total` = meshes + 2 and `done`
   * never decreases.
   */
  exportZip(req: ExportRequest, onProgress?: (stage: ExportStage, done: number, total: number) => void): ExportResult {
    const { dims, layout } = derive(req.params);
    if (!dims.ok || !layout) {
      const errors = dims.messages.filter((m) => m.severity === 'error').map((m) => m.text);
      throw new Error(`Fix these problems before exporting: ${errors.join(' ')}`);
    }
    const ids = exportPartIds(req.includeFitTest);
    const meshes = meshJobs(layout.specs, { inner: dims.inner.count, outer: dims.outer.count }, ids).length;
    const total = meshes + 2;
    const parts = this.buildParts(req.params, 'export', ids, (id, i) => onProgress?.(id, i, total));
    const result = buildBundle(req, dims, parts, onProgress, parts.length, total);
    onProgress?.('zip', total, total);
    return result;
  }

  /** Handle one request, posting progress and the result (or an error) through `post`. */
  handle(msg: WorkerRequest, post: Post): void {
    const t0 = clock();
    try {
      if (msg.type === 'build') {
        const parts = this.buildParts(msg.params, msg.quality);
        post({ type: 'parts', id: msg.id, parts, ms: clock() - t0 }, meshTransfers(parts));
      } else {
        const { zip, fileName } = this.exportZip(msg.req, (stage, done, total) =>
          post({ type: 'progress', id: msg.id, stage, done, total }, []),
        );
        post({ type: 'zip', id: msg.id, zip, fileName, ms: clock() - t0 }, [zip.buffer as ArrayBuffer]);
      }
    } catch (err) {
      post({ type: 'error', id: msg.id, error: err instanceof Error ? err.message : String(err) }, []);
    }
  }
}

export function createHandler(kernel: Kernel, cacheSize = DEFAULT_CACHE_SIZE): GeometryHandler {
  return new GeometryHandler(kernel, cacheSize);
}
