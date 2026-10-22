import { describe, expect, it } from 'vitest';
import {
  BandMaterials,
  CLEAR_GLOW_STRENGTH,
  GLOW_GAIN,
  glowFor,
  resolveColour,
  SHEEN_OPACITY,
  SMOKE_GLOW_STRENGTH,
} from './materials';
import { FRAME_BUDGET_MS, FrameSampler, initialTier, median, SAMPLE_WINDOW, tierSettings } from './quality';
import { cssColourToHex } from './stageTokens';
import { hexToLinear, inverseToneMap, linearToHex, toneMapColour, type ToneMap } from './tonemap';

describe('adaptive quality', () => {
  it('median', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('drops only after a full window of slow frames', () => {
    const s = new FrameSampler();
    for (let i = 0; i < SAMPLE_WINDOW - 1; i++) expect(s.push(40)).toBe(false);
    expect(s.push(40)).toBe(true);
  });

  it('ignores a few slow outliers and stalls', () => {
    const s = new FrameSampler();
    let dropped = false;
    for (let i = 0; i < 60; i++) dropped = s.push(i % 5 === 0 ? 120 : 16.7) || dropped;
    dropped = s.push(5000) || dropped; // tab switch
    expect(dropped).toBe(false);
    expect(s.count).toBe(SAMPLE_WINDOW);
  });

  it('uses a 28 ms budget', () => {
    const s = new FrameSampler();
    let r = false;
    for (let i = 0; i < SAMPLE_WINDOW; i++) r = s.push(FRAME_BUDGET_MS);
    expect(r).toBe(false);
  });

  it('picks tiers', () => {
    expect(initialTier('on', { coarsePointer: true, cores: 2 })).toBe('high');
    expect(initialTier('off', { coarsePointer: false })).toBe('low');
    expect(initialTier('auto', { coarsePointer: false, cores: 2 })).toBe('high');
    expect(initialTier('auto', { coarsePointer: true, cores: 4 })).toBe('low');
    expect(initialTier('auto', { coarsePointer: true, cores: 8, memoryGb: 8 })).toBe('high');
    expect(tierSettings('auto', 'high')).toEqual({ bloom: true, maxPixelRatio: 2 });
    expect(tierSettings('auto', 'low')).toEqual({ bloom: false, maxPixelRatio: 1 });
    expect(tierSettings('off', 'high').bloom).toBe(false);
  });
});

describe('materials', () => {
  const palette = [
    { id: 'clr', name: 'Clear', hex: '#fff4dc' },
    { id: 'smk', name: 'Smoke', hex: '#6b625a' },
    { id: 'blu', name: 'Blue', hex: '#3d7bff' },
  ];

  it('renders Clear as the LED white at lower strength and Smoke dimmer', () => {
    const led = '#ffd49a';
    const clr = glowFor(palette[0]!, led);
    expect(clr.strength).toBeCloseTo(CLEAR_GLOW_STRENGTH * GLOW_GAIN, 9);
    expect(clr.color.getHexString()).toBe('ffd49a');
    expect(glowFor(palette[1]!, led).strength).toBeCloseTo(SMOKE_GLOW_STRENGTH * GLOW_GAIN, 9);
    expect(glowFor(palette[2]!, led, 2).strength).toBeCloseTo(2 * GLOW_GAIN, 9);
  });

  it('falls back to the first palette colour for unknown ids', () => {
    expect(resolveColour('nope', palette).id).toBe('clr');
    expect(resolveColour(undefined, []).id).toBe('clr');
  });

  it('caches per colour/hex/layer, fades a layer, disposes on retain', () => {
    const bm = new BandMaterials('#ffd49a');
    const a = bm.get(palette[2]!, 'outer');
    expect(bm.get(palette[2]!, 'outer')).toEqual(a);
    expect(bm.get(palette[2]!, 'inner').glow).not.toBe(a.glow);
    expect(bm.get({ ...palette[2]!, hex: '#000000' }, 'outer').glow).not.toBe(a.glow);
    expect(a.glow.transparent && !a.glow.depthWrite).toBe(true);
    expect(a.sheen.opacity).toBeCloseTo(SHEEN_OPACITY, 9);

    bm.setLayerFade('outer', 0.08, 0);
    expect(a.glow.uniforms.uFade.value).toBeCloseTo(0.08, 9);
    expect(a.sheen.opacity).toBe(0);
    // Materials created later inherit the layer fade.
    expect(bm.get(palette[0]!, 'outer').glow.uniforms.uFade.value).toBeCloseTo(0.08, 9);
    expect(bm.get(palette[0]!, 'inner').glow.uniforms.uFade.value).toBe(1);

    let disposed = 0;
    a.glow.addEventListener('dispose', () => disposed++);
    a.sheen.addEventListener('dispose', () => disposed++);
    bm.retain(new Set([BandMaterials.key(palette[0]!, 'inner')]));
    expect(disposed).toBe(2);
    expect(bm.size).toBe(1);
    bm.dispose();
    expect(bm.size).toBe(0);
  });
});

describe('stage colour helpers', () => {
  it('normalises hex and rgb() tokens', () => {
    expect(cssColourToHex('#110F12')).toBe('#110f12');
    expect(cssColourToHex(' #abc ')).toBe('#aabbcc');
    expect(cssColourToHex('rgb(255, 128, 0)')).toBe('#ff8000');
    expect(cssColourToHex('rgb(255 128 0 / 0.5)')).toBe('#ff8000');
    expect(cssColourToHex('')).toBeNull();
  });

  it.each<ToneMap>(['agx', 'neutral'])('inverts %s so the stage background shows the token colour', (kind) => {
    for (const hex of ['#110f12', '#1a1715', '#0e0d12', '#5c554e', '#000000']) {
      const target = hexToLinear(hex);
      const back = linearToHex(toneMapColour(kind, inverseToneMap(kind, target)));
      const diff = [1, 3, 5].map((i) => Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16)));
      expect(Math.max(...diff)).toBeLessThanOrEqual(1);
    }
  });
});
