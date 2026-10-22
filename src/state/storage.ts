/**
 * localStorage access that never throws (private mode, blocked storage, quota, Node).
 * Only touches storage when a `window` exists, so Node tests stay silent.
 */
export const STORAGE_KEYS = {
  /** Last config, as a share code (`v=1&…`). */
  last: 'stacklamp.v1.last',
  /** UiPrefs JSON. */
  ui: 'stacklamp.v1.ui',
  /** SavedPreset[] JSON. */
  presets: 'stacklamp.v1.presets',
} as const;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readStorage(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readStorageJson(key: string): unknown {
  const raw = readStorage(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
