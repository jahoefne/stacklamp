import { describe, expect, it } from 'vitest';
import { PRINTER_PRESETS, defaultParams, deriveDims } from '../geometry';
import { fitBands } from './bands';
import { decodeConfig } from './codec';
import { defaultConfig, defaultUiPrefs } from './config';
import { generateBands } from './generators';
import { DEFAULT_PALETTE, MAX_COLOURS } from './palette';
import { selectDims, selectFittedBands } from './selectors';
import { createLampStore } from './store';
import type { LampStoreInit } from './store';

const make = (init: LampStoreInit = {}) => createLampStore({ persistPresets: false, ...init });

describe('setParam', () => {
  it('clamps to PARAM_META and rounds to the field precision', () => {
    const store = make();
    const { setParam } = store.getState().actions;
    setParam('core.length', 5000);
    expect(store.getState().config.params.core.length).toBe(2000);
    setParam('core.length', 100);
    expect(store.getState().config.params.core.length).toBe(600);
    setParam('segments.wall', 0.8333);
    expect(store.getState().config.params.segments.wall).toBe(0.83);
    setParam('core.length', Number.NaN);
    expect(store.getState().config.params.core.length).toBe(600);
  });
  it('keeps the same config object when nothing changes', () => {
    const store = make();
    const before = store.getState().config;
    store.getState().actions.setParam('core.length', 1500);
    expect(store.getState().config).toBe(before);
  });
  it('links the segment heights when ui.linkSegmentHeights is on (default)', () => {
    const store = make();
    const { setParam, setUi } = store.getState().actions;
    setParam('segments.innerHeight', 120);
    expect(store.getState().config.params.segments.outerHeight).toBe(120);
    setParam('segments.outerHeight', 9999);
    expect(store.getState().config.params.segments).toMatchObject({ innerHeight: 250, outerHeight: 250 });
    setUi({ linkSegmentHeights: false });
    setParam('segments.innerHeight', 100);
    expect(store.getState().config.params.segments).toMatchObject({ innerHeight: 100, outerHeight: 250 });
    // turning the link back on aligns inner to outer
    setUi({ linkSegmentHeights: true });
    expect(store.getState().config.params.segments).toMatchObject({ innerHeight: 250, outerHeight: 250 });
  });
  it('switches the printer preset to custom when the bed is edited', () => {
    const store = make();
    const { setParam, applyPrinterPreset } = store.getState().actions;
    applyPrinterPreset('bambu-a1-mini');
    expect(store.getState().config.params.printer).toEqual({ preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 });
    setParam('printer.bedZ', 200);
    expect(store.getState().config.params.printer).toEqual({ preset: 'custom', bedX: 180, bedY: 180, bedZ: 200 });
    applyPrinterPreset('custom');
    expect(store.getState().config.params.printer.bedZ).toBe(200);
    applyPrinterPreset('prusa-mk4');
    const [x, y, z] = PRINTER_PRESETS['prusa-mk4'].bed;
    expect(store.getState().config.params.printer).toEqual({ preset: 'prusa-mk4', bedX: x, bedY: y, bedZ: z });
  });
});

describe('enums and presets', () => {
  it('applyCorePreset sets kind + diameter; setEnum delegates', () => {
    const store = make();
    store.getState().actions.setEnum('core.kind', 'led-tube');
    expect(store.getState().config.params.core).toMatchObject({ kind: 'led-tube', diameter: 28 });
    store.getState().actions.applyCorePreset('aluminium-rod');
    expect(store.getState().config.params.core).toMatchObject({ kind: 'aluminium-rod', diameter: 20 });
    store.getState().actions.setEnum('printer.preset', 'ender-3');
    expect(store.getState().config.params.printer.bedZ).toBe(250);
  });
  it('the LED tube drops the strip build-up and the inner slits (no dropped-slits warning); the rod brings the defaults back', () => {
    const store = make();
    store.getState().actions.applyCorePreset('led-tube');
    let p = store.getState().config.params;
    expect(p.core.stripBuildUp).toBe(0);
    expect(p.cover.innerSlits).toBe(0);
    expect(deriveDims(p).messages.map((m) => m.code)).not.toContain('inner-slits-dropped');
    store.getState().actions.applyCorePreset('aluminium-rod');
    p = store.getState().config.params;
    expect(p.core.stripBuildUp).toBe(defaultParams().core.stripBuildUp);
    expect(p.cover.innerSlits).toBe(defaultParams().cover.innerSlits);
    // A deliberate non-zero count survives the round trip to the rod.
    store.getState().actions.setParam('cover.innerSlits', 12);
    store.getState().actions.applyCorePreset('led-tube');
    store.getState().actions.applyCorePreset('aluminium-rod');
    expect(store.getState().config.params.cover.innerSlits).toBe(defaultParams().cover.innerSlits);
  });
  it('setHeightMode and setEnum(wireRouting)', () => {
    const store = make();
    store.getState().actions.setHeightMode('locked');
    store.getState().actions.setEnum('base.wireRouting', 'through-socket');
    expect(store.getState().config.params.segments.heightMode).toBe('locked');
    expect(store.getState().config.params.base.wireRouting).toBe('through-socket');
    const before = store.getState().config;
    store.getState().actions.setEnum('base.wireRouting', 'bogus' as never);
    expect(store.getState().config).toBe(before);
  });
});

describe('colour bands', () => {
  it('paintBand paints with the brush, materialises the generator and clears it', () => {
    const store = make();
    const { paintBand, setBrush } = store.getState().actions;
    const before = selectFittedBands(store.getState()).outer;
    setBrush('blu');
    paintBand('outer', 1);
    const s = store.getState();
    expect(s.config.gen.outer).toBeNull();
    expect(selectFittedBands(s).outer).toEqual(before.map((id, i) => (i === 1 ? 'blu' : id)));
    paintBand('inner', 0, 'red');
    expect(selectFittedBands(store.getState()).inner[0]).toBe('red');
  });
  it('painted bands survive N shrinking and growing back', () => {
    const store = make();
    const { paintBand, setParam } = store.getState().actions;
    const n0 = selectDims(store.getState()).outer.count;
    paintBand('outer', n0 - 1, 'grn');
    setParam('core.length', 800);
    expect(selectDims(store.getState()).outer.count).toBeLessThan(n0);
    setParam('core.length', 1500);
    expect(selectFittedBands(store.getState()).outer[n0 - 1]).toBe('grn');
  });
  it('applyGenerator fits N from selectDims and uses ui.mix on ui.genTarget', () => {
    let r = 0.5;
    const store = make({ random: () => r });
    const { applyGenerator, setParam, setUi } = store.getState().actions;
    setParam('core.length', 900);
    setUi({ mix: ['red', 'blu'], genTarget: 'both' });
    applyGenerator('alternate');
    let s = store.getState();
    const d = selectDims(s);
    expect(s.config.bands.outer).toHaveLength(d.outer.count);
    expect(s.config.bands.inner).toHaveLength(d.inner.count);
    expect(s.config.gen.outer).toEqual({ kind: 'alternate', colours: ['red', 'blu'] });
    expect(s.config.bands.outer).toEqual(generateBands(s.config.gen.outer!, d.outer.count));
    applyGenerator('random');
    s = store.getState();
    const seed = Math.floor(0.5 * 36 ** 4);
    expect(s.config.gen.inner?.seed).toBe(seed);
    expect(s.config.gen.outer?.seed).toBe(seed + 1);
    r = 0.25;
    setUi({ genTarget: 'inner' });
    applyGenerator('random');
    expect(store.getState().config.gen.inner?.seed).toBe(Math.floor(0.25 * 36 ** 4));
    expect(store.getState().config.gen.outer?.seed).toBe(seed + 1);
  });
  it('applyGenerator with an empty mix posts an error and changes nothing', () => {
    const store = make();
    store.getState().actions.setUi({ mix: [] });
    const before = store.getState().config;
    store.getState().actions.applyGenerator('gradient');
    expect(store.getState().config).toBe(before);
    expect(store.getState().notice?.kind).toBe('error');
  });
  it('mirror toggles generator stacks and reflects painted stacks', () => {
    const store = make();
    const { mirror, setUi, paintBand } = store.getState().actions;
    mirror();
    expect(store.getState().config.gen.outer?.mirrored).toBe(true);
    const out = selectFittedBands(store.getState()).outer;
    expect(out).toEqual([...out].reverse());
    mirror();
    expect(store.getState().config.gen.outer?.mirrored).toBeUndefined();
    setUi({ genTarget: 'inner' });
    paintBand('inner', 0, 'red');
    paintBand('inner', 1, 'blu');
    mirror();
    const inner = selectFittedBands(store.getState()).inner;
    expect(inner).toEqual([...inner].reverse());
    expect(inner.at(-1)).toBe('red');
    expect(inner.at(-2)).toBe('blu');
  });
});

describe('palette', () => {
  it('addColour assigns c1, c2… and stops at 16', () => {
    const store = make();
    const { addColour } = store.getState().actions;
    expect(addColour({ name: 'Pink!!', hex: 'f0c' })).toBe('c1');
    expect(store.getState().config.palette.at(-1)).toEqual({ id: 'c1', name: 'Pink', hex: '#ff00cc' });
    expect(addColour()).toBe('c2');
    for (let i = store.getState().config.palette.length; i < MAX_COLOURS; i++) addColour();
    expect(store.getState().config.palette).toHaveLength(MAX_COLOURS);
    expect(addColour()).toBeNull();
    expect(store.getState().notice?.kind).toBe('error');
  });
  it('updateColour sanitises names and ignores invalid hex', () => {
    const store = make();
    const { updateColour } = store.getState().actions;
    updateColour('red', { name: '  Deep~Red  ', hex: 'nope' });
    expect(store.getState().config.palette.find((c) => c.id === 'red')).toEqual({ id: 'red', name: 'DeepRed', hex: '#f2363f' });
    updateColour('red', { hex: '#AA0000' });
    expect(store.getState().config.palette.find((c) => c.id === 'red')?.hex).toBe('#aa0000');
  });
  it('removeColour rewrites bands, generators, mix and brush', () => {
    const store = make();
    const { removeColour, paintBand, setBrush } = store.getState().actions;
    paintBand('inner', 0, 'org');
    setBrush('org');
    removeColour('org', 'blu');
    const s = store.getState();
    expect(s.config.palette.some((c) => c.id === 'org')).toBe(false);
    expect(s.config.bands.inner[0]).toBe('blu');
    expect(s.config.gen.outer?.colours).toEqual(['amb', 'blu', 'red']);
    expect(s.ui.mix).toEqual(['amb', 'red']);
    expect(s.ui.brush).toBe('blu');
    // default replacement: first remaining colour
    removeColour('amb');
    expect(store.getState().config.gen.outer?.colours).toEqual(['clr', 'blu', 'red']);
  });
  it('removeColour refuses to empty the palette', () => {
    const store = make();
    for (const c of DEFAULT_PALETTE.slice(1)) store.getState().actions.removeColour(c.id);
    expect(store.getState().config.palette).toHaveLength(1);
    store.getState().actions.removeColour('clr');
    expect(store.getState().config.palette).toHaveLength(1);
    expect(store.getState().notice?.kind).toBe('error');
    expect(selectFittedBands(store.getState()).outer.every((id) => id === 'clr')).toBe(true);
  });
  it('resetPalette maps custom colours to palette[0]', () => {
    const store = make();
    const { addColour, paintBand, resetPalette, setBrush } = store.getState().actions;
    const id = addColour({ name: 'X', hex: '#123456' })!;
    paintBand('inner', 0, id);
    setBrush(id);
    resetPalette();
    const s = store.getState();
    expect(s.config.palette).toEqual(DEFAULT_PALETTE);
    expect(s.config.bands.inner[0]).toBe('clr');
    expect(s.ui.brush).toBe('clr');
  });
  it('toggleMix keeps palette order', () => {
    const store = make();
    const { toggleMix } = store.getState().actions;
    toggleMix('clr');
    toggleMix('org');
    toggleMix('grn');
    expect(store.getState().ui.mix).toEqual(['clr', 'amb', 'red', 'grn']);
    toggleMix('nope');
    expect(store.getState().ui.mix).toEqual(['clr', 'amb', 'red', 'grn']);
  });
});

describe('config lifecycle', () => {
  it('loadConfig unlinks differing heights and fixes brush/mix', () => {
    const store = make({ ui: { ...defaultUiPrefs(), brush: 'zzz', mix: ['red', 'zzz'] } });
    expect(store.getState().ui.brush).toBe('clr');
    const c = decodeConfig('v=1&ih=100&oh=200')!.config;
    store.getState().actions.loadConfig(c, 'link');
    expect(store.getState().ui.linkSegmentHeights).toBe(false);
    expect(store.getState().ui.mix).toEqual(['red']);
  });
  it('resetAll restores the default lamp but keeps view prefs', () => {
    const store = make();
    const { setParam, setUi, resetAll } = store.getState().actions;
    setParam('core.length', 1000);
    setUi({ viewMode: 'exploded', brush: 'grn', glow: 'off' });
    resetAll();
    const s = store.getState();
    expect(s.config.params).toEqual(defaultConfig().params);
    expect(s.ui).toEqual({ ...defaultUiPrefs(), viewMode: 'exploded', glow: 'off' });
    expect(s.notice?.kind).toBe('info');
  });
  it('save / load / delete presets (unique names)', () => {
    const store = make();
    const { setParam, savePreset, loadPreset, deletePreset, resetAll } = store.getState().actions;
    setParam('core.length', 1100);
    expect(savePreset('  My   lamp ')).toBe(true);
    expect(savePreset('   ')).toBe(false);
    setParam('core.length', 1200);
    savePreset('My lamp');
    expect(store.getState().saved).toHaveLength(1);
    expect(store.getState().saved[0]).toMatchObject({ name: 'My lamp', code: 'v=1&rl=1200' });
    resetAll();
    expect(loadPreset('My lamp')).toBe(true);
    expect(store.getState().config.params.core.length).toBe(1200);
    expect(loadPreset('a1-mini-compact')).toBe(true);
    expect(store.getState().config.params.printer.preset).toBe('bambu-a1-mini');
    expect(loadPreset('nope')).toBe(false);
    deletePreset('My lamp');
    expect(store.getState().saved).toEqual([]);
  });
  it('a finished export job resets when the config changes', () => {
    const store = make();
    store.getState().actions.setExportJob({ phase: 'done', fileName: 'x.zip' });
    store.getState().actions.setUi({ glow: 'off' });
    expect(store.getState().exportJob.phase).toBe('done');
    store.getState().actions.setParam('core.length', 1000);
    expect(store.getState().exportJob).toEqual({ phase: 'idle' });
  });
  it('notify / dismissNotice', () => {
    const store = make();
    const { notify, dismissNotice } = store.getState().actions;
    notify('info', 'one');
    const id = store.getState().notice!.id;
    notify('info', 'two');
    dismissNotice(id);
    expect(store.getState().notice?.text).toBe('two');
    dismissNotice();
    expect(store.getState().notice).toBeNull();
  });
  it('default config derives cleanly and its bands fit', () => {
    const c = defaultConfig();
    const d = deriveDims(c.params);
    expect(d.ok).toBe(true);
    expect(fitBands(c.bands.inner, d.inner.count, c.palette, c.gen.inner).every((x) => x === 'clr')).toBe(true);
    expect(new Set(fitBands(c.bands.outer, d.outer.count, c.palette, c.gen.outer))).toEqual(new Set(['amb', 'org', 'red']));
  });
});
