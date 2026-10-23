import { describe, expect, it } from 'vitest';
import { BufferGeometry } from 'three';
import { BALL_BANDS, fixtureParts, formFixture, tubeMesh } from './fixtures.test-utils';
import { GeometrySet, geometryFor, keyPart, type MeshKey, meshKey, partMeshToGeometry } from './meshes';

const STRAIGHT_KEYS = ['base', 'inner-segment|straight', 'outer-segment|straight', 'plate-clamp', 'top-cover'];
const FORM_KEYS = ['base', 'inner-segment|ball', 'inner-segment|straight', 'outer-segment|straight', 'plate-clamp', 'top-cover'];

describe('meshKey', () => {
  it('is the part id, plus the form for a segment', () => {
    expect(meshKey('base')).toBe('base');
    expect(meshKey('inner-segment', 'ball')).toBe('inner-segment|ball');
    expect(meshKey('outer-segment', 'straight')).toBe('outer-segment|straight');
    expect(keyPart('inner-segment|twist')).toBe('inner-segment');
    expect(keyPart('top-cover')).toBe('top-cover');
  });
});

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
    expect(g.name).toBe('inner-segment');
  });

  it('names the geometry by its mesh key', () => {
    const g = partMeshToGeometry({ ...tubeMesh('outer-segment', 100, 99.2, 154.5), form: 'flute' });
    expect(g.name).toBe('outer-segment|flute');
    expect(g.userData.form).toBe('flute');
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
    const seen = new Set<MeshKey>();
    for (const id of gs.ids()) gs.get(id)!.addEventListener('dispose', () => seen.add(id));
    return seen;
  };

  it('builds one geometry per part and skips the fit test', () => {
    const gs = new GeometrySet();
    const parts = [...fixtureParts(), tubeMesh('fit-test', 100, 99.2, 36)];
    const { geometries } = gs.swap(parts);
    expect([...geometries.keys()].sort()).toEqual(STRAIGHT_KEYS);
  });

  it('keys a stack with two forms by form: one geometry each, named by its key', () => {
    const { dims, parts } = formFixture();
    const inner = parts.filter((m) => m.id === 'inner-segment');
    expect(inner.map((m) => [m.form, m.copies])).toEqual([
      ['straight', dims.inner.count - BALL_BANDS.length],
      ['ball', BALL_BANDS.length],
    ]);
    const gs = new GeometrySet();
    const { geometries } = gs.swap(parts);
    expect([...geometries.keys()].sort()).toEqual(FORM_KEYS);
    const ball = gs.get('inner-segment|ball')!;
    const straight = gs.get('inner-segment|straight')!;
    expect(ball).not.toBe(straight);
    expect(ball.name).toBe('inner-segment|ball');
    expect(straight.name).toBe('inner-segment|straight');
    // The ball fixture is the wider tube.
    expect(ball.boundingBox!.max.x).toBeGreaterThan(straight.boundingBox!.max.x);
    expect(gs.countsByPart()).toEqual({ base: 1, 'inner-segment': 2, 'outer-segment': 1, 'top-cover': 1, 'plate-clamp': 1 });
  });

  it('builds a repeated key once (no geometry is left behind undisposed)', () => {
    const gs = new GeometrySet();
    const first = { ...tubeMesh('inner-segment', 31, 30.2, 150, 16), form: 'ball' as const };
    const second = { ...tubeMesh('inner-segment', 31, 30.2, 150, 48), form: 'ball' as const };
    gs.swap([first, second]);
    expect(gs.ids()).toEqual(['inner-segment|ball']);
    expect(gs.get('inner-segment|ball')!.userData.triangleCount).toBe(first.triangleCount);
  });

  it('disposes the previous geometries only after the swap', () => {
    const gs = new GeometrySet();
    gs.swap(fixtureParts());
    const old = gs.get('outer-segment|straight')!;
    const seen = disposed(gs);
    const { geometries, disposeOld } = gs.swap(fixtureParts());
    expect(seen.size).toBe(0);
    expect(geometries.get('outer-segment|straight')).not.toBe(old);
    disposeOld();
    expect([...seen].sort()).toEqual(STRAIGHT_KEYS);
  });

  it('disposes every geometry of a stack with forms, also a form that is gone', () => {
    const gs = new GeometrySet();
    gs.swap(formFixture().parts);
    const seen = disposed(gs);
    // Back to all straight: the ball geometry has no successor and must still be released.
    const { geometries, disposeOld } = gs.swap(fixtureParts());
    expect([...geometries.keys()].sort()).toEqual(STRAIGHT_KEYS);
    disposeOld();
    expect([...seen].sort()).toEqual(FORM_KEYS);
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
    expect(seen.has('outer-segment|straight')).toBe(true);
  });

  it('reuses the geometry per form when the same PartMesh object comes back', () => {
    const gs = new GeometrySet();
    const { parts } = formFixture();
    gs.swap(parts);
    const ballMesh = parts.find((m) => m.form === 'ball')!;
    const ball = gs.get('inner-segment|ball');
    const straight = gs.get('inner-segment|straight');
    const seen = disposed(gs);
    // A rebuild where only the straight variant changed: the ball mesh is the cached object.
    const next = formFixture().parts.map((m) => (m.form === 'ball' ? ballMesh : m));
    gs.swap(next).disposeOld();
    expect(gs.get('inner-segment|ball')).toBe(ball);
    expect(gs.get('inner-segment|straight')).not.toBe(straight);
    expect(seen.has('inner-segment|ball')).toBe(false);
    expect(seen.has('inner-segment|straight')).toBe(true);
  });

  it('dispose() releases everything', () => {
    const gs = new GeometrySet();
    gs.swap(fixtureParts());
    const seen = disposed(gs);
    gs.dispose();
    expect(seen.size).toBe(5);
    expect(gs.ids()).toEqual([]);
  });
});

describe('geometryFor', () => {
  const g = (name: string) => Object.assign(new BufferGeometry(), { name });
  const set = (...keys: MeshKey[]) => new Map(keys.map((k) => [k, g(k)]));

  it('gives a band the mesh of its form', () => {
    const m = set('inner-segment|straight', 'inner-segment|ball', 'outer-segment|straight', 'base');
    expect(geometryFor(m, 'inner-segment', 'ball')?.name).toBe('inner-segment|ball');
    expect(geometryFor(m, 'inner-segment', 'straight')?.name).toBe('inner-segment|straight');
    expect(geometryFor(m, 'base')?.name).toBe('base');
  });

  it('falls back to the straight mesh while a form is still being built', () => {
    const m = set('inner-segment|ball', 'inner-segment|straight', 'outer-segment|straight');
    expect(geometryFor(m, 'inner-segment', 'waist')?.name).toBe('inner-segment|straight');
    expect(geometryFor(m, 'outer-segment', 'ball')?.name).toBe('outer-segment|straight');
    // No form known for the band (forms shorter than the placements).
    expect(geometryFor(m, 'inner-segment')?.name).toBe('inner-segment|straight');
  });

  it('then to a formless mesh of the part, then to any of its meshes', () => {
    expect(geometryFor(set('inner-segment'), 'inner-segment', 'ball')?.name).toBe('inner-segment');
    expect(geometryFor(set('outer-segment|ball', 'inner-segment|star'), 'inner-segment', 'ball')?.name).toBe('inner-segment|star');
  });

  it('never borrows another part', () => {
    expect(geometryFor(set('outer-segment|ball', 'base'), 'inner-segment', 'ball')).toBeUndefined();
    expect(geometryFor(set('inner-segment|straight'), 'top-cover')).toBeUndefined();
  });
});
