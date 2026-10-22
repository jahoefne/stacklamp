/**
 * Main-thread GeometryClient for the geometry worker (adapted from
 * switchcover's coalescing client).
 *
 *  - One request in flight at a time.
 *  - Preview builds coalesce newest-wins: a queued preview that has not
 *    started yet is replaced by a newer one; the replaced promise rejects with
 *    an Error whose name is 'SupersededError' (the UI ignores it).
 *  - Export-quality builds and ZIP exports are never superseded; they run
 *    FIFO, before any queued preview.
 *  - cancel() terminates the worker (aborting the running build), respawns it
 *    and rejects everything pending with a 'CancelledError'.
 *
 * Compiles without DOM types (the barrel is type-checked against plain ES):
 * the few browser globals it touches are declared locally.
 */
import type { ExportRequest, ExportResult, ExportStage, GeometryClient, LampParams, PartMesh, Quality } from '../geometry/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** The subset of Worker the client needs (injectable for tests). */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

interface UrlLike {
  readonly href: string;
}
declare const URL: new (url: string, base: string) => UrlLike;
declare const Worker: new (url: UrlLike, options: { type: 'module'; name?: string }) => WorkerLike;
declare global {
  interface ImportMeta {
    url: string;
  }
}

export const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module', name: 'stacklamp-geometry' });

export class SupersededError extends Error {
  override name = 'SupersededError';
  constructor() {
    super('Build superseded by a newer request');
  }
}

export class CancelledError extends Error {
  override name = 'CancelledError';
  constructor() {
    super('Geometry request cancelled');
  }
}

/** True for errors the UI should silently ignore (superseded or cancelled requests). */
export function isBenignGeometryError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'SupersededError' || err.name === 'CancelledError');
}

/** A worker that crashes this often before it ever reported 'ready' is given up on. */
const MAX_CRASHES_BEFORE_READY = 2;

interface Job {
  request: WorkerRequest;
  preview: boolean;
  resolve(value: unknown): void;
  reject(err: Error): void;
  onProgress?: ((stage: ExportStage, done: number, total: number) => void) | undefined;
}

export class WorkerGeometryClient implements GeometryClient {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (err: Error) => void;
  private isReady = false;
  private worker: WorkerLike;
  private nextId = 1;
  private inFlight: Job | null = null;
  private queuedPreview: Job | null = null;
  private queue: Job[] = [];
  private disposed = false;
  private crashesBeforeReady = 0;
  private broken: Error | null = null;

  private readonly factory: WorkerFactory;

  constructor(factory: WorkerFactory = defaultWorkerFactory) {
    this.factory = factory;
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // nobody may await `ready`; do not report its failure as unhandled
    this.ready.catch(() => undefined);
    this.worker = this.spawn();
  }

  buildParts(params: LampParams, quality: Quality): Promise<PartMesh[]> {
    return this.enqueue<PartMesh[]>({ type: 'build', id: this.nextId++, params, quality }, quality === 'preview');
  }

  exportZip(req: ExportRequest, onProgress?: (stage: ExportStage, done: number, total: number) => void): Promise<ExportResult> {
    return this.enqueue<ExportResult>({ type: 'export', id: this.nextId++, req }, false, onProgress);
  }

  cancel(): void {
    this.abort(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort(false);
  }

  /** True while a request runs in the worker. */
  get busy(): boolean {
    return this.inFlight !== null;
  }

  private enqueue<T>(
    request: WorkerRequest,
    preview: boolean,
    onProgress?: (stage: ExportStage, done: number, total: number) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.disposed || this.broken) {
        reject(this.broken ?? new CancelledError());
        return;
      }
      const job: Job = { request, preview, resolve: resolve as (v: unknown) => void, reject, onProgress };
      if (preview) {
        this.queuedPreview?.reject(new SupersededError());
        this.queuedPreview = job;
      } else {
        this.queue.push(job);
      }
      this.pump();
    });
  }

  private abort(respawn: boolean): void {
    if (this.broken) respawn = false;
    const pending = [this.inFlight, ...this.queue, this.queuedPreview].filter((j): j is Job => j !== null);
    this.inFlight = null;
    this.queuedPreview = null;
    this.queue = [];
    this.detach(this.worker);
    this.worker.terminate();
    if (respawn) this.worker = this.spawn();
    else if (!this.isReady) this.rejectReady(new CancelledError());
    for (const job of pending) job.reject(new CancelledError());
  }

  private detach(w: WorkerLike): void {
    w.onmessage = null;
    w.onerror = null;
  }

  private spawn(): WorkerLike {
    const w = this.factory();
    w.onmessage = (e) => this.onMessage(e.data);
    w.onerror = (e) => this.onWorkerError(e);
    return w;
  }

  private pump(): void {
    if (this.inFlight || this.disposed || this.broken) return;
    const job = this.queue.shift() ?? this.queuedPreview;
    if (!job) return;
    if (job === this.queuedPreview) this.queuedPreview = null;
    this.inFlight = job;
    this.worker.postMessage(job.request);
  }

  private onMessage(res: WorkerResponse): void {
    if (res.type === 'ready') {
      if (!this.isReady) {
        this.isReady = true;
        this.resolveReady();
      }
      return;
    }
    if (res.type === 'init-error') {
      if (!this.isReady) this.rejectReady(new Error(`The geometry engine failed to load: ${res.error}`));
      return;
    }
    const job = this.inFlight;
    if (!job || job.request.id !== res.id) return; // stale (from before a cancel)
    if (res.type === 'progress') {
      job.onProgress?.(res.stage, res.done, res.total);
      return;
    }
    this.inFlight = null;
    if (res.type === 'error') job.reject(new Error(res.error));
    else if (res.type === 'parts') job.resolve(res.parts);
    else job.resolve({ zip: res.zip, fileName: res.fileName } satisfies ExportResult);
    this.pump();
  }

  private onWorkerError(e: { message?: string }): void {
    const job = this.inFlight;
    this.inFlight = null;
    this.detach(this.worker);
    this.worker.terminate();
    const message = e.message || 'unknown error';
    if (!this.isReady && ++this.crashesBeforeReady >= MAX_CRASHES_BEFORE_READY) {
      // the worker cannot even start (e.g. the script failed to load): stop respawning
      const err = new Error(`The geometry engine failed to load: ${message}`);
      this.broken = err;
      this.rejectReady(err);
      const pending = [job, ...this.queue, this.queuedPreview].filter((j): j is Job => j !== null);
      this.queue = [];
      this.queuedPreview = null;
      for (const j of pending) j.reject(err);
      return;
    }
    this.worker = this.spawn();
    job?.reject(new Error(`The geometry worker crashed: ${message}`));
    this.pump();
  }
}

/** Spawn the geometry worker and return its client. */
export function createGeometryClient(factory?: WorkerFactory): GeometryClient {
  return new WorkerGeometryClient(factory);
}
