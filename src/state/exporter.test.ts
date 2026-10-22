import { describe, expect, it, vi } from 'vitest';
import { selectColourPlan, selectCounts, selectShareUrl } from './selectors';
import { instrumentClient, trackEngine } from './services/engine';
import { buildExportRequest, downloadZip } from './services/exporter';
import { createLampStore } from './store';
import { fakeClient, flushMicrotasks, namedError } from './test/fakes';

const make = () => createLampStore({ persistPresets: false, engine: { status: 'ready' } });

describe('exporter', () => {
  it('builds the request from the store', () => {
    const store = make();
    store.getState().actions.setUi({ exportFormat: 'stl', includeFitTest: true });
    const now = new Date('2026-10-22T12:00:00Z');
    const req = buildExportRequest(store, now);
    const s = store.getState();
    expect(req.params).toBe(s.config.params);
    expect(req.colourPlan).toBe(selectColourPlan(s));
    expect(req.colourPlan.outer).toHaveLength(selectCounts(s).nOuter);
    expect(req.format).toBe('stl');
    expect(req.includeFitTest).toBe(true);
    expect(req.meta).toEqual({ shareUrl: selectShareUrl(s), appVersion: expect.any(String), createdAt: '2026-10-22T12:00:00.000Z' });
  });

  it('streams progress into exportJob and saves the blob', async () => {
    const store = make();
    const fc = fakeClient();
    const save = vi.fn();
    const p = downloadZip(store, fc.client, { save });
    expect(store.getState().exportJob.phase).toBe('running');
    const job = fc.exports[0]!;
    job.onProgress!('outer-segment', 2, 6);
    expect(store.getState().exportJob).toEqual({ phase: 'running', stage: 'outer-segment', done: 2, total: 6 });
    // a second click while running is refused
    expect(await downloadZip(store, fc.client, { save })).toBe(false);
    job.resolve({ zip: new Uint8Array([80, 75, 3, 4]), fileName: 'stacklamp.zip' });
    expect(await p).toBe(true);
    expect(store.getState().exportJob).toEqual({ phase: 'done', fileName: 'stacklamp.zip' });
    expect(save).toHaveBeenCalledOnce();
    const [blob, name] = save.mock.calls[0]! as [Blob, string];
    expect(name).toBe('stacklamp.zip');
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBe(4);
  });

  it('reports errors and returns to idle on cancel', async () => {
    const store = make();
    const fc = fakeClient();
    const p = downloadZip(store, fc.client, { save: vi.fn() });
    fc.exports[0]!.reject(new Error('kaputt'));
    expect(await p).toBe(false);
    expect(store.getState().exportJob).toEqual({ phase: 'error', message: 'kaputt' });
    expect(store.getState().notice?.kind).toBe('error');
    const q = downloadZip(store, fc.client, { save: vi.fn() });
    fc.exports[1]!.reject(namedError('CancelledError'));
    expect(await q).toBe(false);
    expect(store.getState().exportJob).toEqual({ phase: 'idle' });
  });

  it('refuses while blocked', async () => {
    const store = createLampStore({ persistPresets: false });
    const fc = fakeClient();
    expect(await downloadZip(store, fc.client)).toBe(false);
    expect(fc.exports).toHaveLength(0);
    expect(store.getState().notice?.text).toMatch(/engine/);
  });
});

describe('engine service', () => {
  it('tracks readiness into engine.status', async () => {
    const store = createLampStore({ persistPresets: false });
    trackEngine({ ...fakeClient().client, ready: Promise.resolve() }, store);
    expect(store.getState().engine.status).toBe('loading');
    await flushMicrotasks();
    expect(store.getState().engine.status).toBe('ready');
    const failing = Promise.reject(new Error('no wasm'));
    trackEngine({ ...fakeClient().client, ready: failing }, store);
    await flushMicrotasks();
    expect(store.getState().engine).toEqual({ status: 'error', error: 'no wasm' });
  });
  it('counts calls', () => {
    const stats = { buildParts: 0, exportZip: 0 };
    const c = instrumentClient(fakeClient().client, stats);
    void c.buildParts({} as never, 'preview');
    void c.buildParts({} as never, 'preview');
    expect(stats.buildParts).toBe(2);
  });
});
