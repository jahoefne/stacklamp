/**
 * Lazy singleton GeometryClient (from the barrel). Mirrors `client.ready` into
 * `engine.status` and counts calls (for the debug hook / QA: colour edits must not build).
 */
import { createGeometryClient } from '../../geometry';
import type { GeometryClient } from '../../geometry';
import { lampStore } from '../store';
import type { LampStore } from '../store';

export interface EngineStats {
  buildParts: number;
  exportZip: number;
}

/** Live call counters of the singleton client. */
export const engineStats: EngineStats = { buildParts: 0, exportZip: 0 };

let client: GeometryClient | null = null;

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  return typeof e === 'string' ? e : 'unknown error';
}

function failedClient(e: unknown): GeometryClient {
  const err = e instanceof Error ? e : new Error(errorMessage(e));
  const ready = Promise.reject(err);
  ready.catch(() => {});
  return {
    ready,
    buildParts: () => Promise.reject(err),
    exportZip: () => Promise.reject(err),
    cancel() {},
    dispose() {},
  };
}

/** Wrap a client so every call is counted in `stats`. */
export function instrumentClient(raw: GeometryClient, stats: EngineStats = engineStats): GeometryClient {
  return {
    ready: raw.ready,
    buildParts(params, quality) {
      stats.buildParts += 1;
      return raw.buildParts(params, quality);
    },
    exportZip(req, onProgress) {
      stats.exportZip += 1;
      return raw.exportZip(req, onProgress);
    },
    cancel: () => raw.cancel(),
    dispose: () => raw.dispose(),
  };
}

/** Bind a client's readiness to a store's `engine` slice. */
export function trackEngine(c: GeometryClient, store: LampStore): void {
  const { setEngine } = store.getState().actions;
  setEngine({ status: 'loading' });
  c.ready.then(
    () => setEngine({ status: 'ready' }),
    (e: unknown) => setEngine({ status: 'error', error: errorMessage(e) }),
  );
}

/** The app's GeometryClient, created (worker spawned) on first call. */
export function getGeometryClient(store: LampStore = lampStore): GeometryClient {
  if (client) return client;
  let raw: GeometryClient;
  try {
    raw = createGeometryClient();
  } catch (e) {
    raw = failedClient(e);
  }
  client = instrumentClient(raw);
  trackEngine(client, store);
  return client;
}

/** The client if it exists (never spawns one). */
export function peekGeometryClient(): GeometryClient | null {
  return client;
}

/** Dispose the singleton (tests, hot reload). */
export function disposeGeometryClient(): void {
  client?.dispose();
  client = null;
}
