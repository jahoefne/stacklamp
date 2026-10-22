/**
 * The translucent-PETG palette. DEFAULT_PALETTE ids AND ORDER are frozen: the URL codec
 * writes bands as indices into the active palette and only emits `pal=` when the palette
 * differs from this list. Hex values may be refined by the design agent.
 */
import type { PetgColour } from '../geometry';

export const DEFAULT_PALETTE: readonly PetgColour[] = Object.freeze([
  { id: 'clr', name: 'Clear', hex: '#fff4e0' },
  { id: 'smk', name: 'Smoke', hex: '#9a9a9a' },
  { id: 'amb', name: 'Amber', hex: '#ffb340' },
  { id: 'org', name: 'Orange', hex: '#ff7a1a' },
  { id: 'red', name: 'Red', hex: '#ff3b2e' },
  { id: 'vio', name: 'Violet', hex: '#8a5cff' },
  { id: 'blu', name: 'Blue', hex: '#2f7cff' },
  { id: 'tea', name: 'Teal', hex: '#19c6b8' },
  { id: 'grn', name: 'Green', hex: '#4fd45a' },
] as PetgColour[]).map((c) => Object.freeze(c)) as readonly PetgColour[];

export const DEFAULT_COLOUR_IDS: readonly string[] = DEFAULT_PALETTE.map((c) => c.id);

/** Hard limit (the codec writes one base-36 char per band, and the UI grid is sized for it). */
export const MAX_COLOURS = 16;
export const MAX_NAME_LENGTH = 20;
/** Used when a palette entry carries an unusable hex. */
export const FALLBACK_HEX = '#9a9a9a';

/** Fresh mutable copy of the default palette. */
export function defaultPalette(): PetgColour[] {
  return DEFAULT_PALETTE.map((c) => ({ ...c }));
}

/** Keep `[A-Za-z0-9 -]`, collapse spaces, trim, cap at 20 chars. Empty → `fallback`. */
export function sanitizeColourName(name: string, fallback = 'Colour'): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback.slice(0, MAX_NAME_LENGTH);
}

/** '#RGB', 'rgb', '#rrggbb' or 'rrggbb' → '#rrggbb' (lowercase); anything else → null. */
export function normalizeHex(hex: string): string | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = h.replace(/./g, (ch) => ch + ch);
  return `#${h}`;
}

/** Smallest unused custom id: c1, c2, … */
export function nextCustomId(palette: readonly PetgColour[]): string {
  const used = new Set(palette.map((c) => c.id));
  for (let k = 1; ; k++) if (!used.has(`c${k}`)) return `c${k}`;
}

/** Same ids, names and hexes in the same order. */
export function paletteEquals(a: readonly PetgColour[], b: readonly PetgColour[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i]!;
    return c.id === d.id && c.name === d.name && c.hex.toLowerCase() === d.hex.toLowerCase();
  });
}

export function isDefaultPalette(p: readonly PetgColour[]): boolean {
  return paletteEquals(p, DEFAULT_PALETTE);
}

export function findColour(palette: readonly PetgColour[], id: string): PetgColour | undefined {
  return palette.find((c) => c.id === id);
}
