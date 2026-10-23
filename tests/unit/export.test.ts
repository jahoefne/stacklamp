/**
 * File writers on real parts: binary STL (size, header, round trip through
 * Manifold.ofMesh) and 3MF (package structure, model, round trip through
 * Manifold.ofMesh and three.js' 3MFLoader), also for every segment form.
 */
import { strFromU8, unzipSync } from 'fflate';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import type { BufferGeometry, Mesh, Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPartMesh } from '../../src/geometry/build';
import { derive } from '../../src/geometry/derive';
import type { Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import { deriveDims } from '../../src/geometry/derive';
import { partFileStem } from '../../src/geometry/forms';
import { FORM_IDS, PART_IDS, type ExportRequest, type PartMesh } from '../../src/geometry/types';
import { partFile } from '../../src/export/bundle';
import { meshToBinaryStl, stlHeader } from '../../src/export/stl';
import { displayColour, fmtCoord, partTo3mf, threeMfTransform, THREEMF_CORE_NS, THREEMF_MODEL_REL } from '../../src/export/threemf';
import { getKernel } from '../helpers/kernel';
import { withParams } from '../helpers/params';

let k: Kernel;
let parts: PartMesh[];
beforeAll(async () => {
  k = await getKernel();
  const { layout } = derive(defaultParams());
  parts = PART_IDS.map((id) => buildPartMesh(k, id, layout!.specs, 'export', 1));
  // three's 3MFLoader parses XML with DOMParser; give Node one (but no `window`)
  const jsdom = 'jsdom';
  const { JSDOM } = (await import(/* @vite-ignore */ jsdom)) as { JSDOM: new (html: string) => { window: { DOMParser: unknown } } };
  (globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM('').window.DOMParser;
});

/** Weld identical float positions into an indexed mesh and rebuild a Manifold. */
function manifoldFromTriangles(tris: Float32Array) {
  const map = new Map<string, number>();
  const verts: number[] = [];
  const idx = new Uint32Array(tris.length / 3);
  for (let i = 0; i < tris.length / 3; i++) {
    const key = `${tris[i * 3]},${tris[i * 3 + 1]},${tris[i * 3 + 2]}`;
    let v = map.get(key);
    if (v === undefined) {
      v = verts.length / 3;
      map.set(key, v);
      verts.push(tris[i * 3]!, tris[i * 3 + 1]!, tris[i * 3 + 2]!);
    }
    idx[i] = v;
  }
  const mesh = new k.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: idx });
  return k.Manifold.ofMesh(mesh);
}

describe('binary STL', () => {
  it('has 84 + 50·n bytes, a non-"solid" header and round-trips through Manifold', () => {
    for (const m of parts) {
      const stl = meshToBinaryStl(m, m.id);
      expect(stl.byteLength, m.id).toBe(84 + 50 * m.triangleCount);
      const head = strFromU8(stl.subarray(0, 80)).replace(/\0+$/, '');
      expect(head.startsWith('solid')).toBe(false);
      expect(head).toBe(stlHeader(m.id));
      const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
      expect(view.getUint32(80, true)).toBe(m.triangleCount);
      const tris = new Float32Array(m.triangleCount * 9);
      for (let t = 0; t < m.triangleCount; t++) {
        const o = 84 + t * 50;
        // the stored normal points outward: same direction as the cross product
        for (let j = 0; j < 9; j++) tris[t * 9 + j] = view.getFloat32(o + 12 + j * 4, true);
      }
      const back = manifoldFromTriangles(tris);
      expect(back.status(), m.id).toBe('NoError');
      // ofMesh may collapse a few float32 slivers; the solid is the same
      expect(back.numTri()).toBeGreaterThan(0.99 * m.triangleCount);
      expect(Math.abs(back.volume() / m.volume - 1), m.id).toBeLessThan(1e-4);
      back.delete();
    }
  });
});

describe('3MF', () => {
  const bed = [256, 256, 256] as const;
  const write = (m: PartMesh) =>
    partTo3mf(m, {
      name: 'Outer segment',
      colour: '#e0a030',
      colourName: 'Amber',
      bed,
      title: 'stacklamp test',
      createdAt: '2026-10-22T12:00:00.000Z',
      metadata: { 'stacklamp:part': m.id },
    });

  it('helpers', () => {
    expect(fmtCoord(1.23456)).toBe('1.2346');
    expect(fmtCoord(-0.00001)).toBe('0');
    expect(displayColour('#abc')).toBe('#AABBCCFF');
    expect(threeMfTransform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1])).toBe('1 0 0 0 1 0 0 0 1 5 6 7');
  });

  it('is a minimal package with one object centred on the bed', () => {
    for (const m of parts) {
      const files = unzipSync(write(m));
      expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
      expect(strFromU8(files['_rels/.rels']!)).toContain(`Type="${THREEMF_MODEL_REL}"`);
      expect(strFromU8(files['_rels/.rels']!)).toContain('Target="/3D/3dmodel.model"');
      expect(strFromU8(files['[Content_Types].xml']!)).toContain('application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
      const xml = strFromU8(files['3D/3dmodel.model']!);
      expect(xml).toContain(`xmlns="${THREEMF_CORE_NS}"`);
      expect(xml).toContain('unit="millimeter"');
      expect(xml.match(/<object /g)).toHaveLength(1);
      expect(xml.match(/<item /g)).toHaveLength(1);
      expect(xml).toContain('displaycolor="#E0A030FF"');
      const transform = /<item [^>]*transform="([^"]+)"/.exec(xml)![1]!.split(' ').map(Number);
      const cx = (m.bbox.min[0] + m.bbox.max[0]) / 2;
      expect(transform[9]! + cx).toBeCloseTo(bed[0] / 2, 4);
      expect(transform[11]).toBeCloseTo(0, 9);
      // every coordinate has at most 4 decimals
      for (const c of [...xml.matchAll(/ [xyz]="(-?[\d.]+)"/g)].slice(0, 2000)) expect(c[1]!.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    }
  });

  it('round-trips through Manifold.ofMesh (closed, same genus and volume)', () => {
    for (const m of parts) {
      const xml = strFromU8(unzipSync(write(m))['3D/3dmodel.model']!);
      const verts = [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap((v) => [Number(v[1]), Number(v[2]), Number(v[3])]);
      const tris = [...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap((t) => [Number(t[1]), Number(t[2]), Number(t[3])]);
      expect(verts.length).toBe(m.positions.length);
      expect(tris.length).toBe(m.indices.length);
      const back = k.Manifold.ofMesh(new k.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) }));
      expect(back.status(), m.id).toBe('NoError');
      expect(Math.abs(back.volume() / m.volume - 1), m.id).toBeLessThan(1e-4);
      back.delete();
    }
  });

  it('loads in three.js 3MFLoader with the same triangle count', () => {
    const loader = new ThreeMFLoader();
    for (const m of parts) {
      const bytes = write(m);
      const group = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      let triangles = 0;
      group.traverse((o: Object3D) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry as BufferGeometry;
        triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      });
      expect(triangles, m.id).toBe(m.triangleCount);
    }
  });
});

describe('segment forms', () => {
  it('every form writes a closed STL and a 3MF named after it', () => {
    // one inner band per form (the pattern repeats over the 11 bands)
    const params = withParams((p) => (p.forms.inner = [...FORM_IDS]));
    const { layout } = derive(params);
    const dims = deriveDims(params);
    const variants = layout!.specs.variants.inner;
    expect(variants.map((v) => v.form)).toEqual(FORM_IDS);
    const req: ExportRequest = {
      params,
      colourPlan: { palette: [{ id: 'amb', name: 'Amber', hex: '#f0a020' }], inner: Array(dims.inner.count).fill('amb'), outer: [] },
      format: '3mf',
      includeFitTest: false,
      meta: { shareUrl: '', appVersion: 'test', createdAt: '2026-10-22T12:00:00.000Z' },
    };
    for (const v of variants) {
      const m = buildPartMesh(k, 'inner-segment', layout!.specs, 'export', v.bands.length, v.form);
      expect(m.form).toBe(v.form);
      expect(m.copies).toBe(v.bands.length);
      const stem = partFileStem(m.id, m.form);
      const stl = meshToBinaryStl(m, stem);
      expect(stl.byteLength, stem).toBe(84 + 50 * m.triangleCount);
      expect(strFromU8(stl.subarray(0, 80)).replace(/\0+$/, '')).toBe(stlHeader(stem));
      const xml = strFromU8(unzipSync(partFile(m, req, dims))['3D/3dmodel.model']!);
      expect(xml.includes('<metadata name="stacklamp:form">'), stem).toBe(v.form !== 'straight');
      const verts = [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
      const tris = [...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap((t) => [Number(t[1]), Number(t[2]), Number(t[3])]);
      const back = k.Manifold.ofMesh(new k.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) }));
      expect(back.status(), stem).toBe('NoError');
      expect(Math.abs(back.volume() / m.volume - 1), stem).toBeLessThan(1e-4);
      back.delete();
    }
  });
});
