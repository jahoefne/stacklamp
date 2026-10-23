/**
 * Share-link codec: LampConfig ⇄ `v=1&rl=1200&…` (the URL hash without '#').
 *
 * Format (v1). Sparse: only values that differ from their reference are written, so the
 * default lamp is exactly `v=1`. Keys are never renamed (see paramSpec.ts for the table).
 * - `v`            format version (CONFIG_VERSION).
 * - enum keys      `cp hm wr pp nz` with the one-word codes from ENUM_SPECS.
 * - numeric keys   shortest decimal at the field's precision. The reference for
 *                  `core.diameter` is the core preset's diameter, for `printer.bed*` the
 *                  printer preset's bed (so `pp=a1m` alone means a 180³ bed) and for
 *                  `segments.wall` the nozzle's vase line width (`nz=4` alone: 0.5 mm).
 * - `fi`, `fo`     body forms fitted to the band count, one FORMS code per band, bottom → top
 *                  (`s` straight, `d` drop, `b` ball, `w` waist, `r` barrel, `t` star,
 *                  `f` fluted, `x` twist). Written only when the stack has a form other than
 *                  straight, so a missing key is an all-straight stack. On decode the string
 *                  is stored as it is (it repeats over N like the bands); an unknown char reads
 *                  as straight.
 * - `pal`          only when the palette ≠ DEFAULT_PALETTE: `name~rrggbb,…` (names sanitised
 *                  to `[A-Za-z0-9 -]{1,20}`, space written as '+').
 * - `bi`, `bo`     fitted bands, one base-36 char per band = palette index, bottom → top.
 * - `gi`, `go`     generator spec: kind char (`a` alternate, `g` gradient, `r` random) +
 *                  palette-index chars + optional `m` (mirrored) + optional `.seed36`.
 *                  NOTE: `m` precedes the seed because `m` is itself a base-36 digit.
 *                  Written together with the bands; on decode a spec that does not
 *                  reproduce the bands is dropped (the bands win).
 *                  A stack whose bands + generator equal the default (with the default
 *                  palette) is omitted entirely.
 */
import {
  CORE_PRESETS,
  DEFAULT_FORM,
  FORMS,
  PRINTER_PRESETS,
  allStraight,
  defaultParams,
  deriveDims,
  fitForms,
  formByCode,
  getParam,
  nozzleOf,
  setParam,
} from '../geometry';
import type { FormId, LampParams, PetgColour } from '../geometry';
import { bandsEqual, fitBands } from './bands';
import { CONFIG_VERSION, DEFAULT_INNER_BANDS, STACKS, defaultGen } from './config';
import type { GeneratorKind, GeneratorSpec, LampConfig, Stack } from './config';
import { generateBands, normalizeSpec, specEquals } from './generators';
import {
  DEFAULT_PALETTE,
  FALLBACK_HEX,
  MAX_COLOURS,
  defaultPalette,
  isDefaultPalette,
  normalizeHex,
  sanitizeColourName,
} from './palette';
import { ALL_URL_KEYS, CODEC_KEYS, ENUM_PATHS, ENUM_SPECS, PARAM_SPECS, formatNumber, roundToPrecision } from './paramSpec';
import { getEnumParam, withEnumParam } from './paths';

/** Fitted band counts used to encode bands (DerivedDims.inner/outer.count). */
export interface BandCounts {
  nInner: number;
  nOuter: number;
}

export interface DecodeResult {
  config: LampConfig;
  /** Human-readable notes about anything that was ignored, clamped or guessed. */
  issues: string[];
  /** The version the link declared (after defaulting). */
  version: number;
}

/** Longest band (or form) string accepted from a link. */
export const MAX_ENCODED_BANDS = 128;

/**
 * Upgrades from version k to k + 1, applied in order to the raw URLSearchParams before
 * decoding. Empty while only v1 exists. Never rename keys: add a migration instead.
 */
export const migrations: Readonly<Record<number, (q: URLSearchParams, issues: string[]) => void>> = {};

const KIND_CODE: Record<GeneratorKind, string> = { alternate: 'a', gradient: 'g', random: 'r' };
const CODE_KIND: Record<string, GeneratorKind> = { a: 'alternate', g: 'gradient', r: 'random' };
const BAND_KEY: Record<Stack, string> = { inner: CODEC_KEYS.bandsInner, outer: CODEC_KEYS.bandsOuter };
const GEN_KEY: Record<Stack, string> = { inner: CODEC_KEYS.genInner, outer: CODEC_KEYS.genOuter };
const FORM_KEY: Record<Stack, string> = { inner: CODEC_KEYS.formsInner, outer: CODEC_KEYS.formsOuter };
const KNOWN_KEYS = new Set(ALL_URL_KEYS);

/** Band counts for params (via the barrel's deriveDims). */
export function countsFor(params: LampParams): BandCounts {
  const d = deriveDims(params);
  return { nInner: d.inner.count, nOuter: d.outer.count };
}

/**
 * Reference values for sparse numeric encoding: the defaults with `p`'s enum choices applied
 * and the values those choices imply (core preset diameter, printer preset bed, nozzle wall).
 */
export function referenceParams(p: LampParams): LampParams {
  let r = defaultParams();
  for (const path of ENUM_PATHS) r = withEnumParam(r, path, getEnumParam(p, path));
  return applyPresetImplied(r);
}

function applyPresetImplied(r: LampParams): LampParams {
  const core = CORE_PRESETS[r.core.kind];
  const out: LampParams = {
    ...r,
    core: { ...r.core, diameter: core.diameter },
    segments: { ...r.segments, wall: nozzleOf(r).wall },
  };
  if (r.printer.preset !== 'custom') {
    const [bedX, bedY, bedZ] = PRINTER_PRESETS[r.printer.preset].bed;
    out.printer = { ...r.printer, bedX, bedY, bedZ };
  }
  return out;
}

function defaultStoredBands(stack: Stack): readonly string[] {
  return stack === 'inner' ? DEFAULT_INNER_BANDS : [];
}

function encodeName(name: string, i: number): string {
  return sanitizeColourName(name, `Colour ${i + 1}`).replace(/ /g, '+');
}

function encodeGen(spec: GeneratorSpec, index: ReadonlyMap<string, number>): string {
  const s = normalizeSpec(spec);
  let out = KIND_CODE[s.kind];
  for (const id of s.colours) {
    const i = index.get(id);
    if (i !== undefined) out += i.toString(36);
  }
  if (s.mirrored) out += 'm';
  if (s.kind === 'random') out += `.${(s.seed ?? 0).toString(36)}`;
  return out;
}

/** Encode a config. `n` = the current fitted band counts. The default lamp encodes as `v=1`. */
export function encodeConfig(c: LampConfig, n: BandCounts): string {
  const parts: string[] = [`${CODEC_KEYS.version}=${CONFIG_VERSION}`];
  const p = c.params;
  const defaults = defaultParams();
  for (const path of ENUM_PATHS) {
    const v = getEnumParam(p, path);
    if (v !== getEnumParam(defaults, path)) {
      const spec = ENUM_SPECS[path];
      parts.push(`${spec.key}=${(spec.codes as Record<string, string>)[v]}`);
    }
  }
  const ref = referenceParams(p);
  for (const spec of PARAM_SPECS) {
    const v = formatNumber(getParam(p, spec.path), spec.precision);
    if (v !== formatNumber(getParam(ref, spec.path), spec.precision)) parts.push(`${spec.key}=${v}`);
  }
  for (const stack of STACKS) {
    const forms = fitForms(p.forms[stack], stack === 'inner' ? n.nInner : n.nOuter);
    if (!allStraight(forms)) parts.push(`${FORM_KEY[stack]}=${forms.map((f) => FORMS[f].code).join('')}`);
  }
  const paletteIsDefault = isDefaultPalette(c.palette);
  if (!paletteIsDefault) {
    const entries = c.palette.map((col, i) => `${encodeName(col.name, i)}~${(normalizeHex(col.hex) ?? FALLBACK_HEX).slice(1)}`);
    parts.push(`${CODEC_KEYS.palette}=${entries.join(',')}`);
  }
  const index = new Map(c.palette.map((col, i) => [col.id, i]));
  for (const stack of STACKS) {
    const count = stack === 'inner' ? n.nInner : n.nOuter;
    const rawGen = c.gen[stack];
    const gen = rawGen && rawGen.colours.length > 0 ? normalizeSpec(rawGen) : null;
    const fitted = fitBands(c.bands[stack], count, c.palette, gen);
    if (paletteIsDefault) {
      const dGen = defaultGen(stack);
      const dFitted = fitBands(defaultStoredBands(stack), count, DEFAULT_PALETTE, dGen);
      if (specEquals(gen, dGen) && bandsEqual(fitted, dFitted)) continue;
    }
    parts.push(`${BAND_KEY[stack]}=${fitted.map((id) => (index.get(id) ?? 0).toString(36)).join('')}`);
    if (gen) parts.push(`${GEN_KEY[stack]}=${encodeGen(gen, index)}`);
  }
  return parts.join('&');
}

/** Encode with counts derived from the config's own params. */
export function encodeConfigAuto(c: LampConfig): string {
  return encodeConfig(c, countsFor(c.params));
}

function fmtRange(min: number, max: number, unit: string): string {
  return `${min}–${max}${unit === 'mm' ? ' mm' : ''}`;
}

function decodePalette(raw: string, issues: string[]): PetgColour[] {
  let entries = raw.split(',').filter((e) => e.length > 0);
  if (entries.length === 0) {
    issues.push('Ignored an empty colour palette.');
    return defaultPalette();
  }
  if (entries.length > MAX_COLOURS) {
    issues.push(`The palette had ${entries.length} colours; kept the first ${MAX_COLOURS}.`);
    entries = entries.slice(0, MAX_COLOURS);
  }
  const palette: PetgColour[] = [];
  const usedDefaults = new Set<string>();
  let customId = 0;
  entries.forEach((entry, i) => {
    const t = entry.lastIndexOf('~');
    const rawName = t >= 0 ? entry.slice(0, t) : entry;
    const rawHex = t >= 0 ? entry.slice(t + 1) : '';
    const name = sanitizeColourName(rawName, `Colour ${i + 1}`);
    let hex = normalizeHex(rawHex);
    if (!hex) {
      issues.push(`Colour “${name}” had an invalid hex value; using grey.`);
      hex = FALLBACK_HEX;
    }
    const def = DEFAULT_PALETTE.find((d) => d.name === name && d.hex === hex && !usedDefaults.has(d.id));
    if (def) usedDefaults.add(def.id);
    palette.push({ id: def ? def.id : `c${++customId}`, name, hex });
  });
  return palette;
}

function decodeBands(raw: string, palette: readonly PetgColour[], stack: Stack, issues: string[]): string[] {
  let s = raw;
  if (s.length > MAX_ENCODED_BANDS) {
    issues.push(`The ${stack} colour bands were too long; kept the first ${MAX_ENCODED_BANDS}.`);
    s = s.slice(0, MAX_ENCODED_BANDS);
  }
  let bad = false;
  const out = [...s].map((ch) => {
    const i = /^[0-9a-z]$/i.test(ch) ? parseInt(ch, 36) : NaN;
    if (Number.isInteger(i) && i >= 0 && i < palette.length) return palette[i]!.id;
    bad = true;
    return palette[0]!.id;
  });
  if (bad) issues.push(`Some ${stack} bands referred to unknown colours; painted them ${palette[0]!.name}.`);
  return out;
}

function decodeForms(raw: string, stack: Stack, issues: string[]): FormId[] {
  let s = raw;
  if (s.length > MAX_ENCODED_BANDS) {
    issues.push(`The ${stack} forms were too long; kept the first ${MAX_ENCODED_BANDS}.`);
    s = s.slice(0, MAX_ENCODED_BANDS);
  }
  let bad = false;
  const out = [...s].map((ch) => {
    const form = formByCode(ch);
    if (form) return form;
    bad = true;
    return DEFAULT_FORM;
  });
  if (bad) issues.push(`Some ${stack} forms were unknown; read them as straight.`);
  return out;
}

function decodeGen(raw: string, palette: readonly PetgColour[]): GeneratorSpec | null {
  const m = /^([agr])([0-9a-fA-F]*)(m?)(?:\.([0-9a-zA-Z]{1,8}))?$/.exec(raw);
  if (!m) return null;
  const kind = CODE_KIND[m[1]!]!;
  const colours: string[] = [];
  for (const ch of m[2]!) {
    const i = parseInt(ch, 36);
    if (!(i < palette.length)) return null;
    colours.push(palette[i]!.id);
  }
  if (colours.length === 0) return null;
  const spec: GeneratorSpec = { kind, colours };
  if (kind === 'random') spec.seed = m[4] ? parseInt(m[4], 36) : 0;
  if (m[3]) spec.mirrored = true;
  return normalizeSpec(spec);
}

/**
 * Decode a hash (with or without the leading '#'). Returns null when the string carries no
 * stacklamp key at all (e.g. an in-page anchor like `#main`). Never throws.
 */
export function decodeConfig(hash: string): DecodeResult | null {
  let raw = hash.trim();
  if (raw.startsWith('#')) raw = raw.slice(1);
  if (raw.startsWith('?')) raw = raw.slice(1);
  if (raw.length === 0) return null;
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(raw);
  } catch {
    return null;
  }
  if (![...q.keys()].some((k) => KNOWN_KEYS.has(k))) return null;

  const issues: string[] = [];
  let version = CONFIG_VERSION;
  const vRaw = q.get(CODEC_KEYS.version);
  if (vRaw === null) {
    issues.push(`The link has no version; read it as version ${CONFIG_VERSION}.`);
  } else {
    const v = Number(vRaw);
    if (!Number.isInteger(v) || v < 1) issues.push(`Unknown link version “${vRaw}”; read it as version ${CONFIG_VERSION}.`);
    else version = v;
  }
  if (version > CONFIG_VERSION)
    issues.push(`This link was made by a newer stacklamp (v${version}); settings this version does not know were skipped.`);
  for (let k = version; k < CONFIG_VERSION; k++) migrations[k]?.(q, issues);

  // Enums first: they set the reference values of preset-relative numbers.
  let params = defaultParams();
  for (const path of ENUM_PATHS) {
    const spec = ENUM_SPECS[path];
    const code = q.get(spec.key);
    if (code === null) continue;
    const entry = Object.entries(spec.codes as Record<string, string>).find(([, c]) => c === code);
    if (entry) params = withEnumParam(params, path, entry[0] as never);
    else issues.push(`Ignored unknown value “${code}” for ${path}.`);
  }
  params = applyPresetImplied(params);
  for (const spec of PARAM_SPECS) {
    const rawV = q.get(spec.key);
    if (rawV === null) continue;
    const num = rawV.trim() === '' ? NaN : Number(rawV);
    if (!Number.isFinite(num)) {
      issues.push(`Ignored invalid ${spec.label.toLowerCase()} “${rawV}”.`);
      continue;
    }
    let v = roundToPrecision(num, spec.precision);
    if (v < spec.min || v > spec.max) {
      const clamped = Math.min(spec.max, Math.max(spec.min, v));
      issues.push(`${spec.label} ${rawV} is outside ${fmtRange(spec.min, spec.max, spec.unit)}; using ${clamped}.`);
      v = clamped;
    }
    params = setParam(params, spec.path, v);
  }
  const forms: Record<Stack, FormId[]> = { inner: [], outer: [] };
  for (const stack of STACKS) {
    const fRaw = q.get(FORM_KEY[stack]);
    if (fRaw !== null) forms[stack] = decodeForms(fRaw, stack, issues);
  }
  params = { ...params, forms };

  const palRaw = q.get(CODEC_KEYS.palette);
  const palette = palRaw === null ? defaultPalette() : decodePalette(palRaw, issues);

  const bands: Record<Stack, string[]> = { inner: [], outer: [] };
  const gen: Record<Stack, GeneratorSpec | null> = { inner: null, outer: null };
  for (const stack of STACKS) {
    const bRaw = q.get(BAND_KEY[stack]);
    const gRaw = q.get(GEN_KEY[stack]);
    let spec: GeneratorSpec | null = null;
    if (gRaw !== null) {
      spec = decodeGen(gRaw, palette);
      if (!spec) issues.push(`Ignored an invalid colour generator for the ${stack} stack.`);
    }
    if (bRaw === null) {
      if (spec) {
        gen[stack] = spec;
        bands[stack] = [];
      } else {
        gen[stack] = defaultGen(stack);
        bands[stack] = [...defaultStoredBands(stack)];
      }
      continue;
    }
    bands[stack] = decodeBands(bRaw, palette, stack, issues);
    if (spec) {
      if (bandsEqual(generateBands(spec, bands[stack].length), bands[stack])) gen[stack] = spec;
      else issues.push(`The ${stack} colour generator did not match its bands; kept the bands.`);
    }
  }

  return { config: { params, palette, bands, gen }, issues, version };
}
