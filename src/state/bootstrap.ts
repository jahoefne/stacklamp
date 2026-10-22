/**
 * App wiring. Call `bootstrapLamp()` once BEFORE the first React render (main.tsx) so the
 * hash/storage state is in the store on first paint. Idempotent; returns a teardown.
 */
import type { GeometryClient } from '../geometry';
import { fixUiColourRefs } from './config';
import { installDebugHook } from './debug';
import { loadInitial, startPersistence } from './persistence';
import type { InitialSource } from './persistence';
import { loadSavedPresets } from './presets';
import { getGeometryClient } from './services/engine';
import { downloadZip } from './services/exporter';
import type { DownloadOptions } from './services/exporter';
import { createPreviewScheduler } from './services/previewScheduler';
import { lampStore } from './store';
import type { LampStore } from './store';

export interface BootstrapOptions {
  store?: LampStore;
  /** Start the preview scheduler (default true). */
  preview?: boolean;
  /** Debounce of preview rebuilds in ms (default 220). */
  previewDelayMs?: number;
}

export interface BootstrapResult {
  source: InitialSource;
  issues: string[];
  client: GeometryClient;
  teardown: () => void;
}

let booted: BootstrapResult | null = null;

export function bootstrapLamp(opts: BootstrapOptions = {}): BootstrapResult {
  if (booted) return booted;
  const store = opts.store ?? lampStore;
  const init = loadInitial();
  const { actions } = store.getState();
  actions.loadConfig(init.config, init.source);
  store.setState({ ui: fixUiColourRefs(init.ui, init.config.palette), saved: loadSavedPresets() });
  if (init.issues.length > 0)
    actions.notify('info', [init.source === 'link' ? 'Loaded the lamp from the link.' : 'Restored your last lamp.', ...init.issues].join(' '));
  const stopPersistence = startPersistence(store);
  const client = getGeometryClient(store);
  const stopPreview = opts.preview === false ? () => {} : createPreviewScheduler(client, store, opts.previewDelayMs);
  const removeHook = installDebugHook(store);
  const result: BootstrapResult = {
    source: init.source,
    issues: init.issues,
    client,
    teardown: () => {
      stopPreview();
      stopPersistence();
      removeHook();
      booted = null;
    },
  };
  booted = result;
  return result;
}

/** Export + download the ZIP for the singleton store (the DownloadPanel's button). */
export function download(opts?: DownloadOptions): Promise<boolean> {
  return downloadZip(lampStore, getGeometryClient(lampStore), opts);
}

/** Abort a running export (also restarts the worker; the preview rebuilds itself). */
export function cancelDownload(): void {
  if (lampStore.getState().exportJob.phase !== 'running') return;
  getGeometryClient(lampStore).cancel();
  lampStore.getState().actions.setExportJob({ phase: 'idle' });
}
