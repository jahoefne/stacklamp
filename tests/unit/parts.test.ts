/**
 * Every part at preview and export quality for the defaults, the LED tube
 * and the edge cases: a valid single solid (NoError, not empty, one
 * component) with the expected genus (holes), the derived bounding box, and
 * the revolve volume equal to the analytic Pappus volume of its profile.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPart, buildPartMesh, copiesOf } from '../../src/geometry/build';
import { segmentRMax } from '../../src/geometry/build/segment';
import { derive } from '../../src/geometry/derive';
import { dispose, type Kernel, type Manifold } from '../../src/geometry/kernel';
import type { PartSpecs } from '../../src/geometry/layout';
import { revolvedPolygonVolume, type Profile } from '../../src/geometry/profile';
import { baseProfile } from '../../src/geometry/profiles/base';
import { coverProfile } from '../../src/geometry/profiles/cover';
import { segmentProfile } from '../../src/geometry/profiles/segment';
import { resolution } from '../../src/geometry/quality';
import { PART_IDS, type PartId, type Quality } from '../../src/geometry/types';
import { defaultParams } from '../../src/geometry/params';
import { getKernel } from '../helpers/kernel';
import { CASES, ledTube } from '../helpers/params';
import { vaseFill } from '../../src/geometry/estimate';
import type { LampParams } from '../../src/geometry/types';

let k: Kernel;
beforeAll(async () => {
  k = await getKernel();
});

function expectedGenus(id: PartId, specs: PartSpecs): number {
  if (id === 'base') return 1 + 2 * specs.base.intakes.count + specs.base.screws.count;
  if (id === 'top-cover') return specs.cover.slits.outer.count + specs.cover.slits.inner.count;
  return 1;
}

/** The revolve body of a part: its profile and the segment count it is revolved with. */
function body(id: PartId, specs: PartSpecs, q: Quality): { profile: Profile; n: number } {
  const res = resolution(q);
  switch (id) {
    case 'base':
      return { profile: baseProfile(specs.base, res.arcPerQuarter), n: res.revolve(specs.base.radius) };
    case 'top-cover':
      return { profile: coverProfile(specs.cover, Math.max(2, Math.round(res.arcPerQuarter / 2))), n: res.revolve(specs.cover.radius) };
    case 'inner-segment':
      return { profile: segmentProfile(specs.inner), n: res.revolve(segmentRMax(specs.inner)) };
    case 'outer-segment':
      return { profile: segmentProfile(specs.outer), n: res.revolve(segmentRMax(specs.outer)) };
    case 'fit-test':
      return { profile: segmentProfile(specs.fitTest), n: res.revolve(segmentRMax(specs.fitTest)) };
  }
}

function components(m: Manifold): number {
  const parts = m.decompose();
  const n = parts.length;
  for (const p of parts) p.delete();
  return n;
}

describe.each(CASES)('$name', ({ params }) => {
  const { dims, layout } = derive(params);

  it.each(['preview', 'export'] as const)('all parts at %s quality', (q) => {
    expect(layout).not.toBeNull();
    const specs = layout!.specs;
    for (const id of PART_IDS) {
      const m = buildPart(k, id, specs, q);
      try {
        expect(m.status(), id).toBe('NoError');
        expect(m.isEmpty(), id).toBe(false);
        expect(components(m), `${id} components`).toBe(1);
        expect(m.genus(), `${id} genus`).toBe(expectedGenus(id, specs));
        const box = m.boundingBox();
        const size = dims.fit[id].size;
        for (let a = 0; a < 3; a++) {
          expect(Math.abs(box.max[a]! - box.min[a]! - size[a]!), `${id} size[${a}]`).toBeLessThanOrEqual(0.05);
        }
        expect(Math.abs(box.min[2]!), `${id} on the bed`).toBeLessThan(1e-6);
        expect(Math.abs(box.min[0]! + box.max[0]!), `${id} centred x`).toBeLessThan(0.05);
        expect(Math.abs(box.min[1]! + box.max[1]!), `${id} centred y`).toBeLessThan(0.05);

        const { profile, n } = body(id, specs, q);
        const analytic = revolvedPolygonVolume(profile, n);
        if (id === 'base' || id === 'top-cover') {
          const revolved = k.Manifold.revolve([profile], n);
          const rv = revolved.volume();
          revolved.delete();
          expect(Math.abs(rv / analytic - 1), `${id} body volume`).toBeLessThan(1e-6);
          const cut = id === 'base' || expectedGenus(id, specs) > 0;
          if (cut) expect(m.volume(), `${id} cutters remove material`).toBeLessThan(rv);
          else expect(Math.abs(m.volume() / rv - 1), `${id} without slits`).toBeLessThan(1e-12);
        } else {
          expect(Math.abs(m.volume() / analytic - 1), `${id} volume`).toBeLessThan(1e-6);
        }
      } finally {
        dispose(m);
      }
    }
  });
});

describe('meshes', () => {
  it('outer segment ≈ 98 g, inner ≈ 29 g at the defaults (export)', () => {
    const { dims, layout } = derive(defaultParams());
    const counts = { inner: dims.inner.count, outer: dims.outer.count };
    const outer = buildPartMesh(k, 'outer-segment', layout!.specs, 'export', copiesOf('outer-segment', counts));
    const inner = buildPartMesh(k, 'inner-segment', layout!.specs, 'export', copiesOf('inner-segment', counts));
    expect(Math.abs(outer.massGrams.solid / 98 - 1)).toBeLessThan(0.05);
    expect(Math.abs(inner.massGrams.solid / 29 - 1)).toBeLessThan(0.05);
    // a vase line has rounded flanks: it fills ~92 % of the solid 0.8 mm wall
    expect(outer.massGrams.estimate / outer.massGrams.solid).toBeCloseTo(vaseFill(0.8), 9);
    expect(outer.copies).toBe(11);
    expect(outer.normals).toBeUndefined();
    expect(outer.indices.length).toBe(outer.triangleCount * 3);
    expect(Math.max(...outer.indices)).toBeLessThan(outer.positions.length / 3);
  });

  it('preview meshes carry one normal per vertex; export meshes are closed (V − E + F = 2 − 2g)', () => {
    const { layout } = derive(defaultParams());
    for (const id of PART_IDS) {
      const pv = buildPartMesh(k, id, layout!.specs, 'preview', 1);
      expect(pv.normals?.length, id).toBe(pv.positions.length);
      const ex = buildPartMesh(k, id, layout!.specs, 'export', 1);
      const V = ex.positions.length / 3;
      const F = ex.triangleCount;
      const E = (3 * F) / 2;
      expect(V - E + F, id).toBe(2 - 2 * expectedGenus(id, layout!.specs));
      expect(ex.massGrams.estimate, id).toBeLessThanOrEqual(ex.massGrams.solid + 1e-9);
    }
  });

  it('mass estimates are within 5 % of Bambu Studio slices (grams per part)', () => {
    // sliced by scripts/slice-check.sh with the PRINT-PLAN settings (X1C / A1 mini, 0.6 nozzle, Generic PETG)
    const sliced: [string, LampParams, Partial<Record<PartId, number>>][] = [
      ['defaults', defaultParams(), { base: 734.17, 'inner-segment': 26.12, 'outer-segment': 87.51, 'top-cover': 130.18, 'fit-test': 20.82 }],
      ['led tube', ledTube(), { base: 889.47, 'top-cover': 131.89 }],
      ['A1 mini', CASES.find((c) => c.name === 'A1 mini lamp')!.params, { base: 416.77, 'outer-segment': 65.25, 'top-cover': 86.42 }],
    ];
    for (const [name, params, grams] of sliced) {
      const { layout } = derive(params);
      for (const [id, g] of Object.entries(grams) as [PartId, number][]) {
        const m = buildPartMesh(k, id, layout!.specs, 'export', 1);
        expect(Math.abs(m.massGrams.estimate / g - 1), `${name} ${id}: ${m.massGrams.estimate.toFixed(1)} g vs ${g} g`).toBeLessThan(0.05);
      }
    }
  });
});
