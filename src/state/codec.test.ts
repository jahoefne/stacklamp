import { describe, expect, it } from 'vitest';
import { FORMS, FORM_IDS, PRINTER_PRESETS, defaultParams, fitForms, getParam, setParam } from '../geometry';
import type { FormId, LampParams, PetgColour } from '../geometry';
import { fitBands } from './bands';
import { MAX_ENCODED_BANDS, countsFor, decodeConfig, encodeConfig, encodeConfigAuto } from './codec';
import { GENERATOR_KINDS, STACKS, defaultConfig } from './config';
import type { GeneratorSpec, LampConfig, Stack } from './config';
import { generateBands, mulberry32, normalizeSpec } from './generators';
import { DEFAULT_PALETTE, MAX_COLOURS, defaultPalette, sanitizeColourName } from './palette';
import { ENUM_PATHS, PARAM_SPECS, roundToPrecision } from './paramSpec';
import { enumValues, withEnumParam } from './paths';

const decodeOk = (code: string) => {
  const r = decodeConfig(code);
  if (!r) throw new Error(`decode returned null for ${code}`);
  return r;
};

/**
 * Fitted bands as palette indices + generator specs as palette indices + forms fitted to N:
 * the id-independent, N-independent view of what a link means.
 */
function semantic(c: LampConfig) {
  const n = countsFor(c.params);
  const idx = (id: string) => c.palette.findIndex((p) => p.id === id);
  const gen = (g: GeneratorSpec | null) =>
    g && g.colours.length ? { ...normalizeSpec(g), colours: normalizeSpec(g).colours.map(idx) } : null;
  return {
    params: { ...c.params, forms: { inner: fitForms(c.params.forms.inner, n.nInner), outer: fitForms(c.params.forms.outer, n.nOuter) } },
    palette: c.palette.map((p) => [p.name, p.hex]),
    inner: fitBands(c.bands.inner, n.nInner, c.palette, c.gen.inner).map(idx),
    outer: fitBands(c.bands.outer, n.nOuter, c.palette, c.gen.outer).map(idx),
    gen: { inner: gen(c.gen.inner), outer: gen(c.gen.outer) },
  };
}

describe('encodeConfig', () => {
  it('encodes the default lamp as v=1', () => {
    expect(encodeConfigAuto(defaultConfig())).toBe('v=1');
  });
  it('writes only non-default values, numbers as shortest decimals', () => {
    const c = defaultConfig();
    c.params = setParam(setParam(c.params, 'core.length', 1200), 'segments.wall', 0.85);
    expect(encodeConfigAuto(c)).toBe('v=1&rl=1200&wt=0.85');
  });
  it('treats preset-implied values as defaults (core diameter, printer bed)', () => {
    const c = defaultConfig();
    c.params = { ...c.params, core: { ...c.params.core, kind: 'led-tube', diameter: 28 } };
    expect(encodeConfigAuto(c)).toBe('v=1&cp=l');
    const [bedX, bedY, bedZ] = PRINTER_PRESETS['bambu-a1-mini'].bed;
    c.params = { ...c.params, printer: { ...c.params.printer, preset: 'bambu-a1-mini', bedX, bedY, bedZ } };
    expect(encodeConfigAuto(c)).toBe('v=1&cp=l&pp=a1m');
    expect(decodeOk('v=1&cp=l&pp=a1m').config.params).toEqual(c.params);
    // a non-preset diameter is written
    c.params = setParam(c.params, 'core.diameter', 20);
    expect(encodeConfigAuto(c)).toContain('cd=20');
  });
  it('treats the nozzle wall as the default: nz alone sets segments.wall', () => {
    const c = defaultConfig();
    c.params = { ...c.params, printer: { ...c.params.printer, nozzle: '0.4' }, segments: { ...c.params.segments, wall: 0.5 } };
    expect(encodeConfigAuto(c)).toBe('v=1&nz=4');
    expect(decodeOk('v=1&nz=4').config.params).toEqual(c.params);
    // a wall of your own is written and wins
    c.params = setParam(c.params, 'segments.wall', 0.6);
    expect(encodeConfigAuto(c)).toBe('v=1&nz=4&wt=0.6');
    expect(decodeOk('v=1&nz=4&wt=0.6').config.params.segments.wall).toBe(0.6);
    // links from before the nozzle key are the 0.6 mm nozzle with the wall they carry
    expect(decodeOk('v=1&wt=0.6').config.params.printer.nozzle).toBe('0.6');
    expect(decodeOk('v=1&wt=0.6').config.params.segments.wall).toBe(0.6);
    expect(decodeConfig('v=1&nz=9')!.config.params.printer.nozzle).toBe('0.6');
  });
  it('writes painted bands and generators as palette-index chars', () => {
    const c = defaultConfig();
    c.gen.outer = { kind: 'random', colours: ['red', 'blu', 'grn'], seed: 1234, mirrored: true };
    c.bands.inner = ['red', 'clr'];
    const code = encodeConfig(c, { nInner: 4, nOuter: 5 });
    expect(code).toContain('bi=4040');
    expect(code).toContain(`go=r468m.${(1234).toString(36)}`);
    const out = generateBands(c.gen.outer, 5).map((id) => DEFAULT_PALETTE.findIndex((p) => p.id === id).toString(36));
    expect(code).toContain(`bo=${out.join('')}`);
  });
});

describe('decodeConfig', () => {
  it('v=1 decodes to the default config without issues', () => {
    const r = decodeOk('#v=1');
    const d = defaultConfig();
    expect(r.issues).toEqual([]);
    expect(r.config.params).toEqual(d.params);
    expect(r.config.palette).toEqual(d.palette);
    expect(r.config.gen).toEqual(d.gen);
    expect(semantic(r.config)).toEqual(semantic(d));
  });
  it('returns null for empty hashes and non-lamp anchors', () => {
    expect(decodeConfig('')).toBeNull();
    expect(decodeConfig('#')).toBeNull();
    expect(decodeConfig('#main')).toBeNull();
    expect(decodeConfig('foo=1&bar=2')).toBeNull();
  });
  it('reads a link without v as v1, with an issue', () => {
    const r = decodeOk('rl=1200');
    expect(r.config.params.core.length).toBe(1200);
    expect(r.issues.join(' ')).toMatch(/version/);
    expect(r.version).toBe(1);
  });
  it('ignores unknown keys silently', () => {
    const r = decodeOk('v=1&zz=3&rl=1200&utm_source=x');
    expect(r.issues).toEqual([]);
    expect(r.config.params.core.length).toBe(1200);
  });
  it('ignores invalid numbers and clamps out-of-range ones, with issues', () => {
    const r = decodeOk('v=1&rl=abc&oo=9999&wt=0.833&sn=&ic=-3');
    expect(r.config.params.core.length).toBe(1500);
    expect(r.config.params.tubes.outerOD).toBe(260);
    expect(r.config.params.segments.wall).toBe(0.83);
    expect(r.config.params.base.screwCount).toBe(3);
    expect(r.config.params.base.intakeCount).toBe(0);
    expect(r.issues).toHaveLength(4);
  });
  it('ignores unknown enum codes with an issue', () => {
    const r = decodeOk('v=1&cp=x&hm=l&pp=zzz');
    expect(r.config.params.core.kind).toBe('aluminium-rod');
    expect(r.config.params.segments.heightMode).toBe('locked');
    expect(r.config.params.printer.preset).toBe('bambu-256');
    expect(r.issues).toHaveLength(2);
  });
  it('decodes a newer version best-effort with an issue', () => {
    const r = decodeOk('v=7&rl=1100&new=thing');
    expect(r.version).toBe(7);
    expect(r.config.params.core.length).toBe(1100);
    expect(r.issues.join(' ')).toMatch(/newer/);
  });
  it('flags a garbage version', () => {
    const r = decodeOk('v=abc&rl=1100');
    expect(r.version).toBe(1);
    expect(r.issues).toHaveLength(1);
  });

  it('decodes a custom palette with odd names, keeping default ids for unchanged defaults', () => {
    const palette: PetgColour[] = [
      { id: 'clr', name: 'Clear', hex: '#fff4dc' },
      { id: 'c1', name: 'Ünïcode~,&=#+ Glow!', hex: '#123abc' },
      { id: 'c2', name: '   ', hex: '#000000' },
      { id: 'c3', name: 'A very very long colour name indeed', hex: '#ABCDEF' },
      { id: 'red', name: 'Red', hex: '#ff0000' },
      { id: 'c4', name: 'two  spaces - dash', hex: '#010203' },
    ];
    const c: LampConfig = { ...defaultConfig(), palette, bands: { inner: ['c1', 'c3'], outer: ['red', 'c4', 'clr'] }, gen: { inner: null, outer: null } };
    const code = encodeConfigAuto(c);
    expect(code).toMatch(/pal=Clear~fff4dc,ncode\+Glow~123abc,Colour\+3~000000,/);
    const r = decodeOk(code);
    expect(r.issues).toEqual([]);
    expect(r.config.palette.map((p) => p.name)).toEqual([
      'Clear',
      'ncode Glow',
      'Colour 3',
      'A very very long col',
      'Red',
      'two spaces - dash',
    ]);
    expect(r.config.palette.map((p) => p.hex)).toEqual(['#fff4dc', '#123abc', '#000000', '#abcdef', '#ff0000', '#010203']);
    // Clear matches the default by name + hex → keeps 'clr'; Red has a different hex → custom id
    expect(r.config.palette[0]!.id).toBe('clr');
    expect(r.config.palette[4]!.id).not.toBe('red');
    expect(new Set(r.config.palette.map((p) => p.id)).size).toBe(palette.length);
    expect(semantic(r.config).inner).toEqual(semantic(c).inner);
    expect(semantic(r.config).outer).toEqual(semantic(c).outer);
    expect(encodeConfigAuto(r.config)).toBe(code);
  });
  it('repairs bad palette entries and caps the palette at 16', () => {
    const many = Array.from({ length: 20 }, (_, i) => `C${i}~${i.toString(16).padStart(6, '0')}`).join(',');
    const r = decodeOk(`v=1&pal=${many}`);
    expect(r.config.palette).toHaveLength(MAX_COLOURS);
    expect(r.issues).toHaveLength(1);
    const bad = decodeOk('v=1&pal=Ok~zzzzzz,NoHex');
    expect(bad.config.palette.map((p) => p.hex)).toEqual(['#6b625a', '#6b625a']);
    expect(bad.issues).toHaveLength(2);
    const empty = decodeOk('v=1&pal=');
    expect(empty.config.palette).toEqual(defaultPalette());
  });

  it('keeps band strings shorter or longer than N as stored patterns', () => {
    const short = decodeOk('v=1&bo=24');
    expect(short.config.bands.outer).toEqual(['amb', 'red']);
    expect(short.config.gen.outer).toBeNull();
    const n = countsFor(short.config.params).nOuter;
    expect(fitBands(short.config.bands.outer, n, short.config.palette, null)).toEqual(
      Array.from({ length: n }, (_, i) => (i % 2 ? 'red' : 'amb')),
    );
    const longStr = '0123456789'.repeat(3);
    const long = decodeOk(`v=1&bi=${longStr}`);
    expect(long.config.bands.inner).toHaveLength(30);
    expect(fitBands(long.config.bands.inner, 11, long.config.palette, null)).toEqual(
      [...longStr.slice(0, 11)].map((ch) => DEFAULT_PALETTE[Number(ch) % 9]!.id).map((id, i) => (longStr[i] === '9' ? 'clr' : id)),
    );
    expect(long.issues).toHaveLength(1); // '9' is out of the 9-colour palette
  });
  it('maps invalid band chars to palette[0] with an issue and caps very long strings', () => {
    const r = decodeOk('v=1&bo=2z!4');
    expect(r.config.bands.outer).toEqual(['amb', 'clr', 'clr', 'red']);
    expect(r.issues).toHaveLength(1);
    const huge = decodeOk(`v=1&bo=${'1'.repeat(500)}`);
    expect(huge.config.bands.outer).toHaveLength(128);
  });
  it('keeps a generator that reproduces the bands and drops one that does not', () => {
    const spec: GeneratorSpec = { kind: 'alternate', colours: ['red', 'blu'] };
    const ok = decodeOk('v=1&bo=46464&go=a46');
    expect(ok.config.gen.outer).toEqual(spec);
    expect(ok.issues).toEqual([]);
    const bad = decodeOk('v=1&bo=44444&go=a46');
    expect(bad.config.gen.outer).toBeNull();
    expect(bad.config.bands.outer).toEqual(['red', 'red', 'red', 'red', 'red']);
    expect(bad.issues).toHaveLength(1);
  });
  it('accepts a generator without bands and rejects malformed generators', () => {
    const r = decodeOk('v=1&gi=g678');
    expect(r.config.gen.inner).toEqual({ kind: 'gradient', colours: ['blu', 'tea', 'grn'] });
    expect(r.config.bands.inner).toEqual([]);
    for (const g of ['x12', 'g', 'gz', 'g9', 'r12.', 'g12mm']) {
      const bad = decodeOk(`v=1&gi=${g}`);
      expect(bad.config.gen.inner, g).toBeNull();
      expect(bad.issues, g).toHaveLength(1);
    }
  });
  it('parses mirrored + seeded generators (m before the seed)', () => {
    const spec: GeneratorSpec = { kind: 'random', colours: ['amb', 'red', 'vio'], seed: 36 * 22 + 5, mirrored: true };
    const bands = generateBands(spec, 9).map((id) => DEFAULT_PALETTE.findIndex((p) => p.id === id)).join('');
    const r = decodeOk(`v=1&bo=${bands}&go=r245m.${spec.seed!.toString(36)}`);
    expect(r.config.gen.outer).toEqual(spec);
    expect(r.issues).toEqual([]);
  });
});

describe('segment forms (fi / fo)', () => {
  const withForms = (inner: FormId[], outer: FormId[]): LampConfig => {
    const c = defaultConfig();
    c.params = { ...c.params, forms: { inner, outer } };
    return c;
  };
  it('the default lamp has no forms and still encodes as v=1', () => {
    const r = decodeOk('v=1');
    expect(r.config.params.forms).toEqual({ inner: [], outer: [] });
    expect(encodeConfigAuto(withForms(['straight', 'straight'], ['straight']))).toBe('v=1');
  });
  it('writes the forms fitted to N, one code per band, only for a stack that has a form', () => {
    const c = withForms(['ball', 'straight'], []);
    expect(encodeConfig(c, { nInner: 5, nOuter: 4 })).toBe('v=1&fi=bsbsb');
    // longer lists are truncated to N, after the numeric params
    c.params = setParam(c.params, 'tubes.outerFormOD', 230);
    c.params.forms.outer = ['drop', 'waist', 'barrel', 'star', 'flute', 'twist', 'straight'];
    expect(encodeConfig(c, { nInner: 5, nOuter: 4 })).toBe('v=1&ofd=230&fi=bsbsb&fo=dwrt');
  });
  it('every form code round-trips and the codes are unique single characters', () => {
    const codes = FORM_IDS.map((id) => FORMS[id].code);
    expect(new Set(codes).size).toBe(FORM_IDS.length);
    for (const code of codes) expect(code).toMatch(/^[a-z]$/);
    const r = decodeOk(`v=1&fi=${codes.join('')}&fo=${[...codes].reverse().join('')}`);
    expect(r.issues).toEqual([]);
    expect(r.config.params.forms).toEqual({ inner: [...FORM_IDS], outer: [...FORM_IDS].reverse() });
  });
  it('stores the decoded list as it is and re-encodes it fitted to N', () => {
    const r = decodeOk('v=1&fi=bsw&fo=x');
    expect(r.issues).toEqual([]);
    expect(r.config.params.forms).toEqual({ inner: ['ball', 'straight', 'waist'], outer: ['twist'] });
    const n = countsFor(r.config.params);
    const fi = fitForms(r.config.params.forms.inner, n.nInner).map((f) => FORMS[f].code).join('');
    expect(fi).toMatch(/^(bsw)+(b|bs)?$/);
    expect(encodeConfigAuto(r.config)).toBe(`v=1&fi=${fi}&fo=${'x'.repeat(n.nOuter)}`);
    // an all-straight string is kept as stored but needs no key
    const straight = decodeOk('v=1&fo=sss');
    expect(straight.config.params.forms.outer).toEqual(['straight', 'straight', 'straight']);
    expect(encodeConfigAuto(straight.config)).toBe('v=1');
    expect(decodeOk('v=1&fi=').config.params.forms.inner).toEqual([]);
  });
  it('reads unknown form codes as straight, with one issue per stack', () => {
    const r = decodeOk('v=1&fi=b?Bq&fo=d9');
    expect(r.config.params.forms).toEqual({ inner: ['ball', 'straight', 'straight', 'straight'], outer: ['drop', 'straight'] });
    expect(r.issues).toEqual(['Some inner forms were unknown; read them as straight.', 'Some outer forms were unknown; read them as straight.']);
  });
  it('caps very long form strings like the bands', () => {
    const r = decodeOk(`v=1&fo=${'dw'.repeat(300)}`);
    expect(r.config.params.forms.outer).toHaveLength(MAX_ENCODED_BANDS);
    expect(r.config.params.forms.outer.slice(0, 3)).toEqual(['drop', 'waist', 'drop']);
    expect(r.issues).toEqual([`The outer forms were too long; kept the first ${MAX_ENCODED_BANDS}.`]);
  });
  it('a link with fi but no fo leaves the outer stack straight', () => {
    const r = decodeOk('v=1&fi=t');
    expect(r.issues).toEqual([]);
    expect(r.config.params.forms).toEqual({ inner: ['star'], outer: [] });
    // fi is a stacklamp key on its own (read as v1, with the version issue)
    const bare = decodeOk('fi=t');
    expect(bare.config.params.forms.inner).toEqual(['star']);
    expect(bare.issues).toHaveLength(1);
  });
});

// ---- 200 random configs round-trip ------------------------------------------------

function pick<T>(rand: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)]!;
}

function randomParams(rand: () => number): LampParams {
  let p = defaultParams();
  for (const path of ENUM_PATHS) if (rand() < 0.4) p = withEnumParam(p, path, pick(rand, enumValues(path)) as never);
  for (const s of PARAM_SPECS) {
    if (rand() < 0.5) continue;
    const steps = Math.round((s.max - s.min) / s.step);
    const v = Math.min(s.max, s.min + s.step * Math.floor(rand() * (steps + 1)));
    p = setParam(p, s.path, roundToPrecision(v, s.precision));
  }
  return p;
}

const NAME_CHARS = 'abcXYZ019 -_~,&=#+%ü!.';
function randomPalette(rand: () => number): PetgColour[] {
  if (rand() < 0.5) return defaultPalette();
  let pal = defaultPalette().filter(() => rand() < 0.8);
  pal = pal.map((c) => (rand() < 0.2 ? { ...c, hex: `#${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}` } : c));
  let k = 1;
  while (pal.length < MAX_COLOURS && rand() < 0.5) {
    const name = Array.from({ length: 1 + Math.floor(rand() * 25) }, () => pick(rand, [...NAME_CHARS])).join('');
    pal.push({ id: `c${k++}`, name, hex: `#${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}` });
  }
  if (pal.length === 0) pal.push({ id: 'c99', name: 'Only', hex: '#123456' });
  return pal;
}

function randomStack(rand: () => number, palette: PetgColour[]): { bands: string[]; gen: GeneratorSpec | null } {
  const ids = palette.map((c) => c.id);
  if (rand() < 0.5) {
    const colours = ids.filter(() => rand() < 0.4);
    if (colours.length === 0) colours.push(ids[0]!);
    const kind = pick(rand, GENERATOR_KINDS);
    const spec: GeneratorSpec = { kind, colours };
    if (kind === 'random') spec.seed = Math.floor(rand() * 36 ** 4);
    if (rand() < 0.3) spec.mirrored = true;
    return { bands: [], gen: spec };
  }
  return { bands: Array.from({ length: Math.floor(rand() * 30) }, () => pick(rand, ids)), gen: null };
}

/** Stored forms: none, exactly N (round-trips verbatim) or a pattern of any length. */
function randomForms(rand: () => number, n: number): FormId[] {
  const r = rand();
  if (r < 0.35) return [];
  const length = r < 0.7 ? n : 1 + Math.floor(rand() * 20);
  return Array.from({ length }, () => (rand() < 0.4 ? 'straight' : pick(rand, FORM_IDS)));
}

function randomConfig(rand: () => number): LampConfig {
  let params = randomParams(rand);
  const n = countsFor(params);
  params = { ...params, forms: { inner: randomForms(rand, n.nInner), outer: randomForms(rand, n.nOuter) } };
  const palette = randomPalette(rand);
  const s: Record<Stack, ReturnType<typeof randomStack>> = { inner: randomStack(rand, palette), outer: randomStack(rand, palette) };
  if (rand() < 0.15) return { ...defaultConfig(), params };
  return { params, palette, bands: { inner: s.inner.bands, outer: s.outer.bands }, gen: { inner: s.inner.gen, outer: s.outer.gen } };
}

describe('round-trip', () => {
  it('200 random configs survive encode → decode → encode', () => {
    const rand = mulberry32(20261022);
    for (let t = 0; t < 200; t++) {
      const c = randomConfig(rand);
      const code = encodeConfigAuto(c);
      const r = decodeOk(code);
      expect(r.issues, code).toEqual([]);
      const want = semantic(c);
      want.palette = c.palette.map((p, i) => [sanitizeColourName(p.name, `Colour ${i + 1}`), p.hex]);
      expect(semantic(r.config), code).toEqual(want);
      expect(encodeConfigAuto(r.config), code).toBe(code);
      for (const stack of STACKS) expect(!!r.config.gen[stack], `${code} ${stack}`).toBe(!!c.gen[stack]);
      // a stored list of exactly N with a form in it comes back verbatim
      const n = countsFor(c.params);
      for (const stack of STACKS) {
        const stored = c.params.forms[stack];
        if (stored.length === (stack === 'inner' ? n.nInner : n.nOuter) && stored.some((f) => f !== 'straight'))
          expect(r.config.params.forms[stack], `${code} ${stack}`).toEqual(stored);
      }
    }
  });
  it('every param round-trips at its precision', () => {
    for (const s of PARAM_SPECS) {
      for (const v of [s.min, s.max, roundToPrecision((s.min + s.max) / 2, s.precision)]) {
        const c = defaultConfig();
        c.params = setParam(c.params, s.path, v);
        const r = decodeOk(encodeConfigAuto(c));
        expect(getParam(r.config.params, s.path), `${s.path}=${v}`).toBe(v);
      }
    }
  });
});
