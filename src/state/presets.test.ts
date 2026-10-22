import { describe, expect, it } from 'vitest';
import { deriveDims } from '../geometry';
import { decodeConfig, encodeConfigAuto } from './codec';
import { BUILTIN_PRESETS, cleanPresetName, findPreset, parseSavedPresets, upsertPreset } from './presets';

describe('built-in presets', () => {
  it('have unique ids and names; classic-1500 is the default lamp', () => {
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_PRESETS.length);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.name)).size).toBe(BUILTIN_PRESETS.length);
    expect(BUILTIN_PRESETS.map((p) => p.id)).toEqual(['classic-1500', 'a1-mini-compact', 'led-tube-28', 'tall-2000']);
    expect(BUILTIN_PRESETS[0]!.code).toBe('v=1');
  });
  for (const preset of BUILTIN_PRESETS) {
    it(`${preset.id} decodes without issues and derives with ok === true`, () => {
      const r = decodeConfig(preset.code);
      expect(r).not.toBeNull();
      expect(r!.issues).toEqual([]);
      const dims = deriveDims(r!.config.params);
      expect(dims.messages.filter((m) => m.severity === 'error')).toEqual([]);
      expect(dims.ok).toBe(true);
      // stable: re-encoding and decoding gives the same lamp
      const again = decodeConfig(encodeConfigAuto(r!.config))!;
      expect(again.issues).toEqual([]);
      expect(encodeConfigAuto(again.config)).toBe(encodeConfigAuto(r!.config));
    });
  }
  it('a1-mini-compact fits the 180 mm printer', () => {
    const p = decodeConfig(BUILTIN_PRESETS[1]!.code)!.config.params;
    expect(p.printer).toEqual({ preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 });
    const fit = deriveDims(p).fit;
    for (const id of ['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp'] as const) expect(fit[id].fitsBed && fit[id].fitsZ, id).toBe(true);
  });
  it('led-tube-28 uses the LED tube core and a generator', () => {
    const c = decodeConfig(BUILTIN_PRESETS[2]!.code)!.config;
    expect(c.params.core).toMatchObject({ kind: 'led-tube', diameter: 28, length: 1200 });
    expect(c.gen.outer).toEqual({ kind: 'gradient', colours: ['blu', 'tea', 'grn'] });
    expect(c.params.cover.innerSlits).toBe(0);
  });
});

describe('saved presets', () => {
  it('parses defensively (bad entries dropped, first name wins)', () => {
    expect(parseSavedPresets(null)).toEqual([]);
    expect(parseSavedPresets({})).toEqual([]);
    expect(
      parseSavedPresets([
        { name: ' A ', code: 'v=1', savedAt: 't1' },
        { name: 'A', code: 'v=1&rl=900', savedAt: 't2' },
        { name: '', code: 'v=1' },
        { name: 'B', code: 3 },
        'junk',
        { name: 'C', code: 'v=1&rl=1000' },
      ]),
    ).toEqual([
      { name: 'A', code: 'v=1', savedAt: 't1' },
      { name: 'C', code: 'v=1&rl=1000', savedAt: '' },
    ]);
  });
  it('upsert replaces by name in place', () => {
    const list = [
      { name: 'A', code: 'v=1', savedAt: '1' },
      { name: 'B', code: 'v=1', savedAt: '1' },
    ];
    expect(upsertPreset(list, { name: 'A', code: 'v=1&rl=900', savedAt: '2' }).map((p) => p.code)).toEqual(['v=1&rl=900', 'v=1']);
    expect(upsertPreset(list, { name: 'C', code: 'v=1', savedAt: '2' })).toHaveLength(3);
  });
  it('lookup order: built-in id, saved name, built-in name', () => {
    const saved = [{ name: 'Tall 2000', code: 'v=1&rl=1999', savedAt: '' }];
    expect(findPreset('tall-2000', saved)?.code).toBe(BUILTIN_PRESETS[3]!.code);
    expect(findPreset('Tall 2000', saved)?.code).toBe('v=1&rl=1999');
    expect(findPreset('Classic 1500', saved)?.code).toBe('v=1');
    expect(findPreset('none', saved)).toBeNull();
    expect(cleanPresetName(`  a  b ${'x'.repeat(60)}`)).toHaveLength(40);
  });
});
