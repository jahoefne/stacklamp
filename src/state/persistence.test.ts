// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeConfigAuto } from './codec';
import { defaultConfig, defaultUiPrefs } from './config';
import { loadInitial, shareUrl, startPersistence } from './persistence';
import { STORAGE_KEYS } from './storage';
import { createLampStore } from './store';

const setHash = (h: string) => history.replaceState(null, '', h ? `#${h}` : location.pathname);
const fireHashChange = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

beforeEach(() => {
  localStorage.clear();
  setHash('');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadInitial', () => {
  it('prefers the hash', () => {
    localStorage.setItem(STORAGE_KEYS.last, 'v=1&rl=900');
    setHash('v=1&rl=1200');
    const init = loadInitial();
    expect(init.source).toBe('link');
    expect(init.config.params.core.length).toBe(1200);
    expect(init.issues).toEqual([]);
  });
  it('falls back to localStorage, then defaults', () => {
    localStorage.setItem(STORAGE_KEYS.last, 'v=1&rl=900');
    expect(loadInitial()).toMatchObject({ source: 'storage', config: { params: { core: { length: 900 } } } });
    localStorage.clear();
    const init = loadInitial();
    expect(init.source).toBe('default');
    expect(init.config).toEqual(defaultConfig());
  });
  it('ignores a non-lamp hash such as an anchor', () => {
    setHash('main');
    expect(loadInitial().source).toBe('default');
  });
  it('shallow-merges stored UI prefs, dropping invalid fields', () => {
    localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify({ viewMode: 'inner', glow: 'loud', brush: 'red', mix: ['blu', 'nope', 'amb'], extra: 1 }));
    const { ui } = loadInitial();
    expect(ui).toEqual({ ...defaultUiPrefs(), viewMode: 'inner', brush: 'red', mix: ['amb', 'blu'] });
  });
  it('unlinks segment heights when the loaded lamp has different ones', () => {
    setHash('v=1&ih=100&oh=200');
    expect(loadInitial().ui.linkSegmentHeights).toBe(false);
  });
  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadInitial().source).toBe('default');
  });
  it('reports decoder issues', () => {
    setHash('v=1&rl=99999');
    expect(loadInitial().issues).toHaveLength(1);
  });
});

describe('startPersistence', () => {
  it('writes the hash at once and after a 250 ms debounce, mirrored to localStorage', () => {
    vi.useFakeTimers();
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    expect(location.hash).toBe('#v=1');
    store.getState().actions.setParam('core.length', 1200);
    vi.advanceTimersByTime(200);
    expect(location.hash).toBe('#v=1');
    store.getState().actions.setParam('core.length', 1250);
    vi.advanceTimersByTime(249);
    expect(location.hash).toBe('#v=1');
    vi.advanceTimersByTime(1);
    expect(location.hash).toBe('#v=1&rl=1250');
    expect(localStorage.getItem(STORAGE_KEYS.last)).toBe('v=1&rl=1250');
    store.getState().actions.setUi({ viewMode: 'exploded' });
    vi.advanceTimersByTime(250);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.ui)!)).toMatchObject({ viewMode: 'exploded' });
    stop();
  });
  it('round-trips through the hash: a fresh load restores the same config', () => {
    vi.useFakeTimers();
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    const { actions } = store.getState();
    actions.setParam('tubes.outerOD', 180);
    actions.paintBand('inner', 2, 'vio');
    actions.addColour({ name: 'Rose', hex: '#ff88aa' });
    vi.advanceTimersByTime(250);
    stop();
    const init = loadInitial();
    expect(init.source).toBe('link');
    expect(encodeConfigAuto(init.config)).toBe(encodeConfigAuto(store.getState().config));
    expect(init.config.palette.at(-1)).toMatchObject({ name: 'Rose', hex: '#ff88aa' });
  });
  it('loads a pasted link on hashchange and notifies', () => {
    vi.useFakeTimers();
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    setHash('rl=1000&bo=46');
    fireHashChange();
    const s = store.getState();
    expect(s.config.params.core.length).toBe(1000);
    expect(s.config.bands.outer).toEqual(['red', 'blu']);
    expect(s.notice?.text).toMatch(/link/);
    expect(location.hash).toBe(`#${encodeConfigAuto(s.config)}`);
    expect(location.hash).toMatch(/^#v=1&rl=1000&bo=(46)+4?$/);
    stop();
  });
  it('a pending edit does not overwrite a pasted link', () => {
    vi.useFakeTimers();
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    store.getState().actions.setParam('core.length', 1300);
    setHash('v=1&rl=700');
    fireHashChange();
    vi.advanceTimersByTime(1000);
    expect(store.getState().config.params.core.length).toBe(700);
    expect(location.hash).toBe('#v=1&rl=700');
    stop();
  });
  it('restores the code when the hash becomes an anchor', () => {
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    setHash('main');
    fireHashChange();
    expect(location.hash).toBe('#v=1');
    expect(store.getState().notice).toBeNull();
    stop();
  });
  it('ignores its own hash', () => {
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    const before = store.getState().config;
    fireHashChange();
    expect(store.getState().config).toBe(before);
    stop();
  });
  it('keeps working when localStorage throws', () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    store.getState().actions.setParam('core.length', 1200);
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    expect(location.hash).toBe('#v=1&rl=1200');
    stop();
  });
  it('flushes a pending write on stop', () => {
    vi.useFakeTimers();
    const store = createLampStore({ persistPresets: false });
    const stop = startPersistence(store);
    store.getState().actions.setParam('core.length', 1200);
    stop();
    expect(localStorage.getItem(STORAGE_KEYS.last)).toBe('v=1&rl=1200');
  });
});

describe('shareUrl', () => {
  it('uses the page origin and the Vite base', () => {
    expect(shareUrl('v=1')).toBe(`${location.origin}${import.meta.env.BASE_URL}#v=1`);
  });
});
