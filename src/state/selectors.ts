/**
 * Memoised selectors over LampState. Every selector returns the SAME reference for the
 * same inputs, and keeps its reference across unrelated state changes (e.g. a UI toggle
 * does not produce new fitted bands). Safe to pass straight to `useLamp`.
 */
import { computeBom, deriveDims, partsKey } from '../geometry';
import type { Bom, ColourPlan, DerivedDims, LampParams, Message, PartMesh, PetgColour } from '../geometry';
import { bandsEqual, fitBands } from './bands';
import { encodeConfig } from './codec';
import type { BandCounts } from './codec';
import type { Bands, GeneratorSpec, Generators, LampConfig, Stack } from './config';
import { memoLast, memoStable, shallowArrayEqual } from './memo';
import type { LampActions, LampState } from './store';
import { shareUrl } from './url';

const dimsCache = new WeakMap<LampParams, DerivedDims>();
/** deriveDims, memoised per params object. */
export function dimsFor(params: LampParams): DerivedDims {
  let d = dimsCache.get(params);
  if (!d) {
    d = deriveDims(params);
    dimsCache.set(params, d);
  }
  return d;
}

const keyCache = new WeakMap<LampParams, string>();
/** partsKey, memoised per params object. */
export function partsKeyFor(params: LampParams): string {
  let k = keyCache.get(params);
  if (k === undefined) {
    k = partsKey(params);
    keyCache.set(params, k);
  }
  return k;
}

export const selectActions = (s: LampState): LampActions => s.actions;
export const selectConfig = (s: LampState): LampConfig => s.config;
export const selectParams = (s: LampState): LampParams => s.config.params;
export const selectPalette = (s: LampState): PetgColour[] => s.config.palette;

/** Derived dims of the current params. */
export const selectDims = (s: LampState): DerivedDims => dimsFor(s.config.params);
/** Derived dims of the params the preview parts were built from (null before the first build). */
export const selectPreviewDims = (s: LampState): DerivedDims | null => (s.preview.params ? dimsFor(s.preview.params) : null);
/** All messages (errors, warnings, info) of the current params. */
export const selectMessages = (s: LampState): Message[] => selectDims(s).messages;

const countsMemo = memoLast((nInner: number, nOuter: number): BandCounts => ({ nInner, nOuter }));
export const selectCounts = (s: LampState): BandCounts => {
  const d = selectDims(s);
  return countsMemo(d.inner.count, d.outer.count);
};

const fitMemo = (): ((stored: string[], n: number, palette: PetgColour[], gen: GeneratorSpec | null) => string[]) =>
  memoStable(fitBands, bandsEqual);
const fitInner = fitMemo();
const fitOuter = fitMemo();
const fittedMemo = memoLast((inner: string[], outer: string[]): Bands => ({ inner, outer }));

/** Bands fitted to the current N, bottom → top. Each stack keeps its reference unless its colours change. */
export const selectFittedBands = (s: LampState): Bands => {
  const { nInner, nOuter } = selectCounts(s);
  const c = s.config;
  return fittedMemo(fitInner(c.bands.inner, nInner, c.palette, c.gen.inner), fitOuter(c.bands.outer, nOuter, c.palette, c.gen.outer));
};

/** Fitted bands of one stack. */
export const selectStackBands = (s: LampState, stack: Stack): string[] => selectFittedBands(s)[stack];

const planMemo = memoLast((palette: PetgColour[], inner: string[], outer: string[]): ColourPlan => ({ palette, inner, outer }));
/** ColourPlan for the current N (what the export uses). */
export const selectColourPlan = (s: LampState): ColourPlan => {
  const f = selectFittedBands(s);
  return planMemo(s.config.palette, f.inner, f.outer);
};

export interface ColourUsage {
  inner: number;
  outer: number;
  total: number;
}
const usageMemo = memoLast((palette: PetgColour[], inner: string[], outer: string[]): Record<string, ColourUsage> => {
  const out: Record<string, ColourUsage> = {};
  for (const c of palette) out[c.id] = { inner: 0, outer: 0, total: 0 };
  for (const [stack, list] of [['inner', inner], ['outer', outer]] as const) {
    for (const id of list) {
      const u = (out[id] ??= { inner: 0, outer: 0, total: 0 });
      u[stack] += 1;
      u.total += 1;
    }
  }
  return out;
});
/** Segment counts per colour id (every palette id present, 0 when unused). */
export const selectUsage = (s: LampState): Record<string, ColourUsage> => {
  const f = selectFittedBands(s);
  return usageMemo(s.config.palette, f.inner, f.outer);
};

const previewPlanMemo = memoLast(
  (palette: PetgColour[], bands: Bands, gen: Generators, nInner: number, nOuter: number): ColourPlan => ({
    palette,
    inner: fitBands(bands.inner, nInner, palette, gen.inner),
    outer: fitBands(bands.outer, nOuter, palette, gen.outer),
  }),
);
const bomMemo = memoLast((parts: PartMesh[] | null, dims: DerivedDims | null, plan: ColourPlan | null): Bom | null =>
  parts && dims && plan ? computeBom(parts, dims, plan) : null,
);
/**
 * Bill of materials for the parts currently shown in the preview (null before the first
 * build). Colour counts are fitted to the preview's N so they match the part copies.
 */
export const selectBom = (s: LampState): Bom | null => {
  const pd = selectPreviewDims(s);
  let plan: ColourPlan | null = null;
  if (pd) {
    const c = selectCounts(s);
    plan =
      pd.inner.count === c.nInner && pd.outer.count === c.nOuter
        ? selectColourPlan(s)
        : previewPlanMemo(s.config.palette, s.config.bands, s.config.gen, pd.inner.count, pd.outer.count);
  }
  return bomMemo(s.preview.parts, pd, plan);
};

/** True while the preview parts do not match the current geometry (a rebuild is due or running). */
export const selectPreviewStale = (s: LampState): boolean =>
  s.preview.params === null || partsKeyFor(s.preview.params) !== partsKeyFor(s.config.params);

const EMPTY: readonly string[] = Object.freeze([]);
const blockersMemo = memoStable(
  (dims: DerivedDims, status: LampState['engine']['status'], error: string | undefined): readonly string[] => {
    const out: string[] = [];
    if (status === 'loading') out.push('The geometry engine is still loading.');
    if (status === 'error') out.push(`The geometry engine could not start${error ? `: ${error}` : ''}.`);
    for (const m of dims.messages) if (m.severity === 'error') out.push(m.text);
    return out.length ? out : EMPTY;
  },
  shallowArrayEqual,
);
/** Reasons the download is blocked (engine state + error messages). Empty array ⇒ none. */
export const selectBlockers = (s: LampState): readonly string[] =>
  blockersMemo(selectDims(s), s.engine.status, s.engine.error);

export const selectCanDownload = (s: LampState): boolean =>
  selectBlockers(s).length === 0 && s.exportJob.phase !== 'running';

const codeMemo = memoLast((config: LampConfig, nInner: number, nOuter: number): string =>
  encodeConfig(config, { nInner, nOuter }),
);
/** The share code (`v=1&…`) of the current config. */
export const selectCode = (s: LampState): string => {
  const c = selectCounts(s);
  return codeMemo(s.config, c.nInner, c.nOuter);
};

export const selectShareUrl = (s: LampState): string => shareUrl(selectCode(s));

const NO_MESSAGES: readonly Message[] = Object.freeze([]);
const fieldCache = new WeakMap<DerivedDims, Map<string, readonly Message[]>>();
/** Messages whose `path` is `path` (stable array; shared empty array when none). */
export function selectFieldMessages(s: LampState, path: string): readonly Message[] {
  const dims = selectDims(s);
  let byPath = fieldCache.get(dims);
  if (!byPath) {
    byPath = new Map();
    for (const m of dims.messages) {
      if (!m.path) continue;
      const list = byPath.get(m.path) as Message[] | undefined;
      if (list) list.push(m);
      else byPath.set(m.path, [m]);
    }
    fieldCache.set(dims, byPath);
  }
  return byPath.get(path) ?? NO_MESSAGES;
}
