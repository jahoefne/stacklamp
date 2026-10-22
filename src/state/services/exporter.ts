/**
 * ZIP download: builds the ExportRequest from the store, streams progress into
 * `exportJob`, saves the Blob, revokes its URL after 10 s.
 */
import type { ExportRequest, GeometryClient } from '../../geometry';
import { selectBlockers, selectColourPlan, selectShareUrl } from '../selectors';
import type { LampStore } from '../store';
import { errorMessage } from './engine';

export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

/** The request the current state would export. */
export function buildExportRequest(store: LampStore, now: Date = new Date()): ExportRequest {
  const s = store.getState();
  return {
    params: s.config.params,
    colourPlan: selectColourPlan(s),
    format: s.ui.exportFormat,
    includeFitTest: s.ui.includeFitTest,
    meta: { shareUrl: selectShareUrl(s), appVersion: appVersion(), createdAt: now.toISOString() },
  };
}

/** Trigger a browser download of `blob`. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface DownloadOptions {
  save?: (blob: Blob, fileName: string) => void;
  now?: () => Date;
}

/**
 * Export and download the ZIP. Resolves true on success. Refuses (with a notice) while
 * blocked or while another export runs; a cancelled export returns to 'idle' silently.
 */
export async function downloadZip(store: LampStore, client: GeometryClient, opts: DownloadOptions = {}): Promise<boolean> {
  const s = store.getState();
  const { setExportJob, notify } = s.actions;
  if (s.exportJob.phase === 'running') return false;
  const blockers = selectBlockers(s);
  if (blockers.length > 0) {
    notify('error', blockers[0]!);
    return false;
  }
  const req = buildExportRequest(store, opts.now?.() ?? new Date());
  setExportJob({ phase: 'running', stage: 'base', done: 0, total: 1 });
  try {
    const { zip, fileName } = await client.exportZip(req, (stage, done, total) =>
      setExportJob({ phase: 'running', stage, done, total }),
    );
    const blob = new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
    (opts.save ?? saveBlob)(blob, fileName);
    setExportJob({ phase: 'done', fileName });
    return true;
  } catch (err) {
    if ((err as { name?: unknown } | null)?.name === 'CancelledError') {
      setExportJob({ phase: 'idle' });
      return false;
    }
    const message = errorMessage(err);
    setExportJob({ phase: 'error', message });
    notify('error', `Export failed: ${message}`);
    return false;
  }
}
