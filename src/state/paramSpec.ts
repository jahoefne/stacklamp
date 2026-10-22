/**
 * URL keys for every parameter. Keys are part of the share-link format and are NEVER renamed
 * or reused; add new keys for new params. A test asserts completeness and uniqueness, also
 * against the codec's own keys (v, pal, bi, bo, gi, go).
 */
import { PARAM_META } from '../geometry';
import type { CoreKind, EnumParamPath, HeightMode, NumericParamPath, ParamMeta, PrinterId, WireRouting } from '../geometry';

/** Numeric parameter → URL key. `Record` makes the compiler enforce completeness. */
export const NUMERIC_URL_KEYS: Readonly<Record<NumericParamPath, string>> = {
  'core.length': 'rl',
  'core.diameter': 'cd',
  'core.stripBuildUp': 'sb',
  'tubes.innerOD': 'io',
  'tubes.outerOD': 'oo',
  'segments.innerHeight': 'ih',
  'segments.outerHeight': 'oh',
  'segments.wall': 'wt',
  'segments.overlap': 'ov',
  'segments.rimLeadIn': 'li',
  'segments.maxDeviation': 'md',
  'base.diameter': 'bd',
  'base.minHeight': 'bh',
  'base.topRound': 'br',
  'base.ringWall': 'rw',
  'base.footGap': 'fg',
  'base.collarWall': 'cw',
  'base.collarHeight': 'ch',
  'base.socketBelowTop': 'sd',
  'base.screwCount': 'sn',
  'base.screwDiameter': 'sw',
  'base.wireDiameter': 'wd',
  'base.intakeCount': 'ic',
  'base.intakeWidth': 'iw',
  'base.intakeHeight': 'ihh',
  'plate.od': 'pd',
  'plate.thickness': 'pt',
  'plate.bore': 'pb',
  'cover.plateThickness': 'ct',
  'cover.ringWall': 'cr',
  'cover.innerRingHeight': 'ir',
  'cover.bossWall': 'bw',
  'cover.bossHeight': 'bsh',
  'cover.bossHoleDepth': 'bhd',
  'cover.rodEndGap': 'eg',
  'cover.outerSlits': 'os',
  'cover.innerSlits': 'is',
  'cover.slitWidth': 'slw',
  'printer.bedX': 'px',
  'printer.bedY': 'py',
  'printer.bedZ': 'pz',
  'tolerances.segment': 'ts',
  'tolerances.core': 'tc',
  'tolerances.plateRadial': 'tpr',
  'tolerances.plateDepth': 'tpd',
};

/** PARAM_META entry + its URL key. Same order as PARAM_META (the display order). */
export interface ParamSpec extends ParamMeta {
  key: string;
}

export const PARAM_SPECS: readonly ParamSpec[] = PARAM_META.map((m) => ({ ...m, key: NUMERIC_URL_KEYS[m.path] }));
export const PARAM_SPEC_BY_PATH: ReadonlyMap<NumericParamPath, ParamSpec> = new Map(PARAM_SPECS.map((s) => [s.path, s]));
export const PARAM_SPEC_BY_KEY: ReadonlyMap<string, ParamSpec> = new Map(PARAM_SPECS.map((s) => [s.key, s]));

export interface EnumValueMap {
  'core.kind': CoreKind;
  'segments.heightMode': HeightMode;
  'base.wireRouting': WireRouting;
  'printer.preset': PrinterId;
}
export type EnumValue<P extends EnumParamPath> = EnumValueMap[P];

export interface EnumSpec<P extends EnumParamPath = EnumParamPath> {
  path: P;
  key: string;
  /** value → one URL code. */
  codes: Readonly<Record<EnumValue<P>, string>>;
}

export const ENUM_SPECS: { readonly [P in EnumParamPath]: EnumSpec<P> } = {
  'core.kind': { path: 'core.kind', key: 'cp', codes: { 'aluminium-rod': 'a', 'led-tube': 'l' } },
  'segments.heightMode': { path: 'segments.heightMode', key: 'hm', codes: { auto: 'f', locked: 'l' } },
  'base.wireRouting': {
    path: 'base.wireRouting',
    key: 'wr',
    codes: { auto: 'a', 'beside-collar': 'b', 'through-socket': 't' },
  },
  'printer.preset': {
    path: 'printer.preset',
    key: 'pp',
    codes: { 'bambu-256': 'b256', 'bambu-a1-mini': 'a1m', 'prusa-mk4': 'mk4', 'ender-3': 'e3', custom: 'cus' },
  },
};
export const ENUM_PATHS: readonly EnumParamPath[] = ['core.kind', 'segments.heightMode', 'base.wireRouting', 'printer.preset'];

/** Keys the codec uses for things other than params. */
export const CODEC_KEYS = { version: 'v', palette: 'pal', bandsInner: 'bi', bandsOuter: 'bo', genInner: 'gi', genOuter: 'go' } as const;

/** Every key the codec understands. */
export const ALL_URL_KEYS: readonly string[] = [
  ...Object.values(CODEC_KEYS),
  ...ENUM_PATHS.map((p) => ENUM_SPECS[p].key),
  ...PARAM_SPECS.map((s) => s.key),
];

/** Round to the field's precision (what the URL can represent). */
export function roundToPrecision(v: number, precision: number): number {
  const r = Number(v.toFixed(precision));
  return Object.is(r, -0) ? 0 : r;
}

/** Shortest decimal at the given precision: 1500 → "1500", 0.80 → "0.8". */
export function formatNumber(v: number, precision: number): string {
  return String(roundToPrecision(v, precision));
}
