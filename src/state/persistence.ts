/**
 * URL hash + localStorage mirror.
 * - loadInitial(): hash → localStorage `stacklamp.v1.last` → defaults; UI prefs from
 *   `stacklamp.v1.ui` shallow-merged over the defaults.
 * - startPersistence(store): on config/ui changes (250 ms debounce) writes
 *   `history.replaceState(null, '', '#' + code)` and localStorage; loads pasted links on
 *   `hashchange`; restores the code when the hash becomes something else (e.g. `#main`).
 * Every storage access is wrapped (storage.ts). No-ops outside a browser.
 */
import { decodeConfig } from './codec';
import { defaultConfig, normalizeUi } from './config';
import type { LampConfig, UiPrefs } from './config';
import { selectCode } from './selectors';
import { STORAGE_KEYS, readStorage, readStorageJson, writeStorage } from './storage';
import type { LampStore } from './store';

export { shareUrl } from './url';

export type InitialSource = 'link' | 'storage' | 'default';

export interface InitialState {
  config: LampConfig;
  ui: UiPrefs;
  source: InitialSource;
  /** Decoder notes for the config that was used (empty for defaults). */
  issues: string[];
}

function currentHash(): string {
  try {
    return typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
  } catch {
    return '';
  }
}

export function loadInitial(): InitialState {
  let config = defaultConfig();
  let source: InitialSource = 'default';
  let issues: string[] = [];
  const hash = currentHash();
  const fromHash = hash ? decodeConfig(hash) : null;
  if (fromHash) {
    config = fromHash.config;
    issues = fromHash.issues;
    source = 'link';
  } else {
    const last = readStorage(STORAGE_KEYS.last);
    const fromStorage = last ? decodeConfig(last) : null;
    if (fromStorage) {
      config = fromStorage.config;
      issues = fromStorage.issues;
      source = 'storage';
    }
  }
  const ui = normalizeUi(readStorageJson(STORAGE_KEYS.ui), config.palette);
  if (config.params.segments.innerHeight !== config.params.segments.outerHeight) ui.linkSegmentHeights = false;
  return { config, ui, source, issues };
}

function writeHash(code: string): void {
  try {
    if (currentHash() !== code) history.replaceState(null, '', `#${code}`);
  } catch {
    /* sandboxed iframe, file://, … */
  }
}

export interface PersistenceOptions {
  debounceMs?: number;
}

export function startPersistence(store: LampStore, opts: PersistenceOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  const debounceMs = opts.debounceMs ?? 250;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastCode = '';

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const s = store.getState();
    const code = selectCode(s);
    lastCode = code;
    writeHash(code);
    writeStorage(STORAGE_KEYS.last, code);
    writeStorage(STORAGE_KEYS.ui, JSON.stringify(s.ui));
  };
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const onHashChange = () => {
    const raw = currentHash();
    if (raw === lastCode) return;
    const res = decodeConfig(raw);
    if (!res) {
      // Not a lamp link (an in-page anchor, or cleared): keep the address bar shareable.
      writeHash(lastCode);
      return;
    }
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const { actions } = store.getState();
    actions.loadConfig(res.config, 'link');
    actions.notify('info', ['Loaded the lamp from the link.', ...res.issues].join(' '));
    flush();
  };
  const onPageHide = () => {
    if (timer !== null) flush();
  };

  const unsubConfig = store.subscribe((s) => s.config, schedule);
  const unsubUi = store.subscribe((s) => s.ui, schedule);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('pagehide', onPageHide);
  flush();

  return () => {
    if (timer !== null) flush();
    unsubConfig();
    unsubUi();
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('pagehide', onPageHide);
  };
}
