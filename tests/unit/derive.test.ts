/**
 * deriveDims: messages for the documented situations, placements, fit,
 * robustness (never throws, < 1 ms) and partsKey.
 */
import { describe, expect, it } from 'vitest';
import { deriveDims } from '../../src/geometry/derive';
import { partsKey } from '../../src/geometry/keys';
import { MESSAGE_CODES } from '../../src/geometry/messages';
import { defaultParams } from '../../src/geometry/params';
import { applyToPoint } from '../../src/geometry/placements';
import type { LampParams } from '../../src/geometry/types';
import { CASES, ledTube, withParams } from '../helpers/params';

const codes = (p: LampParams) => deriveDims(p).messages.map((m) => m.code);

describe('messages', () => {
  it('every message has a known code, a sentence and a path', () => {
    for (const c of CASES) {
      for (const m of deriveDims(c.params).messages) {
        const known = m.code in MESSAGE_CODES || /^(bed|z)-fit-/.test(m.code);
        expect(known, m.code).toBe(true);
        if (m.code in MESSAGE_CODES) expect(m.severity).toBe(MESSAGE_CODES[m.code as keyof typeof MESSAGE_CODES]);
        expect(m.text).toMatch(/^[A-Z].*[.)]$/);
        // a general print note, not about one field
        if (m.code !== 'pocket-needs-supports') expect(m.path, m.code).toBeTruthy();
      }
    }
  });

  it('every edge case derives without errors', () => {
    for (const c of CASES) {
      const d = deriveDims(c.params);
      const errors = d.messages.filter((m) => m.severity === 'error').map((m) => m.code);
      expect(errors, c.name).toEqual(c.expectErrors ?? []);
      expect(d.ok, c.name).toBe((c.expectErrors ?? []).length === 0);
    }
  });

  it('errors come first', () => {
    const d = deriveDims(withParams((p) => (p.printer = { preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 })));
    const sev = d.messages.map((m) => m.severity);
    expect(sev[0]).toBe('error');
    expect(sev.indexOf('info')).toBeGreaterThan(sev.lastIndexOf('error'));
  });

  it('small printers report the parts that do not fit', () => {
    const c = codes(withParams((p) => (p.printer = { preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 })));
    expect(c).toEqual(expect.arrayContaining(['bed-fit-base', 'bed-fit-outer-segment', 'bed-fit-top-cover']));
    expect(c).not.toContain('bed-fit-inner-segment');
  });

  it('rod too short', () => {
    const c = codes(withParams((p) => (p.core.length = 40)));
    expect(c).toContain('rod-too-short');
  });

  it('core vs inner tube, collar vs ring, tubes too close, base too small', () => {
    expect(codes(withParams((p) => (p.tubes.innerOD = 30)))).toEqual(expect.arrayContaining(['core-vs-inner-tube', 'collar-vs-ring']));
    expect(codes(withParams((p) => (p.tubes.outerOD = 66)))).toContain('tubes-too-close');
    expect(codes(withParams((p) => (p.base.diameter = 200)))).toContain('base-too-small');
    const pocket = deriveDims(
      withParams((p) => {
        p.plate.od = 220;
        p.base.diameter = 228;
      }),
    ).messages.filter((m) => m.code === 'base-too-small');
    expect(pocket.map((m) => m.path)).toEqual(['plate.od']);
  });

  it('intake overlap', () => {
    expect(
      codes(
        withParams((p) => {
          p.base.intakeCount = 12;
          p.base.intakeWidth = 20;
        }),
      ),
    ).toContain('intake-overlap');
    expect(codes(withParams((p) => (p.base.intakeHeight = 8)))).not.toContain('intake-overlap');
    expect(
      codes(
        withParams((p) => {
          p.segments.overlap = 5;
          p.base.intakeHeight = 8;
        }),
      ),
    ).toContain('intake-overlap');
  });

  it('wire routing: auto through the socket when the collar leaves no room, forced beside fails', () => {
    expect(codes(ledTube())).toContain('wire-routing-through-socket');
    const forced = withParams((p) => {
      p.core.kind = 'led-tube';
      p.core.diameter = 28;
      p.base.wireRouting = 'beside-collar';
    });
    expect(codes(forced)).toContain('wire-no-room');
  });

  it('screws need a tall enough collar', () => {
    expect(codes(withParams((p) => (p.base.collarHeight = 25)))).toContain('screw-vs-collar');
    expect(codes(withParams((p) => (p.base.screwCount = 0)))).not.toContain('screw-height-raised');
  });

  it('inner slits are dropped with a warning when the boss leaves no room', () => {
    expect(codes(ledTube())).toContain('inner-slits-dropped');
    expect(codes(defaultParams())).not.toContain('inner-slits-dropped');
  });

  it('boss hole through the plate is an error', () => {
    const c = codes(
      withParams((p) => {
        p.cover.bossHeight = 8;
        p.cover.bossHoleDepth = 30;
      }),
    );
    expect(c).toContain('profile-invalid');
  });

  it('vase wall warning outside 0.5–1.0', () => {
    expect(codes(withParams((p) => (p.segments.wall = 0.4)))).toContain('vase-wall');
    expect(codes(withParams((p) => (p.segments.wall = 1.5)))).toContain('vase-wall');
    expect(codes(defaultParams())).not.toContain('vase-wall');
  });

  it('segment deviation beyond maxDeviation', () => {
    const c = codes(
      withParams((p) => {
        p.segments.maxDeviation = 0.01;
      }),
    );
    expect(c).toContain('segment-deviation');
  });
});

describe('placements and fit', () => {
  const p = defaultParams();
  const d = deriveDims(p);
  it('one matrix per copy; segments stacked by the pitch; cover flipped onto the stack', () => {
    expect(d.placements.base).toHaveLength(1);
    expect(d.placements['outer-segment']).toHaveLength(d.outer.count);
    expect(d.placements['inner-segment']).toHaveLength(d.inner.count);
    expect(d.placements['fit-test']).toHaveLength(0);
    expect(d.placements['plate-clamp']).toHaveLength(1);
    const z = (m: number[], pz = 0) => applyToPoint(m, [0, 0, pz])[2];
    // the clamp sits under the plate, its underside the extra pocket depth above the floor
    expect(z(d.placements['plate-clamp'][0]!)).toBeCloseTo(p.tolerances.plateDepth, 9);
    expect(d.base.pocketDepth).toBeCloseTo(p.plate.thickness + 3 + p.tolerances.plateDepth, 9);
    expect(d.base.bossDiameter).toBeCloseTo(p.plate.bore - 2 * p.tolerances.plateRadial, 9);
    expect(d.base.clampScrewLength).toBe(25);
    expect(z(d.placements['outer-segment'][0]!)).toBeCloseTo(d.base.topZ + p.base.footGap, 9);
    expect(z(d.placements['outer-segment'][1]!) - z(d.placements['outer-segment'][0]!)).toBeCloseTo(d.outer.pitch, 9);
    const last = d.placements['outer-segment'][d.outer.count - 1]!;
    expect(z(last, d.outer.height)).toBeCloseTo(d.cover.plateUndersideZ, 9);
    const cover = d.placements['top-cover'][0]!;
    expect(z(cover, 0)).toBeCloseTo(d.totalHeight, 9);
    expect(z(cover, p.cover.plateThickness)).toBeCloseTo(d.cover.plateUndersideZ, 9);
    // a proper rotation (det +1), not a mirror
    const [a, b, c, , e, f, g, , h, i, j] = cover;
    const det = a! * (f! * j! - g! * i!) - b! * (e! * j! - g! * h!) + c! * (e! * i! - f! * h!);
    expect(det).toBeCloseTo(1, 12);
  });
  it('fit sizes', () => {
    expect(d.fit.base.size).toEqual([240, 240, 81]);
    expect(d.fit['top-cover'].size[2]).toBeCloseTo(23, 9);
    expect(d.fit['plate-clamp'].size).toEqual([50, 50, 3]);
    expect(d.fit['fit-test'].size[2]).toBeCloseTo(36.25, 9);
    for (const f of Object.values(d.fit)) {
      expect(f.fitsBed).toBe(true);
      expect(f.fitsZ).toBe(true);
    }
  });
});

describe('robustness', () => {
  it('flags values outside their PARAM_META range', () => {
    const c = deriveDims(withParams((p) => (p.segments.overlap = 2))).messages.find((m) => m.code === 'out-of-range');
    expect(c?.path).toBe('segments.overlap');
  });

  it('never throws, even on garbage', () => {
    const bad: unknown[] = [
      withParams((p) => (p.core.length = Number.NaN)),
      withParams((p) => (p.segments.wall = Number.POSITIVE_INFINITY)),
      withParams((p) => (p.tubes.outerOD = -5)),
      withParams((p) => (p.segments.overlap = 0)),
      withParams((p) => (p.printer.bedZ = 0)),
      withParams((p) => (p.segments.outerHeight = 0)),
      withParams((p) => (p.base.intakeCount = 1000)),
      { ...defaultParams(), core: undefined },
      {},
    ];
    for (const p of bad) {
      const d = deriveDims(p as LampParams);
      expect(d.ok).toBe(false);
      expect(d.messages.some((m) => m.severity === 'error')).toBe(true);
    }
  });

  it('is fast (< 1 ms per call)', () => {
    const p = defaultParams();
    for (let i = 0; i < 50; i++) deriveDims(p);
    const n = 500;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) deriveDims(p);
    const ms = (performance.now() - t0) / n;
    console.log(`deriveDims: ${ms.toFixed(3)} ms per call`);
    expect(ms).toBeLessThan(1);
  });
});

describe('partsKey', () => {
  const base = partsKey(defaultParams());
  it('ignores the printer preset alone and non-geometric fields', () => {
    expect(partsKey(withParams((p) => (p.printer.preset = 'custom')))).toBe(base);
    expect(partsKey(withParams((p) => (p.segments.maxDeviation = 0.2)))).toBe(base);
    expect(partsKey(withParams((p) => (p.core.stripBuildUp = 5)))).toBe(base);
  });
  it('changes when a mesh changes', () => {
    expect(partsKey(withParams((p) => (p.cover.slitWidth = 4)))).not.toBe(base);
    // the plate bore sizes the boss and the clamp
    expect(partsKey(withParams((p) => (p.plate.bore = 40)))).not.toBe(base);
    expect(partsKey(withParams((p) => (p.core.length = 1200)))).not.toBe(base);
    expect(partsKey(withParams((p) => (p.base.diameter = 230)))).not.toBe(base);
    expect(partsKey(withParams((p) => (p.printer.bedZ = 150)))).not.toBe(base);
  });
});
