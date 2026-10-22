/**
 * Worker handler (no worker globals, runs in Node): PartMesh cache keyed by
 * part + quality + spec, fresh transferable buffers, responses and progress.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import type { PartMesh } from '../../src/geometry/types';
import { createHandler, meshTransfers } from '../../src/worker/handler';
import type { WorkerResponse } from '../../src/worker/protocol';
import { getKernel } from '../helpers/kernel';
import { withParams } from '../helpers/params';

let k: Kernel;
beforeAll(async () => {
  k = await getKernel();
});

describe('GeometryHandler', () => {
  it('rebuilds only the cover when only cover parameters change', () => {
    const h = createHandler(k);
    h.buildParts(defaultParams(), 'preview');
    expect(h.stats).toMatchObject({ hits: 0, misses: 4 });
    h.buildParts(
      withParams((p) => {
        p.cover.slitWidth = 4;
        p.cover.outerSlits = 12;
      }),
      'preview',
    );
    expect(h.stats).toMatchObject({ hits: 3, misses: 5 });
    // printer preset and colour-irrelevant fields hit everything
    h.buildParts(withParams((p) => (p.printer.preset = 'custom')), 'preview');
    expect(h.stats).toMatchObject({ hits: 7, misses: 5 });
    // quality is part of the key
    h.buildParts(defaultParams(), 'export');
    expect(h.stats.misses).toBe(9);
  });

  it('is an LRU of 8 entries', () => {
    const h = createHandler(k, 8);
    for (const L of [1000, 1100, 1200, 1300]) h.buildParts(withParams((p) => (p.core.length = L)), 'preview');
    expect(h.cacheKeys).toHaveLength(8);
    // the base (same spec for every L) stayed hot; the oldest segments were evicted
    const misses = h.stats.misses;
    h.buildParts(withParams((p) => (p.core.length = 1000)), 'preview');
    expect(h.stats.misses - misses).toBeGreaterThanOrEqual(2);
  });

  it('returns fresh buffers with the current copy count', () => {
    const h = createHandler(k);
    const a = h.buildParts(defaultParams(), 'preview');
    const b = h.buildParts(defaultParams(), 'preview');
    for (let i = 0; i < a.length; i++) {
      expect(b[i]!.positions).not.toBe(a[i]!.positions);
      expect(b[i]!.positions.buffer).not.toBe(a[i]!.positions.buffer);
      expect(Array.from(b[i]!.positions.subarray(0, 30))).toEqual(Array.from(a[i]!.positions.subarray(0, 30)));
    }
    const ids = a.map((m) => m.id);
    expect(ids).toEqual(['base', 'inner-segment', 'outer-segment', 'top-cover']);
    expect(a.map((m) => m.copies)).toEqual([1, 11, 11, 1]);
    expect(a.every((m) => m.quality === 'preview' && m.normals !== undefined)).toBe(true);
    const transfers = meshTransfers(a);
    expect(transfers).toHaveLength(12);
    expect(new Set(transfers).size).toBe(12);
  });

  it('posts parts, progress and errors', () => {
    const h = createHandler(k);
    const posted: { res: WorkerResponse; transfer: ArrayBuffer[] }[] = [];
    const post = (res: WorkerResponse, transfer: ArrayBuffer[]) => posted.push({ res, transfer });
    h.handle({ type: 'build', id: 1, params: defaultParams(), quality: 'preview' }, post);
    expect(posted[0]!.res.type).toBe('parts');
    const parts = (posted[0]!.res as { parts: PartMesh[] }).parts;
    expect(posted[0]!.transfer).toHaveLength(parts.length * 3);
    posted.length = 0;
    h.handle(
      {
        type: 'export',
        id: 2,
        req: {
          params: defaultParams(),
          colourPlan: { palette: [], inner: [], outer: [] },
          format: '3mf',
          includeFitTest: true,
          meta: { shareUrl: '', appVersion: 'test', createdAt: '2026-10-22T12:00:00.000Z' },
        },
      },
      post,
    );
    const types = posted.map((p) => p.res.type);
    expect(types.filter((t) => t === 'progress')).toHaveLength(8);
    expect(types.at(-1)).toBe('zip');
    const zip = posted.at(-1)!;
    expect(zip.res).toMatchObject({ id: 2, fileName: 'stacklamp-L1500-D200-rod-o11x154.5-i11x154.3.zip' });
    expect(zip.transfer).toHaveLength(1);
    posted.length = 0;
    h.handle({ type: 'build', id: 3, params: { nonsense: true } as never, quality: 'preview' }, post);
    expect(posted.map((p) => p.res)).toEqual([{ type: 'error', id: 3, error: expect.any(String) }]);
  });
});
