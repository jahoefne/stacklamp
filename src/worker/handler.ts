/**
 * Worker-side request handling, free of worker globals so it runs in Node
 * tests: builds PartMeshes (LRU cache keyed by part, quality and the part's
 * spec), and export ZIPs (refused while deriveDims reports errors).
 */
import { ASSEMBLY_PART_IDS, type ExportRequest, type ExportResult, type ExportStage, type LampParams, type PartId, type PartMesh, type Quality } from '../geometry/types';
import { buildPartMesh, copiesOf } from '../geometry/build';
import { derive } from '../geometry/derive';
import type { Kernel } from '../geometry/kernel';
import { partCacheKey } from '../geometry/keys';
import { clonePartMesh } from '../geometry/mesh';
import { buildBundle, exportPartIds } from '../export/bundle';
import type { Post, WorkerRequest } from './protocol';

export const DEFAULT_CACHE_SIZE = 8;

const clock = (): number => {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
};

export interface HandlerStats {
  hits: number;
  misses: number;
  /** Milliseconds of the last build per part id + quality. */
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
   * Build the given parts (default: the four assembly parts). Every returned
   * mesh has fresh buffers (safe to transfer). Throws when the parameters
   * cannot be laid out or a part fails to build.
   */
  buildParts(params: LampParams, quality: Quality, ids: readonly PartId[] = ASSEMBLY_PART_IDS, onPart?: (id: PartId, index: number) => void): PartMesh[] {
    const { dims, layout } = derive(params);
    if (!layout) throw new Error(dims.messages[0]?.text ?? 'The parameters are invalid.');
    const counts = { inner: dims.inner.count, outer: dims.outer.count };
    return ids.map((id, index) => {
      onPart?.(id, index);
      const key = partCacheKey(id, quality, layout.specs);
      const copies = copiesOf(id, counts);
      const hit = this.cache.get(key);
      if (hit) {
        this.stats.hits++;
        this.cache.delete(key);
        this.cache.set(key, hit);
        return clonePartMesh(hit, copies);
      }
      this.stats.misses++;
      const t0 = clock();
      const mesh = buildPartMesh(this.kernel, id, layout.specs, quality, copies);
      this.stats.lastMs[`${id}|${quality}`] = clock() - t0;
      this.cache.set(key, mesh);
      while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
      return clonePartMesh(mesh, copies);
    });
  }

  /** Build the export-quality parts and the ZIP. Throws when deriveDims reports errors. */
  exportZip(req: ExportRequest, onProgress?: (stage: ExportStage, done: number, total: number) => void): ExportResult {
    const { dims } = derive(req.params);
    if (!dims.ok) {
      const errors = dims.messages.filter((m) => m.severity === 'error').map((m) => m.text);
      throw new Error(`Fix these problems before exporting: ${errors.join(' ')}`);
    }
    const ids = exportPartIds(req.includeFitTest);
    const total = ids.length + 2;
    const parts = this.buildParts(req.params, 'export', ids, (id, i) => onProgress?.(id, i, total));
    const result = buildBundle(req, dims, parts, onProgress, ids.length, total);
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
