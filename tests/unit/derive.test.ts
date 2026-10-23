/**
 * deriveDims: messages for the documented situations, placements, fit,
 * robustness (never throws, < 1 ms) and partsKey.
 */
import { describe, expect, it } from 'vitest';
import { deriveDims } from '../../src/geometry/derive';
import { segmentSpec } from '../../src/geometry/layout';
import { effectiveAmplitude, segmentRMax } from '../../src/geometry/profiles/forms';
import { partsKey } from '../../src/geometry/keys';
import { MESSAGE_CODES } from '../../src/geometry/messages';
import { NOZZLES, NOZZLE_IDS, defaultParams } from '../../src/geometry/params';
import { applyToPoint } from '../../src/geometry/placements';
import type { LampParams } from '../../src/geometry/types';
import { CASES, ledTube, withNozzle, withParams } from '../helpers/params';

const caseParams = (name: string): LampParams => structuredClone(CASES.find((c) => c.name === name)!.params);

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
    const d = deriveDims(withParams((p) => (p.printer = { ...p.printer, preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 })));
    const sev = d.messages.map((m) => m.severity);
    expect(sev[0]).toBe('error');
    expect(sev.indexOf('info')).toBeGreaterThan(sev.lastIndexOf('error'));
  });

  it('small printers report the parts that do not fit', () => {
    const c = codes(withParams((p) => (p.printer = { ...p.printer, preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 })));
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

  it('vase wall warning outside the nozzle range (0.5–1.0 mm on the 0.6 nozzle)', () => {
    expect(codes(withParams((p) => (p.segments.wall = 0.45)))).toContain('vase-wall');
    expect(codes(withParams((p) => (p.segments.wall = 1.05)))).toContain('vase-wall');
    expect(codes(withParams((p) => (p.segments.wall = 0.5)))).not.toContain('vase-wall');
    expect(codes(withParams((p) => (p.segments.wall = 1)))).not.toContain('vase-wall');
    expect(codes(defaultParams())).not.toContain('vase-wall');
    // every nozzle accepts its own wall and the top of its range, not more
    for (const id of NOZZLE_IDS) {
      const hi = NOZZLES[id].wallRange[1];
      const at = (wall: number) =>
        codes(
          withParams((p) => {
            p.printer.nozzle = id;
            p.segments.wall = wall;
          }),
        );
      expect(codes(withNozzle(id)), id).not.toContain('vase-wall');
      expect(at(hi), id).not.toContain('vase-wall');
      expect(at(hi + 0.05), id).toContain('vase-wall');
    }
    // the text names the neighbouring nozzle when there is one
    const text = (mutate: (p: LampParams) => void) => deriveDims(withParams(mutate)).messages.find((m) => m.code === 'vase-wall')?.text;
    expect(text((p) => (p.segments.wall = 1.2))).toContain('switch to a 0.8 mm nozzle');
    expect(text((p) => (p.segments.wall = 0.45))).toContain('switch to a 0.4 mm nozzle');
    expect(
      text((p) => {
        p.printer.nozzle = '0.8';
        p.segments.wall = 1.5;
      }),
    ).not.toContain('switch');
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

describe('segment forms', () => {
  const formMessages = (p: LampParams) => deriveDims(p).messages.filter((m) => m.code.startsWith('form-'));

  it('maxOD is the widest form in use (the bed footprint); straight lamps keep the socket', () => {
    const d = deriveDims(defaultParams());
    expect(d.inner.maxOD).toBe(d.inner.socketOD);
    expect(d.outer.maxOD).toBe(d.outer.socketOD);
    expect(d.inner.forms).toEqual(Array(d.inner.count).fill('straight'));

    const m = deriveDims(caseParams('mixed forms'));
    expect(m.inner.forms.slice(0, 5)).toEqual(['ball', 'straight', 'drop', 'waist', 'ball']);
    expect(m.inner.maxOD).toBeCloseTo(84, 9);
    // the twist is the only outer form scaled down (its ribs lean as they turn)
    expect(m.outer.maxOD).toBeCloseTo(230, 9);
    expect(m.fit['outer-segment'].size).toEqual([m.outer.maxOD, m.outer.maxOD, m.outer.height]);
    expect(m.fit['inner-segment'].size).toEqual([m.inner.maxOD, m.inner.maxOD, m.inner.height]);
    // an unused form diameter changes nothing
    expect(deriveDims(withParams((p) => (p.tubes.outerFormOD = 400))).outer.maxOD).toBe(d.outer.maxOD);
    // a wide outer form fails the bed fit through maxOD
    const wide = deriveDims(
      withParams((p) => {
        p.forms.outer = ['ball'];
        p.tubes.outerFormOD = 260;
      }),
    );
    expect(wide.outer.maxOD).toBeGreaterThan(246);
    expect(wide.messages.find((m) => m.code === 'bed-fit-outer-segment')?.path).toBe('tubes.outerOD');
  });

  it('form-squeezed names the stack, the form and the diameter it reaches', () => {
    const p = caseParams('short 80 mm segments with balls');
    const d = deriveDims(p);
    const squeezed = d.messages.filter((m) => m.code === 'form-squeezed');
    expect(squeezed.map((m) => m.path)).toEqual(['tubes.outerFormOD', 'tubes.outerFormOD']);
    const ball = segmentSpec(p, 200, d.outer.height, 'ball', 240);
    const reached = Math.round(2 * segmentRMax(ball) * 10) / 10;
    expect(squeezed[0]!.severity).toBe('warning');
    expect(squeezed[0]!.text).toBe(`Outer ball segments are too short for a 240 mm form; it reaches ${reached} mm.`);
    expect(squeezed[1]!.text).toMatch(/^Outer twist segments are too short for a 240 mm form; it reaches [\d.]+ mm\.$/);
    expect(d.ok).toBe(true);
    // the inner balls fit their 33 mm zone
    expect(effectiveAmplitude(segmentSpec(p, 60, d.inner.height, 'ball', 90))).toBe(15);
    // a waist that cannot go as deep says how far it narrows
    const waist = formMessages(
      withParams((q) => {
        q.segments.outerHeight = 80;
        q.segments.innerHeight = 80;
        q.forms.outer = ['waist'];
      }),
    );
    expect(waist.map((m) => m.code)).toEqual(['form-squeezed']);
    expect(waist[0]!.text).toMatch(/^Outer waist segments are too short to narrow to 160 mm; the waist reaches [\d.]+ mm\.$/);
  });

  it('form-too-wide: inner forms keep 2 mm from the outer stack; the stated maximum clears it', () => {
    const m = formMessages(caseParams('inner form too wide'));
    expect(m.map((x) => [x.code, x.severity, x.path])).toEqual([['form-too-wide', 'error', 'tubes.innerFormOD']]);
    // outer rim inside radius 75 − 0.8 − 1 = 73.2, minus 2 mm: Ø 142.4
    expect(m[0]!.text).toBe('The inner forms (150 mm) run into the outer segments; the inner form diameter can be at most 142.4 mm.');
    const fixed = caseParams('inner form too wide');
    fixed.tubes.innerFormOD = 142.4;
    expect(formMessages(fixed)).toEqual([]);
  });

  it('form-too-narrow: an inner waist keeps clear of the rod, an outer waist of the inner stack', () => {
    const inner = withParams((p) => {
      p.forms.inner = ['waist'];
      p.tubes.innerFormOD = 100;
    });
    const m = formMessages(inner);
    expect(m.map((x) => [x.code, x.path])).toEqual([['form-too-narrow', 'tubes.innerFormOD']]);
    // inside radius 30 − a − 0.8 − 1 must stay ≥ 10 + 3 + 2: a ≤ 13.2, Ø 86.4
    expect(m[0]!.text).toBe('An inner waist down to 20 mm leaves no room for the rod and LED strip; with a waist the inner form diameter can be at most 86.4 mm.');
    inner.tubes.innerFormOD = 86.4;
    expect(formMessages(inner)).toEqual([]);
    // the waist alone is not blamed for a tube that is too narrow anyway
    expect(
      formMessages(
        withParams((p) => {
          p.forms.inner = ['waist'];
          p.tubes.innerOD = 30;
        }),
      ).map((x) => x.code),
    ).not.toContain('form-too-narrow');

    const both = formMessages(
      withParams((p) => {
        p.forms.inner = ['ball'];
        p.forms.outer = ['waist'];
        p.tubes.innerFormOD = 150;
        p.tubes.outerFormOD = 260;
      }),
    );
    expect(both.map((x) => [x.code, x.path])).toEqual([
      ['form-too-wide', 'tubes.innerFormOD'],
      ['form-too-narrow', 'tubes.outerFormOD'],
    ]);
    expect(both[1]!.text).toMatch(/^An outer waist down to 140 mm runs into the inner segments; with a waist the outer form diameter can be at most [\d.]+ mm\.$/);
  });

  it('forms keep clear of the rod collar and the cover rings around the end segments', () => {
    // a tall, thick collar beside the bottom inner segment's waist
    const collar = formMessages(
      withParams((p) => {
        p.forms.inner = ['waist'];
        p.tubes.innerFormOD = 86;
        p.base.collarHeight = 60;
        p.base.collarWall = 10;
      }),
    );
    expect(collar.map((x) => [x.code, x.path])).toEqual([['form-too-narrow', 'tubes.innerFormOD']]);
    expect(collar[0]!.text).toContain('rod collar');
    // only the bottom segment stands beside the collar
    expect(
      formMessages(
        withParams((p) => {
          p.forms.inner = ['straight', 'waist'];
          p.tubes.innerFormOD = 86;
          p.base.collarHeight = 60;
          p.base.collarWall = 10;
        }),
      ),
    ).toEqual([]);
    // a short joint lets the cover's inner ring reach down to the top inner segment's ribs
    const ring = formMessages(
      withParams((p) => {
        p.forms.inner = ['flute'];
        p.segments.overlap = 5;
      }),
    );
    expect(ring.map((x) => [x.code, x.path])).toEqual([['form-too-wide', 'tubes.innerFormOD']]);
    expect(ring[0]!.text).toContain('capture ring');
  });

  it('round form profiles are validated per variant', () => {
    for (const c of CASES) expect(deriveDims(c.params).messages.map((m) => m.code), c.name).not.toContain('profile-invalid');
  });

  it('is fast with four forms per stack (< 1 ms per call)', () => {
    const p = caseParams('mixed forms');
    for (let i = 0; i < 50; i++) deriveDims(p);
    const n = 300;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) deriveDims(p);
    const ms = (performance.now() - t0) / n;
    console.log(`deriveDims with forms: ${ms.toFixed(3)} ms per call`);
    expect(ms).toBeLessThan(1);
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
    // the nozzle changes no mesh, but the specs carry its layer height and shells for the mass estimates
    expect(partsKey(withParams((p) => (p.printer.nozzle = '0.4')))).not.toBe(base);
    // the plate bore sizes the boss and the clamp
    expect(partsKey(withParams((p) => (p.plate.bore = 40)))).not.toBe(base);
    expect(partsKey(withParams((p) => (p.core.length = 1200)))).not.toBe(base);
    expect(partsKey(withParams((p) => (p.base.diameter = 230)))).not.toBe(base);
    expect(partsKey(withParams((p) => (p.printer.bedZ = 150)))).not.toBe(base);
  });
  it('follows the forms in use, not an unused form diameter', () => {
    // every form straight: the form diameters and the overhang cap build nothing
    expect(partsKey(withParams((p) => (p.tubes.innerFormOD = 120)))).toBe(base);
    expect(partsKey(withParams((p) => (p.tubes.outerFormOD = 300)))).toBe(base);
    expect(partsKey(withParams((p) => (p.segments.maxOverhang = 30)))).toBe(base);
    expect(partsKey(withParams((p) => (p.forms.outer = ['straight'])))).toBe(base);
    // a painted form is a new mesh, and then its diameter and cap matter
    const ball = withParams((p) => (p.forms.outer = ['ball', 'straight']));
    const key = partsKey(ball);
    expect(key).not.toBe(base);
    expect(partsKey(withParams((p) => (p.forms.outer = ['straight', 'ball'])))).not.toBe(key);
    expect(partsKey({ ...ball, tubes: { ...ball.tubes, outerFormOD: 230 } })).not.toBe(key);
    expect(partsKey({ ...ball, tubes: { ...ball.tubes, innerFormOD: 120 } })).toBe(key);
    expect(partsKey({ ...ball, segments: { ...ball.segments, maxOverhang: 40 } })).not.toBe(key);
  });
});
