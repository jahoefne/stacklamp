/**
 * The persisted lamp configuration (what the URL hash encodes) and the per-viewer UI
 * preferences (localStorage only). Pure data + factories.
 */
import { defaultParams, deriveDims } from '../geometry';
import type { LampParams, PetgColour } from '../geometry';
import { generateBands, normalizeSpec } from './generators';
import { defaultPalette } from './palette';

export const CONFIG_VERSION = 1;

export type Stack = 'inner' | 'outer';
export const STACKS: readonly Stack[] = ['inner', 'outer'];

export type GeneratorKind = 'alternate' | 'gradient' | 'random';
export const GENERATOR_KINDS: readonly GeneratorKind[] = ['alternate', 'gradient', 'random'];

/** A colour generator bound to one stack. While set, the stack regenerates for any N. */
export interface GeneratorSpec {
  kind: GeneratorKind;
  /** Palette colour ids, in order (gradient runs bottom → top in this order). */
  colours: string[];
  /** random only. */
  seed?: number;
  /** Reflect about the middle (a → z → a). */
  mirrored?: boolean;
}

export interface Bands {
  /** Stored colour ids, bottom → top. MAY be longer or shorter than N (lossless across N changes). */
  inner: string[];
  outer: string[];
}

export interface Generators {
  inner: GeneratorSpec | null;
  outer: GeneratorSpec | null;
}

export interface LampConfig {
  params: LampParams;
  palette: PetgColour[];
  bands: Bands;
  gen: Generators;
}

export type ViewMode = 'assembled' | 'inner' | 'exploded';
export type GenTarget = Stack | 'both';
export type GlowMode = 'auto' | 'on' | 'off';

export interface UiPrefs {
  viewMode: ViewMode;
  exportFormat: '3mf' | 'stl';
  includeFitTest: boolean;
  /** Editing one segment-height target also sets the other. */
  linkSegmentHeights: boolean;
  /** Active paint colour id. */
  brush: string;
  /** Generator colour set, kept in palette order. */
  mix: string[];
  genTarget: GenTarget;
  tuningOpen: boolean;
  glow: GlowMode;
}

export const DEFAULT_OUTER_GEN: Readonly<GeneratorSpec> = Object.freeze({
  kind: 'gradient',
  colours: Object.freeze(['amb', 'org', 'red']) as unknown as string[],
});
export const DEFAULT_INNER_BANDS: readonly string[] = Object.freeze(['clr']);

export function defaultGen(stack: Stack): GeneratorSpec | null {
  return stack === 'outer' ? normalizeSpec(DEFAULT_OUTER_GEN) : null;
}

/** Default lamp: rod + strip, outer = gradient amber → orange → red, inner = all clear. */
export function defaultConfig(): LampConfig {
  const params = defaultParams();
  const outerGen = defaultGen('outer')!;
  return {
    params,
    palette: defaultPalette(),
    bands: { inner: [...DEFAULT_INNER_BANDS], outer: generateBands(outerGen, deriveDims(params).outer.count) },
    gen: { inner: null, outer: outerGen },
  };
}

export function defaultUiPrefs(): UiPrefs {
  return {
    viewMode: 'assembled',
    exportFormat: '3mf',
    includeFitTest: false,
    linkSegmentHeights: true,
    brush: 'amb',
    mix: ['amb', 'org', 'red'],
    genTarget: 'outer',
    tuningOpen: false,
    glow: 'auto',
  };
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/**
 * Shallow-merge untrusted UI prefs (e.g. from localStorage) over `base`, type-checking each
 * field, and make brush/mix refer to colours that exist in `palette` (mix in palette order).
 */
export function normalizeUi(raw: unknown, palette: readonly PetgColour[], base: UiPrefs = defaultUiPrefs()): UiPrefs {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const ui: UiPrefs = {
    viewMode: oneOf(r.viewMode, ['assembled', 'inner', 'exploded'], base.viewMode),
    exportFormat: oneOf(r.exportFormat, ['3mf', 'stl'], base.exportFormat),
    includeFitTest: bool(r.includeFitTest, base.includeFitTest),
    linkSegmentHeights: bool(r.linkSegmentHeights, base.linkSegmentHeights),
    brush: typeof r.brush === 'string' ? r.brush : base.brush,
    mix: Array.isArray(r.mix) ? r.mix.filter((x): x is string => typeof x === 'string') : base.mix,
    genTarget: oneOf(r.genTarget, ['inner', 'outer', 'both'], base.genTarget),
    tuningOpen: bool(r.tuningOpen, base.tuningOpen),
    glow: oneOf(r.glow, ['auto', 'on', 'off'], base.glow),
  };
  return fixUiColourRefs(ui, palette);
}

/** brush → an existing colour (else the first palette colour); mix → existing ids in palette order. */
export function fixUiColourRefs(ui: UiPrefs, palette: readonly PetgColour[]): UiPrefs {
  const ids = palette.map((c) => c.id);
  const brush = ids.includes(ui.brush) ? ui.brush : (ids[0] ?? ui.brush);
  const inMix = new Set(ui.mix);
  const mix = ids.filter((id) => inMix.has(id));
  const sameMix = mix.length === ui.mix.length && mix.every((id, i) => id === ui.mix[i]);
  if (brush === ui.brush && sameMix) return ui;
  return { ...ui, brush, mix: sameMix ? ui.mix : mix };
}
