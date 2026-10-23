/**
 * Every part at preview and export quality for the defaults, the LED tube
 * and the edge cases: a valid single solid (NoError, not empty, one
 * component) with the expected genus (holes), the derived bounding box, and
 * the revolve volume equal to the analytic Pappus volume of its profile. A
 * segment stack is built once per form in use: round forms are exact revolves
 * too; a ribbed form lies between its straight body and its envelope.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPart, buildPartMesh, copiesOf } from '../../src/geometry/build';
import { segmentRMax, segmentRevolveSegments } from '../../src/geometry/build/segment';
import { derive } from '../../src/geometry/derive';
import { dispose, type Kernel, type Manifold } from '../../src/geometry/kernel';
import { FORMS } from '../../src/geometry/forms';
import type { PartSpecs, SegmentSpec } from '../../src/geometry/layout';
import { revolvedPolygonVolume, type Profile } from '../../src/geometry/profile';
import { baseProfile } from '../../src/geometry/profiles/base';
import { clampProfile } from '../../src/geometry/profiles/clamp';
import { coverProfile } from '../../src/geometry/profiles/cover';
import { segmentEnvelope, segmentSize } from '../../src/geometry/profiles/forms';
import { segmentProfile } from '../../src/geometry/profiles/segment';
import { resolution } from '../../src/geometry/quality';
import { PART_IDS, type FormId, type PartId, type Quality } from '../../src/geometry/types';
import { defaultParams } from '../../src/geometry/params';
import { getKernel } from '../helpers/kernel';
import { CASES, ledTube, withNozzle } from '../helpers/params';
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
    case 'plate-clamp':
      return { profile: clampProfile(specs.clamp), n: res.revolve(specs.clamp.radius) };
    case 'inner-segment':
      return { profile: segmentProfile(specs.inner), n: res.revolve(segmentRMax(specs.inner)) };
    case 'outer-segment':
      return { profile: segmentProfile(specs.outer), n: res.revolve(segmentRMax(specs.outer)) };
    case 'fit-test':
      return { profile: segmentProfile(specs.fitTest), n: res.revolve(segmentRMax(specs.fitTest)) };
  }
}

/** What to build of a part: one straight build, or one per variant of a segment stack. */
function builds(id: PartId, specs: PartSpecs): { form?: FormId; spec?: SegmentSpec }[] {
  if (id === 'inner-segment') return specs.variants.inner.map((v) => ({ form: v.form, spec: v.spec }));
  if (id === 'outer-segment') return specs.variants.outer.map((v) => ({ form: v.form, spec: v.spec }));
  return [{}];
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
      for (const { form, spec } of builds(id, specs)) {
        const name = form ? `${id} (${form})` : id;
        const m = buildPart(k, id, specs, q, form);
        try {
          expect(m.status(), name).toBe('NoError');
          expect(m.isEmpty(), name).toBe(false);
          expect(components(m), `${name} components`).toBe(1);
          expect(m.genus(), `${name} genus`).toBe(expectedGenus(id, specs));
          const box = m.boundingBox();
          const size = spec ? segmentSize(spec) : dims.fit[id].size;
          for (let a = 0; a < 3; a++) {
            const extent = box.max[a]! - box.min[a]!;
            // a six-point star has ridges on the x axis but none on the y axis: narrower across y
            if (form === 'star' && a === 1) expect(extent, `${name} size[1]`).toBeLessThanOrEqual(size[1]! + 0.05);
            else expect(Math.abs(extent - size[a]!), `${name} size[${a}]`).toBeLessThanOrEqual(0.05);
          }
          expect(Math.abs(box.min[2]!), `${name} on the bed`).toBeLessThan(1e-6);
          expect(Math.abs(box.min[0]! + box.max[0]!), `${name} centred x`).toBeLessThan(0.05);
          expect(Math.abs(box.min[1]! + box.max[1]!), `${name} centred y`).toBeLessThan(0.05);
          if (spec) segmentVolume(m, spec, q, name);
          else partVolume(m, id, specs, q);
        } finally {
          dispose(m);
        }
      }
    }
    // the stack's footprint (bed fit) is its widest variant in use
    for (const [id, stack] of [
      ['inner-segment', 'inner'],
      ['outer-segment', 'outer'],
    ] as const) {
      const used = specs.variants[stack].filter((v) => v.bands.length > 0);
      const widest = Math.max(dims[stack].socketOD, ...used.map((v) => segmentSize(v.spec)[0]));
      expect(dims.fit[id].size[0], id).toBeCloseTo(widest, 9);
      expect(dims[stack].maxOD, id).toBeCloseTo(widest, 9);
    }
  });
});

/** A segment's volume: the Pappus volume of a round form, between straight body and envelope for a ribbed one. */
function segmentVolume(m: Manifold, spec: SegmentSpec, q: Quality, name: string): void {
  const n = segmentRevolveSegments(spec, resolution(q));
  const volume = m.volume();
  const profile = revolvedPolygonVolume(segmentProfile(spec), n);
  if (FORMS[spec.form].round) {
    expect(Math.abs(volume / profile - 1), `${name} volume`).toBeLessThan(1e-6);
  } else {
    expect(volume, `${name} above the straight body`).toBeGreaterThan(profile);
    expect(volume, `${name} within its envelope`).toBeLessThan(revolvedPolygonVolume(segmentEnvelope(spec), n));
  }
}

/** Any other part's volume: its revolve's Pappus volume, less what the cutters take. */
function partVolume(m: Manifold, id: PartId, specs: PartSpecs, q: Quality): void {
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
}

describe('meshes', () => {
  it('outer segment ≈ 98 g, inner ≈ 29 g at the defaults (export)', () => {
    const { dims, layout } = derive(defaultParams());
    const counts = { inner: dims.inner.count, outer: dims.outer.count };
    const outer = buildPartMesh(k, 'outer-segment', layout!.specs, 'export', copiesOf('outer-segment', counts));
    const inner = buildPartMesh(k, 'inner-segment', layout!.specs, 'export', copiesOf('inner-segment', counts));
    expect(Math.abs(outer.massGrams.solid / 98 - 1)).toBeLessThan(0.05);
    expect(Math.abs(inner.massGrams.solid / 29 - 1)).toBeLessThan(0.05);
    // a vase line has rounded flanks: it fills ~92 % of the solid 0.8 mm wall at 0.3 mm layers
    expect(outer.massGrams.estimate / outer.massGrams.solid).toBeCloseTo(vaseFill(0.8, 0.3), 9);
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

  it('every form variant: a closed export mesh (V − E + F = 0) with its form, copies and vase estimate', () => {
    const { layout } = derive(CASES.find((c) => c.name === 'mixed forms')!.params);
    const specs = layout!.specs;
    for (const [id, stack] of [
      ['inner-segment', 'inner'],
      ['outer-segment', 'outer'],
    ] as const) {
      expect(specs.variants[stack].length, stack).toBeGreaterThan(2);
      for (const v of specs.variants[stack]) {
        const ex = buildPartMesh(k, id, specs, 'export', v.bands.length, v.form);
        const V = ex.positions.length / 3;
        const F = ex.triangleCount;
        expect(V - (3 * F) / 2 + F, `${id} ${v.form}`).toBe(0);
        expect(ex.form).toBe(v.form);
        expect(ex.copies).toBe(v.bands.length);
        expect(ex.massGrams.estimate / ex.massGrams.solid).toBeCloseTo(vaseFill(v.spec.wall, v.spec.layer), 9);
      }
    }
  });

  it('mass estimates are within 5 % of Bambu Studio slices (grams per part)', () => {
    // sliced by scripts/slice-check.sh with the PRINT-PLAN settings (X1C / A1 mini, Generic PETG; the
    // nozzle's machine and Standard process: 0.6 unless the case says otherwise)
    const sliced: [string, LampParams, Partial<Record<PartId, number>>][] = [
      ['defaults', defaultParams(), { base: 768.65, 'inner-segment': 26.12, 'outer-segment': 87.51, 'top-cover': 130.18, 'plate-clamp': 7.5, 'fit-test': 20.82 }],
      ['led tube', ledTube(), { base: 922.54, 'top-cover': 131.89 }],
      ['A1 mini', CASES.find((c) => c.name === 'A1 mini lamp')!.params, { base: 437.02, 'outer-segment': 65.25, 'top-cover': 86.42 }],
      ['nozzle 0.4', withNozzle('0.4'), { base: 718.46, 'inner-segment': 16.3, 'outer-segment': 54.53, 'top-cover': 124.05, 'plate-clamp': 7.29 }],
      ['nozzle 0.8', withNozzle('0.8'), { base: 834.45, 'inner-segment': 32.36, 'outer-segment': 108.4, 'top-cover': 143.84, 'plate-clamp': 7.13 }],
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
