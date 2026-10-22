import { describe, expect, it } from 'vitest';
import { fixtureParts, tubeMesh } from './fixtures.test-utils';
import { GeometrySet, partMeshToGeometry } from './meshes';

describe('partMeshToGeometry', () => {
  it('derives creased normals when the worker sent none', () => {
    const m = tubeMesh('outer-segment', 100, 99.2, 154.5, 64);
    const g = partMeshToGeometry(m);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    expect(nor).toBeDefined();
    // toCreasedNormals de-indexes: one vertex per triangle corner.
    expect(g.index).toBeNull();
    expect(pos.count).toBe(m.triangleCount * 3);
    expect(nor.count).toBe(pos.count);
    // Normals are unit length and smooth around the circumference (64 facets < 30° crease).
    for (let i = 0; i < nor.count; i += 97) {
      expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 4);
    }
    // Outer-wall vertices get (almost) radial normals: smoothed across facets, not faceted.
    let checked = 0;
    for (let i = 0; i < pos.count && checked < 20; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const r = Math.hypot(x, y);
      if (Math.abs(r - 100) < 1e-3 && Math.abs(nor.getZ(i)) < 1e-6) {
        // cos(2°): a faceted normal would be off by up to 2.8° (half a 5.6° facet).
        expect((nor.getX(i) * x + nor.getY(i) * y) / r).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps the worker normals and the Uint32 index when present', () => {
    const m = tubeMesh('inner-segment', 30, 29.2, 154.3, 32, true);
    const g = partMeshToGeometry(m);
    expect(g.index).not.toBeNull();
    expect(g.index!.array).toBeInstanceOf(Uint32Array);
    expect(g.index!.count).toBe(m.triangleCount * 3);
    expect(g.getAttribute('position').array).toBe(m.positions);
    expect(g.getAttribute('normal').array).toBe(m.normals);
    expect(g.userData.partId).toBe('inner-segment');
  });

  it('computes a bounding sphere around the print-frame mesh', () => {
    const g = partMeshToGeometry(tubeMesh('top-cover', 102.65, 12, 3));
    expect(g.boundingSphere).not.toBeNull();
    expect(g.boundingSphere!.radius).toBeGreaterThanOrEqual(102.65 - 1e-3);
    expect(g.boundingSphere!.center.z).toBeCloseTo(1.5, 3);
  });
});

describe('GeometrySet', () => {
  const disposed = (gs: GeometrySet) => {
    const seen = new Set<string>();
    for (const id of gs.ids()) gs.get(id)!.addEventListener('dispose', () => seen.add(id));
    return seen;
  };

  it('builds one geometry per part and skips the fit test', () => {
    const gs = new GeometrySet();
    const parts = [...fixtureParts(), tubeMesh('fit-test', 100, 99.2, 36)];
    const { geometries } = gs.swap(parts);
    expect([...geometries.keys()].sort()).toEqual(['base', 'inner-segment', 'outer-segment', 'top-cover']);
  });

  it('disposes the previous geometries only after the swap', () => {
    const gs = new GeometrySet();
    gs.swap(fixtureParts());
    const old = gs.get('outer-segment')!;
    const seen = disposed(gs);
    const { geometries, disposeOld } = gs.swap(fixtureParts());
    expect(seen.size).toBe(0);
    expect(geometries.get('outer-segment')).not.toBe(old);
    disposeOld();
    expect([...seen].sort()).toEqual(['base', 'inner-segment', 'outer-segment', 'top-cover']);
  });

  it('reuses the geometry of an identical PartMesh object', () => {
    const gs = new GeometrySet();
    const parts = fixtureParts();
    gs.swap(parts);
    const before = gs.get('base');
    const seen = disposed(gs);
    const next = [parts[0]!, ...fixtureParts().slice(1)];
    gs.swap(next).disposeOld();
    expect(gs.get('base')).toBe(before);
    expect(seen.has('base')).toBe(false);
    expect(seen.has('outer-segment')).toBe(true);
  });

  it('dispose() releases everything', () => {
    const gs = new GeometrySet();
    gs.swap(fixtureParts());
    const seen = disposed(gs);
    gs.dispose();
    expect(seen.size).toBe(4);
    expect(gs.ids()).toEqual([]);
  });
});
