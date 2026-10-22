/**
 * (r, z) profiles: valid (simple, CCW, r >= 0) at the defaults, for every
 * edge case and over a grid of joint parameters; the polygon helpers; the
 * segment's documented shape.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../../src/geometry/derive';
import { computeLayout } from '../../src/geometry/layout';
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
import { segmentProfile } from '../../src/geometry/profiles/segment';
import { CASES, withParams } from '../helpers/params';

function allProfiles(p = defaultParams(), arcs = 12): [string, Profile][] {
  const { specs } = computeLayout(p);
  return [
    ['base', baseProfile(specs.base, arcs)],
    ['inner', segmentProfile(specs.inner)],
    ['outer', segmentProfile(specs.outer)],
    ['cover', coverProfile(specs.cover, arcs)],
    ['fit-test', segmentProfile(specs.fitTest)],
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
