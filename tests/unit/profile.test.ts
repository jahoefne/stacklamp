/**
 * (r, z) profiles: valid (simple, CCW, r >= 0) at the defaults, for every
 * edge case and over a grid of joint parameters; the polygon helpers; the
 * segment's documented shape; the segment forms over a grid of amplitude,
 * height, overhang cap and tube diameter (within the cap, joint unchanged,
 * bounded by their envelope).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../../src/geometry/derive';
import { FORMS, ZONE_MARGIN } from '../../src/geometry/forms';
import { computeLayout, segmentSpec, type SegmentSpec } from '../../src/geometry/layout';
import { defaultParams } from '../../src/geometry/params';
import {
  arc,
  assertSimpleCCW,
  dedupe,
  flipProfile,
  profileBounds,
  profileProblem,
  revolvedPolygonVolume,
  revolvedVolume,
  signedArea,
  type Profile,
} from '../../src/geometry/profile';
import { baseProfile } from '../../src/geometry/profiles/base';
import { coverProfile } from '../../src/geometry/profiles/cover';
import {
  effectiveAmplitude,
  formAmplitude,
  formEnvelopeAt,
  formRadiusRange,
  formWarp,
  segmentEnvelope,
  segmentRMax,
  segmentSize,
} from '../../src/geometry/profiles/forms';
import { segmentProfile } from '../../src/geometry/profiles/segment';
import { FORM_IDS } from '../../src/geometry/types';
import { CASES, withParams } from '../helpers/params';

function allProfiles(p = defaultParams(), arcs = 12): [string, Profile][] {
  const { specs } = computeLayout(p);
  return [
    ['base', baseProfile(specs.base, arcs)],
    ['inner', segmentProfile(specs.inner)],
    ['outer', segmentProfile(specs.outer)],
    ['cover', coverProfile(specs.cover, arcs)],
    ['fit-test', segmentProfile(specs.fitTest)],
    ...specs.variants.inner.map((v): [string, Profile] => [`inner ${v.form}`, segmentProfile(v.spec)]),
    ...specs.variants.outer.map((v): [string, Profile] => [`outer ${v.form}`, segmentProfile(v.spec)]),
  ];
}

describe('helpers', () => {
  it('signed area, dedupe, arc', () => {
    const sq: Profile = [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ];
    expect(signedArea(sq)).toBe(2);
    expect(signedArea([...sq].reverse())).toBe(-2);
    expect(dedupe([[0, 0], [0, 0], [1, 0], [1, 1], [0, 0]])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    const a = arc(0, 0, 2, 0, Math.PI / 2, 4);
    expect(a).toHaveLength(5);
    expect(a[0]![0]).toBeCloseTo(2, 12);
    expect(a[4]![1]).toBeCloseTo(2, 12);
  });

  it('detects bad profiles', () => {
    expect(profileProblem([[0, 0], [1, 0]])).toMatch(/points/);
    expect(profileProblem([[0, 0], [0, 1], [1, 0]])).toMatch(/counter-clockwise/);
    expect(profileProblem([[-1, 0], [1, 0], [1, 1]])).toMatch(/r = /);
    // bow tie
    expect(profileProblem([[0, 0], [2, 2], [2, 0], [0, 2]])).toBeTruthy();
    expect(() => assertSimpleCCW([[0, 0], [0, 1], [1, 0]], 'x')).toThrow(/x:/);
  });

  it('Pappus volume of a rectangle ring and its n-gon version', () => {
    const ring: Profile = [
      [9, 0],
      [10, 0],
      [10, 5],
      [9, 5],
    ];
    expect(revolvedVolume(ring)).toBeCloseTo(Math.PI * (100 - 81) * 5, 9);
    expect(revolvedPolygonVolume(ring, 4)).toBeCloseTo(2 * (100 - 81) * 5, 9);
  });

  it('flipProfile keeps a profile CCW', () => {
    const f = flipProfile(segmentProfile(computeLayout(defaultParams()).specs.outer), 1000);
    expect(profileProblem(f)).toBeNull();
    expect(profileBounds(f).zMax).toBeCloseTo(1000, 9);
  });
});

describe('segment profile', () => {
  it('has the documented points', () => {
    const { specs } = computeLayout(defaultParams());
    const R = 100;
    const c = 0.25;
    const w = 0.8;
    const ov = 20;
    const l = 1;
    const H = specs.outer.height;
    expect(segmentProfile(specs.outer)).toEqual([
      [R + c, 0],
      [R + c + w, 0],
      [R + c + w, ov],
      [R, ov + w + c],
      [R, H - l],
      [R - l, H],
      [R - l - w, H],
      [R - w, H - l],
      [R - w, ov + w + c],
      [R + c, ov],
    ]);
  });
  it('its outer contour only moves inward going up (no vase-mode overhang)', () => {
    for (const c of CASES) {
      const prof = segmentProfile(computeLayout(c.params).specs.outer);
      // outer contour = the CCW run from the bottom-right corner to the top
      const outer = prof.slice(1, 6);
      for (let i = 1; i < outer.length; i++) {
        expect(outer[i]![1], c.name).toBeGreaterThanOrEqual(outer[i - 1]![1]);
        expect(outer[i]![0], c.name).toBeLessThanOrEqual(outer[i - 1]![0] + 1e-12);
        // never flatter than 45°
        const dz = outer[i]![1] - outer[i - 1]![1];
        const dr = outer[i - 1]![0] - outer[i]![0];
        expect(dz + 1e-9, c.name).toBeGreaterThanOrEqual(dr);
      }
    }
  });
});

describe('validity', () => {
  it('defaults', () => {
    for (const [name, prof] of allProfiles()) expect(profileProblem(prof), name).toBeNull();
  });

  it('every edge case at preview and export arc resolution', () => {
    for (const c of CASES) {
      for (const arcs of [3, 12]) {
        for (const [name, prof] of allProfiles(c.params, arcs)) expect(profileProblem(prof), `${c.name} ${name}`).toBeNull();
      }
    }
  });

  it('joint grid: lead-in 0.4–2, wall 0.6–1.2, overlap 5–40, clearance 0.05–1', () => {
    let n = 0;
    for (const leadIn of [0.4, 0.7, 1, 1.5, 2])
      for (const wall of [0.6, 0.8, 1, 1.2])
        for (const overlap of [5, 20, 40])
          for (const clearance of [0.05, 0.25, 1])
            for (const height of [60, 150, 250]) {
              const p = withParams((q) => {
                q.segments.rimLeadIn = leadIn;
                q.segments.wall = wall;
                q.segments.overlap = overlap;
                q.tolerances.segment = clearance;
                q.segments.outerHeight = height;
                q.segments.innerHeight = height;
                q.base.collarHeight = 60;
              });
              const { dims, layout } = derive(p);
              expect(layout).not.toBeNull();
              for (const [name, prof] of allProfiles(p, 4)) {
                expect(profileProblem(prof), `λ${leadIn} w${wall} ov${overlap} c${clearance} H${height} ${name}`).toBeNull();
              }
              expect(dims.messages.map((m) => m.code)).not.toContain('profile-invalid');
              n++;
            }
    expect(n).toBe(540);
  });
});

// ---------------------------------------------------------------- segment forms

/** Every form over tube diameter × segment height × overhang cap × asked amplitude (some must be scaled down). */
function formGrid(): { name: string; spec: SegmentSpec }[] {
  const out: { name: string; spec: SegmentSpec }[] = [];
  for (const form of FORM_IDS.filter((f) => f !== 'straight'))
    for (const D of [40, 60, 200])
      for (const H of [60, 100, 154.5, 250])
        for (const cap of [30, 45, 60])
          for (const a of [1, 15, 40, 120]) {
            const p = withParams((q) => (q.segments.maxOverhang = cap));
            out.push({ name: `${form} D${D} H${H} cap${cap} a${a}`, spec: segmentSpec(p, D, H, form, D + 2 * a) });
          }
  return out;
}

/** The free zone, from the joint numbers (independent of profiles/forms.ts). */
function zone(s: SegmentSpec): [number, number] {
  return [s.overlap + s.wall + s.clearance + ZONE_MARGIN, s.height - (s.overlap + s.clearance + s.leadIn) - ZONE_MARGIN];
}

const straightOf = (s: SegmentSpec): SegmentSpec => segmentSpec(withParams(() => {}), s.D, s.height);

describe('segment forms', () => {
  const grid = formGrid();

  it('every form over the grid: valid, outward edges within the cap, joint unchanged, back to R at the zone ends', () => {
    expect(grid.length).toBe(7 * 3 * 4 * 3 * 4);
    let scaled = 0;
    for (const { name, spec } of grid) {
      const prof = segmentProfile(spec);
      expect(profileProblem(prof), name).toBeNull();
      // vase mode prints socket-down: an edge whose radius grows going up may lean at most the cap
      const t = Math.tan((spec.maxOverhang! * Math.PI) / 180);
      for (let i = 0; i < prof.length; i++) {
        const [r0, z0] = prof[i]!;
        const [r1, z1] = prof[(i + 1) % prof.length]!;
        if (z1 !== z0 && (r1 - r0) * (z1 - z0) > 0) expect(Math.abs(r1 - r0), `${name} edge ${i}`).toBeLessThanOrEqual(Math.abs(z1 - z0) * t + 1e-6);
      }
      // outside the zone the profile is the straight one, point for point
      const [zLo, zHi] = zone(spec);
      expect(
        prof.filter(([, z]) => z < zLo || z > zHi),
        name,
      ).toEqual(segmentProfile(straightOf(spec)));

      const R = spec.D / 2;
      const w = spec.wall;
      const asked = (spec.formOD! - spec.D) / 2;
      const a = effectiveAmplitude(spec);
      expect(a, name).toBeLessThanOrEqual(formAmplitude(spec) + 1e-12);
      expect(formAmplitude(spec), name).toBeLessThanOrEqual(asked + 1e-12);
      if (a < asked - 1e-9) scaled++;
      expect(a, name).toBeGreaterThan(0);
      for (const p of [
        [R, zLo],
        [R, zHi],
        [R - w, zLo],
        [R - w, zHi],
      ])
        expect(prof, name).toContainEqual(p);

      const inZone = prof.filter(([, z]) => z > zLo && z < zHi).map(([r]) => r);
      if (!FORMS[spec.form].round) {
        // ribbed forms only add rings to the straight body
        for (const r of inZone) expect([R, R - w], name).toContain(r);
      } else if (spec.form === 'waist') {
        expect(Math.min(...inZone), name).toBeCloseTo(R - a - w, 9);
        expect(Math.max(...inZone), name).toBeLessThanOrEqual(R);
      } else {
        expect(Math.max(...inZone), name).toBeCloseTo(R + a, 9);
        expect(Math.min(...inZone), name).toBeGreaterThanOrEqual(R - w);
      }
      const rMax = Math.max(R + spec.clearance + w, spec.form === 'waist' ? 0 : R + a);
      expect(segmentRMax(spec), name).toBeCloseTo(rMax, 9);
      expect(segmentSize(spec), name).toEqual([2 * segmentRMax(spec), 2 * segmentRMax(spec), spec.height]);
    }
    // the grid reaches the cap and the zone length
    expect(scaled).toBeGreaterThan(100);
  });

  it('a form that fits keeps its amplitude; one that does not is scaled to its zone and cap', () => {
    const p = defaultParams();
    const spec = (form: (typeof FORM_IDS)[number], D: number, H: number, formOD: number) => segmentSpec(p, D, H, form, formOD);
    for (const form of ['ball', 'drop', 'waist', 'barrel', 'star', 'flute'] as const) expect(effectiveAmplitude(spec(form, 60, 154.3, 90)), form).toBe(15);
    // 80 mm segments: a 33.7 mm zone; 45° allows half of it, the barrel's single arc tan(22.5°) of half
    const [z0, z1] = zone(spec('ball', 200, 80, 240));
    const h = (z1 - z0) / 2;
    expect(effectiveAmplitude(spec('ball', 200, 80, 240))).toBeCloseTo(h, 9);
    expect(effectiveAmplitude(spec('waist', 200, 80, 240))).toBeCloseTo(h, 9);
    expect(effectiveAmplitude(spec('barrel', 200, 80, 240))).toBeCloseTo(h * Math.tan(Math.PI / 8), 9);
    // the twist's turning ribs lean: wide tubes and short zones scale it down first
    expect(effectiveAmplitude(spec('twist', 200, 154.5, 240))).toBeLessThan(20);
    expect(effectiveAmplitude(spec('twist', 60, 154.3, 90))).toBe(15);
    // no form diameter beyond the tube: straight
    expect(segmentProfile(spec('ball', 60, 154.3, 60))).toEqual(segmentProfile(straightOf(spec('ball', 60, 154.3, 60))));
    expect(segmentProfile(spec('star', 60, 154.3, 50))).toEqual(segmentProfile(straightOf(spec('star', 60, 154.3, 50))));
    // a waist never closes the bore
    expect(Math.min(...segmentProfile(spec('waist', 40, 250, 400)).map(([r]) => r))).toBeGreaterThan(0.99);
  });

  it('round forms: the envelope is the profile', () => {
    for (const { name, spec } of grid.filter((g) => FORMS[g.spec.form].round)) expect(segmentEnvelope(spec), name).toEqual(segmentProfile(spec));
  });

  it('ribbed forms: the envelope bounds every rib, and the warped surface stays within the cap', () => {
    for (const { name, spec } of grid.filter((g) => !FORMS[g.spec.form].round)) {
      const warp = formWarp(spec)!;
      expect(warp, name).not.toBeNull();
      const R = spec.D / 2;
      const t = Math.tan((spec.maxOverhang! * Math.PI) / 180);
      const env = segmentEnvelope(spec);
      expect(profileProblem(env), name).toBeNull();
      const [zLo, zHi] = zone(spec);
      const dz = 1e-4;
      const dth = 1e-6;
      const NZ = 40;
      const NT = 90;
      let beyond = -Infinity; // largest r − envelope
      let steepest = 0; // largest overhang / cap
      let shortfall = 0; // largest share of the envelope no rib reaches
      for (let i = 1; i < NZ; i++) {
        const z = zLo + ((zHi - zLo) * i) / NZ;
        const bound = formEnvelopeAt(spec, z);
        let reach = 0;
        for (let j = 0; j < NT; j++) {
          const th = (2 * Math.PI * j) / NT;
          const off = warp.offset(th, z);
          reach = Math.max(reach, off);
          beyond = Math.max(beyond, R + off - bound);
          // overhang of the surface r = R + offset(θ, z): f_z / √(1 + (f_θ / r)²)
          const fz = (warp.offset(th, z + dz) - warp.offset(th, z - dz)) / (2 * dz);
          const ft = (warp.offset(th + dth, z) - warp.offset(th - dth, z)) / (2 * dth);
          steepest = Math.max(steepest, fz / Math.hypot(1, ft / (R + off)) / t);
        }
        if (bound > R) shortfall = Math.max(shortfall, 1 - reach / (bound - R));
      }
      expect(beyond, name).toBeLessThanOrEqual(1e-9);
      expect(steepest, name).toBeLessThanOrEqual(1 + 1e-6);
      // a ridge reaches the envelope (the twist's ridges turn between the sampled azimuths)
      expect(shortfall, name).toBeLessThan(spec.form === 'twist' ? 0.03 : 1e-9);
      // outside the zone nothing moves
      expect(warp.offset(0, zLo)).toBe(0);
      expect(warp.offset(0, zHi)).toBe(0);
      expect(formRadiusRange(spec, zLo, zHi)[1], name).toBeCloseTo(R + effectiveAmplitude(spec), 9);
    }
  });
});
