/**
 * Messages between the GeometryClient (main thread) and the geometry worker.
 * Mesh and ZIP buffers travel as transferables.
 */
import type { ExportRequest, ExportStage, LampParams, PartMesh, Quality } from '../geometry/types';

export type WorkerRequest =
  | { type: 'build'; id: number; params: LampParams; quality: Quality }
  | { type: 'export'; id: number; req: ExportRequest };

export type WorkerResponse =
  /** Posted once after the WASM kernel is initialised. */
  | { type: 'ready' }
  /** Posted instead of 'ready' when the kernel cannot load. */
  | { type: 'init-error'; error: string }
  | { type: 'parts'; id: number; parts: PartMesh[]; ms: number }
  | { type: 'progress'; id: number; stage: ExportStage; done: number; total: number }
  | { type: 'zip'; id: number; zip: Uint8Array; fileName: string; ms: number }
  | { type: 'error'; id: number; error: string };

/** Callback the handler posts responses through (postMessage in the worker, a function in tests). */
export type Post = (response: WorkerResponse, transfer: ArrayBuffer[]) => void;
