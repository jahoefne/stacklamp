/**
 * Built-in presets (stored as share codes) and the user's saved presets
 * (localStorage `stacklamp.v1.presets` as `{ name, code, savedAt }[]`, names unique).
 */
import { STORAGE_KEYS, readStorageJson, writeStorage } from './storage';

export interface BuiltinPreset {
  id: string;
  name: string;
  description: string;
  /** Share code (`v=1&…`). */
  code: string;
}

export interface SavedPreset {
  name: string;
  code: string;
  /** ISO timestamp. */
  savedAt: string;
}

export const BUILTIN_PRESETS: readonly BuiltinPreset[] = [
  {
    id: 'classic-1500',
    name: 'Classic 1500',
    description: '1.5 m aluminium tube with LED strip; amber → orange → red outer stack, clear inner stack.',
    code: 'v=1',
  },
  {
    id: 'a1-mini-compact',
    name: 'A1 mini compact',
    description: '1 m lamp sized for a 180 mm bed: 150 mm outer tube, 170 mm base, 120 mm segments.',
    code: 'v=1&pp=a1m&rl=1000&oo=150&ih=120&oh=120&bd=170&pd=130&pt=22',
  },
  {
    id: 'led-tube-28',
    name: 'LED tube 1200',
    description: 'Single-ended 28 mm LED tube, 1200 mm, cable through the socket, no inner cover slits; blue → teal → green.',
    code: 'v=1&cp=l&rl=1200&sb=0&is=0&go=g678',
  },
  {
    id: 'tall-2000',
    name: 'Tall 2000',
    description: '2 m rod with 180 mm segments; mirrored amber → violet gradient.',
    code: 'v=1&rl=2000&ih=180&oh=180&go=g2345m',
  },
];

export const MAX_PRESET_NAME = 40;

/** Trim, collapse whitespace, cap at 40 chars. */
export function cleanPresetName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_PRESET_NAME).trim();
}

/** Validated saved presets (bad entries dropped, first of each name wins). */
export function parseSavedPresets(raw: unknown): SavedPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SavedPreset[] = [];
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue;
    const { name, code, savedAt } = e as Record<string, unknown>;
    if (typeof name !== 'string' || typeof code !== 'string') continue;
    const clean = cleanPresetName(name);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push({ name: clean, code, savedAt: typeof savedAt === 'string' ? savedAt : '' });
  }
  return out;
}

export function loadSavedPresets(): SavedPreset[] {
  return parseSavedPresets(readStorageJson(STORAGE_KEYS.presets));
}

export function writeSavedPresets(list: readonly SavedPreset[]): boolean {
  return writeStorage(STORAGE_KEYS.presets, JSON.stringify(list));
}

/** Insert or replace by name (keeps the position of an existing entry). */
export function upsertPreset(list: readonly SavedPreset[], preset: SavedPreset): SavedPreset[] {
  const i = list.findIndex((p) => p.name === preset.name);
  if (i < 0) return [...list, preset];
  const next = [...list];
  next[i] = preset;
  return next;
}

/** Lookup order: built-in id, saved name, built-in name. */
export function findPreset(idOrName: string, saved: readonly SavedPreset[]): { name: string; code: string } | null {
  const byId = BUILTIN_PRESETS.find((p) => p.id === idOrName);
  if (byId) return byId;
  const clean = cleanPresetName(idOrName);
  const mine = saved.find((p) => p.name === clean);
  if (mine) return mine;
  return BUILTIN_PRESETS.find((p) => p.name === clean) ?? null;
}
