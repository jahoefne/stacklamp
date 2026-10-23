/**
 * WASM memory: every Manifold and CrossSection the engine creates is deleted
 * again, after successful builds and exports and when a build throws.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { BuildError, buildPartMesh } from '../../src/geometry/build';
import { derive } from '../../src/geometry/derive';
import { liveObjects, scoped, type Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import { assemblySection, overlapArea } from '../../src/geometry/section';
import { PART_IDS, type ExportRequest } from '../../src/geometry/types';
import { createHandler } from '../../src/worker/handler';
import { getKernel, trackKernelObjects } from '../helpers/kernel';
import { ledTube, withParams } from '../helpers/params';

let k: Kernel;
beforeAll(async () => {
  k = await getKernel();
});

/** Several forms on both stacks: several meshes per stack. */
const formsLamp = () =>
  withParams((p) => {
    p.forms.inner = ['ball', 'straight', 'twist'];
    p.forms.outer = ['barrel', 'star', 'straight', 'flute'];
  });

const request = (params = defaultParams()): ExportRequest => ({
  params,
  colourPlan: { palette: [{ id: 'clr', name: 'Clear', hex: '#e8eef0' }], inner: Array(11).fill('clr'), outer: Array(11).fill('clr') },
  format: '3mf',
  includeFitTest: true,
  meta: { shareUrl: '', appVersion: 'test', createdAt: '2026-10-22T12:00:00.000Z' },
});

describe('leaks', () => {
  it('builds, exports and section checks free every WASM object', () => {
    const tracker = trackKernelObjects(k);
    try {
      const before = tracker.live();
      const scopedBefore = liveObjects();
      const h = createHandler(k);
      for (const params of [defaultParams(), ledTube(), formsLamp()]) {
        h.buildParts(params, 'preview', PART_IDS);
        h.buildParts(params, 'export', PART_IDS);
        h.exportZip({ ...request(params), format: 'stl' });
        const pieces = assemblySection(params);
        overlapArea(k, pieces[0]!.polygon, pieces[1]!.polygon);
      }
      expect(tracker.live()).toBe(before);
      expect(liveObjects()).toBe(scopedBefore);
    } finally {
      tracker.restore();
    }
  });

  it('a build that throws frees everything it created', () => {
    // the prototype that defines status() on real instances
    const probe = k.Manifold.cube([1, 1, 1]);
    let proto = Object.getPrototypeOf(probe) as { status(): string };
    probe.delete();
    while (proto && !Object.hasOwn(proto, 'status')) proto = Object.getPrototypeOf(proto) as { status(): string };
    const tracker = trackKernelObjects(k);
    const status = proto.status;
    try {
      const before = tracker.live();
      const scopedBefore = liveObjects();
      const { layout } = derive(defaultParams());
      proto.status = () => 'NotManifold';
      for (const id of PART_IDS) {
        expect(() => buildPartMesh(k, id, layout!.specs, 'preview', 1)).toThrow(BuildError);
      }
      // every form variant of both stacks frees what it created too
      const specs = derive(formsLamp()).layout!.specs;
      for (const [id, variants] of [
        ['inner-segment', specs.variants.inner],
        ['outer-segment', specs.variants.outer],
      ] as const) {
        for (const v of variants) expect(() => buildPartMesh(k, id, specs, 'preview', v.bands.length, v.form)).toThrow(BuildError);
      }
      proto.status = status;
      expect(() =>
        scoped(k, (s) => {
          s.add(k.Manifold.cube([1, 1, 1]));
          s.keep(s.add(k.Manifold.sphere(2, 16)));
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(tracker.live()).toBe(before);
      expect(liveObjects()).toBe(scopedBefore);
    } finally {
      proto.status = status;
      tracker.restore();
    }
  });

  it('the handler reports a failed build as an error response and leaks nothing', () => {
    const tracker = trackKernelObjects(k);
    try {
      const before = tracker.live();
      const h = createHandler(k);
      const bad = defaultParams();
      bad.segments.rimLeadIn = 40; // impossible rim: the profile assertion throws
      const posted: unknown[] = [];
      h.handle({ type: 'build', id: 1, params: bad, quality: 'preview' }, (r) => posted.push(r));
      expect(posted).toHaveLength(1);
      expect((posted[0] as { type: string }).type).toBe('error');
      expect(tracker.live()).toBe(before);
    } finally {
      tracker.restore();
    }
  });
});
