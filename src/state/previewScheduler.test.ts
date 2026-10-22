import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectDims } from './selectors';
import { createPreviewScheduler } from './services/previewScheduler';
import { createLampStore } from './store';
import { fakeClient, fakeParts, flushMicrotasks, namedError } from './test/fakes';

const setup = () => {
  const store = createLampStore({ persistPresets: false, engine: { status: 'ready' } });
  const fc = fakeClient();
  const stop = createPreviewScheduler(fc.client, store, 220);
  return { store, ...fc, stop, actions: store.getState().actions };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('previewScheduler', () => {
  it('builds immediately on start (leading edge) and stores the parts with their params', async () => {
    const { store, builds, stop } = setup();
    expect(builds).toHaveLength(1);
    expect(store.getState().preview.status).toBe('building');
    const parts = fakeParts(selectDims(store.getState()));
    builds[0]!.resolve(parts);
    await flushMicrotasks();
    const p = store.getState().preview;
    expect(p).toMatchObject({ status: 'idle', parts, params: store.getState().config.params });
    expect(p.buildMs).toBeTypeOf('number');
    stop();
  });

  it('debounces rapid edits into one build with the latest params', async () => {
    const { store, builds, actions, stop } = setup();
    builds[0]!.resolve([]);
    await flushMicrotasks();
    for (const L of [1000, 1010, 1020, 1030, 1040]) {
      actions.setParam('core.length', L);
      vi.advanceTimersByTime(100);
    }
    expect(store.getState().preview.status).toBe('building');
    expect(builds).toHaveLength(1);
    vi.advanceTimersByTime(220);
    expect(builds).toHaveLength(2);
    expect(builds[1]!.params.core.length).toBe(1040);
    expect(stop.stats.started).toBe(2);
    stop();
  });

  it('keeps one build in flight + one pending, latest wins', async () => {
    const { store, builds, actions, stop } = setup();
    // first build (A) still in flight
    actions.setParam('core.length', 1100);
    vi.advanceTimersByTime(300);
    actions.setParam('core.length', 1200);
    vi.advanceTimersByTime(300);
    expect(builds).toHaveLength(1);
    builds[0]!.resolve(['A' as never]);
    await flushMicrotasks();
    expect(builds).toHaveLength(2);
    expect(builds[1]!.params.core.length).toBe(1200);
    expect(store.getState().preview.parts).toEqual(['A']);
    expect(store.getState().preview.status).toBe('building');
    builds[1]!.resolve(['C' as never]);
    await flushMicrotasks();
    expect(store.getState().preview).toMatchObject({ status: 'idle', parts: ['C'] });
    expect(store.getState().preview.params?.core.length).toBe(1200);
    stop();
  });

  it('skips the build when partsKey is unchanged, but adopts the new params', async () => {
    const { store, builds, actions, stop } = setup();
    builds[0]!.resolve([]);
    await flushMicrotasks();
    actions.applyPrinterPreset('custom'); // preset only: same geometry
    vi.advanceTimersByTime(500);
    expect(builds).toHaveLength(1);
    expect(store.getState().preview.params).toBe(store.getState().config.params);
    actions.paintBand('outer', 0, 'grn'); // colour edits never touch params
    actions.setUi({ viewMode: 'exploded' });
    vi.advanceTimersByTime(500);
    expect(builds).toHaveLength(1);
    // a change and its undo inside the debounce window → no build
    actions.setParam('core.length', 1000);
    actions.setParam('core.length', 1500);
    vi.advanceTimersByTime(500);
    expect(builds).toHaveLength(1);
    expect(store.getState().preview.status).toBe('idle');
    expect(stop.stats.skipped).toBeGreaterThanOrEqual(2);
    stop();
  });

  it('does not queue a duplicate of the build in flight', async () => {
    const { builds, actions, stop } = setup();
    actions.applyPrinterPreset('custom');
    vi.advanceTimersByTime(500);
    builds[0]!.resolve([]);
    await flushMicrotasks();
    expect(builds).toHaveLength(1);
    stop();
  });

  it('keeps the last good parts on error', async () => {
    const { store, builds, actions, stop } = setup();
    builds[0]!.resolve(['good' as never]);
    await flushMicrotasks();
    const goodParams = store.getState().preview.params;
    actions.setParam('core.length', 1000);
    vi.advanceTimersByTime(220);
    builds[1]!.reject(new Error('boom'));
    await flushMicrotasks();
    expect(store.getState().preview).toMatchObject({ status: 'error', error: 'boom', parts: ['good'] });
    expect(store.getState().preview.params).toBe(goodParams);
    // the next edit retries and clears the error
    actions.setParam('core.length', 1010);
    vi.advanceTimersByTime(220);
    builds[2]!.resolve(['new' as never]);
    await flushMicrotasks();
    expect(store.getState().preview).toMatchObject({ status: 'idle', parts: ['new'] });
    expect(store.getState().preview.error).toBeUndefined();
    stop();
  });

  it('ignores SupersededError', async () => {
    const { store, builds, stop } = setup();
    builds[0]!.reject(namedError('SupersededError'));
    await flushMicrotasks();
    expect(store.getState().preview.status).toBe('idle');
    expect(store.getState().preview.error).toBeUndefined();
    expect(stop.stats.failed).toBe(0);
    stop();
  });

  it('retries the latest params after CancelledError', async () => {
    const { builds, stop } = setup();
    builds[0]!.reject(namedError('CancelledError'));
    await flushMicrotasks();
    expect(builds).toHaveLength(2);
    stop();
  });

  it('stops listening after stop()', async () => {
    const { store, builds, actions, stop } = setup();
    stop();
    actions.setParam('core.length', 1000);
    vi.advanceTimersByTime(1000);
    expect(builds).toHaveLength(1);
    builds[0]!.resolve(['late' as never]);
    await flushMicrotasks();
    expect(store.getState().preview.parts).toBeNull();
  });
});
