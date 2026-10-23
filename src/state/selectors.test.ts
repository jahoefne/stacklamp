import { describe, expect, it } from 'vitest';
import {
  selectBlockers,
  selectBom,
  selectCanDownload,
  selectCode,
  selectColourPlan,
  selectCounts,
  selectDims,
  selectFieldMessages,
  selectFittedBands,
  selectFittedForms,
  selectPreviewDims,
  selectPreviewStale,
  selectShareUrl,
  selectUsage,
} from './selectors';
import { createLampStore } from './store';
import { fakeParts } from './test/fakes';

const make = () => createLampStore({ persistPresets: false, engine: { status: 'ready' } });
const partsFor = (s: ReturnType<ReturnType<typeof make>['getState']>) => fakeParts(selectDims(s));

describe('selector stability', () => {
  it('returns the same references for the same state', () => {
    const s = make().getState();
    for (const sel of [selectDims, selectCounts, selectFittedBands, selectColourPlan, selectUsage, selectBlockers, selectBom, selectCode])
      expect(sel(s)).toBe(sel(s));
  });
  it('keeps references across unrelated UI changes', () => {
    const store = make();
    const a = store.getState();
    const sels = [selectDims, selectFittedBands, selectColourPlan, selectUsage, selectBlockers, selectCounts, selectCode] as const;
    const refs = sels.map((sel) => sel(a));
    store.getState().actions.setUi({ viewMode: 'exploded', brush: 'grn' });
    store.getState().actions.notify('info', 'x');
    store.getState().actions.setPreview({ status: 'building' });
    const b = store.getState();
    expect(b).not.toBe(a);
    sels.forEach((sel, i) => expect(sel(b), sel.name).toBe(refs[i]));
  });
  it('keeps fitted bands when a param change does not change N', () => {
    const store = make();
    const a = store.getState();
    const bands = selectFittedBands(a);
    const counts = selectCounts(a);
    store.getState().actions.setParam('base.diameter', 230);
    const b = store.getState();
    expect(selectDims(b)).not.toBe(selectDims(a));
    expect(selectCounts(b)).toBe(counts);
    expect(selectFittedBands(b)).toBe(bands);
  });
  it('keeps the inner array when only the outer stack is painted', () => {
    const store = make();
    const a = selectFittedBands(store.getState());
    store.getState().actions.paintBand('outer', 0, 'grn');
    const b = selectFittedBands(store.getState());
    expect(b).not.toBe(a);
    expect(b.inner).toBe(a.inner);
    expect(b.outer[0]).toBe('grn');
  });
  it('keeps fitted bands when a palette hex changes (ids unchanged)', () => {
    const store = make();
    const a = selectFittedBands(store.getState());
    store.getState().actions.updateColour('amb', { hex: '#ffaa00' });
    const s = store.getState();
    expect(selectFittedBands(s)).toBe(a);
    expect(selectColourPlan(s).palette).toBe(s.config.palette);
  });
  it('fitted forms have N entries and keep their reference while the params do', () => {
    const store = make();
    const a = store.getState();
    const { nInner, nOuter } = selectCounts(a);
    const inner = selectFittedForms(a, 'inner');
    const outer = selectFittedForms(a, 'outer');
    expect(inner).toHaveLength(nInner);
    expect(outer).toHaveLength(nOuter);
    expect(inner.every((f) => f === 'straight')).toBe(true);
    expect(selectFittedForms(a, 'inner')).toBe(inner);
    store.getState().actions.setUi({ viewMode: 'exploded' });
    store.getState().actions.setFormBrush('star');
    store.getState().actions.paintBand('outer', 0, 'grn');
    const b = store.getState();
    expect(selectFittedForms(b, 'inner')).toBe(inner);
    expect(selectFittedForms(b, 'outer')).toBe(outer);
    store.getState().actions.paintForm('outer', 0);
    const c = store.getState();
    expect(selectFittedForms(c, 'outer')).not.toBe(outer);
    expect(selectFittedForms(c, 'outer')[0]).toBe('star');
    expect(selectFittedForms(c, 'outer')).toHaveLength(nOuter);
    expect(selectCode(c)).toContain(`fo=t${'s'.repeat(nOuter - 1)}`);
  });
  it('field messages are stable and shared-empty', () => {
    const store = make();
    store.getState().actions.setParam('tubes.innerOD', 30);
    store.getState().actions.setParam('core.diameter', 40);
    const s = store.getState();
    const msgs = selectFieldMessages(s, 'tubes.innerOD');
    expect(msgs.length).toBeGreaterThan(0);
    expect(selectFieldMessages(s, 'tubes.innerOD')).toBe(msgs);
    expect(selectFieldMessages(s, 'plate.od')).toBe(selectFieldMessages(s, 'cover.slitWidth'));
  });
});

describe('derived values', () => {
  it('usage counts fitted bands per colour', () => {
    const s = make().getState();
    const u = selectUsage(s);
    const { nInner, nOuter } = selectCounts(s);
    expect(u.clr!.inner).toBe(nInner);
    expect(u.amb!.outer + u.org!.outer + u.red!.outer).toBe(nOuter);
    expect(u.grn).toEqual({ inner: 0, outer: 0, total: 0 });
  });
  it('blockers include engine state and error messages; canDownload follows', () => {
    const store = createLampStore({ persistPresets: false });
    expect(selectBlockers(store.getState())).toEqual(['The geometry engine is still loading.']);
    expect(selectCanDownload(store.getState())).toBe(false);
    store.getState().actions.setEngine({ status: 'ready' });
    expect(selectBlockers(store.getState())).toEqual([]);
    expect(selectCanDownload(store.getState())).toBe(true);
    store.getState().actions.setParam('tubes.innerOD', 30);
    store.getState().actions.setParam('core.diameter', 40);
    expect(selectDims(store.getState()).ok).toBe(false);
    expect(selectBlockers(store.getState()).length).toBeGreaterThan(0);
    store.getState().actions.setEngine({ status: 'error', error: 'no wasm' });
    expect(selectBlockers(store.getState())[0]).toMatch(/no wasm/);
    store.getState().actions.setExportJob({ phase: 'running', stage: 'base', done: 0, total: 6 });
    expect(selectCanDownload(store.getState())).toBe(false);
  });
  it('BOM appears with parts, matches preview dims and is stable', () => {
    const store = make();
    expect(selectBom(store.getState())).toBeNull();
    expect(selectPreviewStale(store.getState())).toBe(true);
    const s0 = store.getState();
    store.getState().actions.setPreview({ parts: partsFor(s0), params: s0.config.params, status: 'idle' });
    const s = store.getState();
    expect(selectPreviewStale(s)).toBe(false);
    expect(selectPreviewDims(s)).toBe(selectDims(s));
    const bom = selectBom(s)!;
    expect(bom.parts.map((p) => p.part)).toEqual(['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp']);
    const total = bom.colours.reduce((n, c) => n + c.inner + c.outer, 0);
    expect(total).toBe(selectCounts(s).nInner + selectCounts(s).nOuter);
    store.getState().actions.setUi({ glow: 'off' });
    expect(selectBom(store.getState())).toBe(bom);
    // N changes but the preview has not caught up: colour counts follow the preview's N
    store.getState().actions.setParam('core.length', 800);
    const t = store.getState();
    expect(selectPreviewStale(t)).toBe(true);
    const stale = selectBom(t)!;
    expect(stale.colours.reduce((n, c) => n + c.outer, 0)).toBe(selectPreviewDims(t)!.outer.count);
  });
  it('code and share URL', () => {
    const store = make();
    expect(selectCode(store.getState())).toBe('v=1');
    expect(selectShareUrl(store.getState())).toBe('https://jahoefne.github.io/stacklamp/#v=1');
    store.getState().actions.setParam('core.length', 1000);
    expect(selectCode(store.getState())).toBe('v=1&rl=1000');
  });
});
