/**
 * Debounced preview rebuilds: at most one build in flight + one pending (latest wins).
 * - Builds only when partsKey(params) differs from the parts on screen; otherwise it just
 *   moves `preview.params` to the new params (e.g. a printer change) without a worker call.
 * - Sets `preview.status = 'building'` as soon as a geometry change is queued.
 * - On error keeps the last good parts; SupersededError is ignored; CancelledError
 *   (client.cancel()) retries the latest params.
 * - Builds immediately (leading edge) on start.
 */
import type { GeometryClient, LampParams } from '../../geometry';
import { partsKeyFor } from '../selectors';
import type { LampStore } from '../store';
import { errorMessage } from './engine';

export interface PreviewSchedulerStats {
  /** buildParts calls made. */
  started: number;
  completed: number;
  failed: number;
  /** Requests answered without a build (same partsKey). */
  skipped: number;
}

export type StopPreviewScheduler = (() => void) & { stats: PreviewSchedulerStats };

export function createPreviewScheduler(client: GeometryClient, store: LampStore, delayMs = 220): StopPreviewScheduler {
  const stats: PreviewSchedulerStats = { started: 0, completed: 0, failed: 0, skipped: 0 };
  const actions = () => store.getState().actions;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlightKey: string | null = null;
  let pending: LampParams | null = null;
  let stopped = false;

  const shownKey = (): string | null => {
    const { parts, params } = store.getState().preview;
    return parts && params ? partsKeyFor(params) : null;
  };

  function flush(): void {
    timer = null;
    if (stopped || inFlightKey !== null || !pending) return;
    const params = pending;
    pending = null;
    const key = partsKeyFor(params);
    if (key === shownKey()) {
      stats.skipped += 1;
      const prev = store.getState().preview;
      if (prev.params !== params || prev.status !== 'idle') actions().setPreview({ params, status: 'idle', error: undefined });
      return;
    }
    inFlightKey = key;
    stats.started += 1;
    if (store.getState().preview.status !== 'building') actions().setPreview({ status: 'building' });
    const t0 = performance.now();
    client.buildParts(params, 'preview').then(
      (parts) => {
        if (stopped) return;
        stats.completed += 1;
        // The parts also fit later params with the same geometry (e.g. a printer change meanwhile).
        const latest = store.getState().config.params;
        actions().setPreview({
          parts,
          params: partsKeyFor(latest) === key ? latest : params,
          status: pending ? 'building' : 'idle',
          buildMs: performance.now() - t0,
          error: undefined,
        });
        done();
      },
      (err: unknown) => {
        if (stopped) return;
        const name = (err as { name?: unknown } | null)?.name;
        if (name === 'SupersededError') {
          if (!pending) actions().setPreview({ status: 'idle' });
        } else if (name === 'CancelledError') {
          pending ??= store.getState().config.params;
        } else {
          stats.failed += 1;
          actions().setPreview({ status: 'error', error: errorMessage(err) });
        }
        done();
      },
    );
  }

  function done(): void {
    inFlightKey = null;
    if (pending && timer === null) flush();
  }

  function request(params: LampParams, immediate = false): void {
    if (stopped) return;
    pending = params;
    const key = partsKeyFor(params);
    if (key !== shownKey() && key !== inFlightKey && store.getState().preview.status !== 'building')
      actions().setPreview({ status: 'building' });
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (immediate) flush();
    else timer = setTimeout(flush, delayMs);
  }

  const unsubscribe = store.subscribe(
    (s) => s.config.params,
    (params) => request(params),
  );
  request(store.getState().config.params, true);

  const stop = (() => {
    stopped = true;
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  }) as StopPreviewScheduler;
  stop.stats = stats;
  return stop;
}
