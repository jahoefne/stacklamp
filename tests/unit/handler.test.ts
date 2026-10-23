/**
 * Worker handler (no worker globals, runs in Node): PartMesh cache keyed by
 * part + form + quality + spec, one mesh per form of a segment stack, fresh
 * transferable buffers, responses and progress.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import type { ExportStage, PartId, PartMesh } from '../../src/geometry/types';
import { DEFAULT_CACHE_SIZE, createHandler, meshTransfers } from '../../src/worker/handler';
import type { WorkerResponse } from '../../src/worker/protocol';
import { getKernel } from '../helpers/kernel';
import { withParams } from '../helpers/params';

/** Inner bands fitted from ['ball', 'straight', 'ball']: 7 balls and 4 straight over 11 segments. */
const ballLamp = () => withParams((p) => (p.forms.inner = ['ball', 'straight', 'ball']));

let k: Kernel;
beforeAll(async () => {
  k = await getKernel();
});

describe('GeometryHandler', () => {
  it('rebuilds only the cover when only cover parameters change', () => {
    const h = createHandler(k);
    h.buildParts(defaultParams(), 'preview');
    expect(h.stats).toMatchObject({ hits: 0, misses: 5 });
    h.buildParts(
      withParams((p) => {
        p.cover.slitWidth = 4;
        p.cover.outerSlits = 12;
      }),
      'preview',
    );
    expect(h.stats).toMatchObject({ hits: 4, misses: 6 });
    // printer preset and colour-irrelevant fields hit everything
    h.buildParts(withParams((p) => (p.printer.preset = 'custom')), 'preview');
    expect(h.stats).toMatchObject({ hits: 9, misses: 6 });
    // quality is part of the key
    h.buildParts(defaultParams(), 'export');
    expect(h.stats.misses).toBe(11);
  });

  it('keeps 16 meshes by default', () => {
    expect(DEFAULT_CACHE_SIZE).toBe(16);
    // a lamp with forms at both qualities: 6 meshes each, all still cached on the next round
    const h = createHandler(k);
    for (const q of ['preview', 'export'] as const) h.buildParts(ballLamp(), q);
    expect(h.cacheKeys).toHaveLength(12);
    const misses = h.stats.misses;
    for (const q of ['preview', 'export'] as const) h.buildParts(ballLamp(), q);
    expect(h.stats.misses).toBe(misses);
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
    expect(ids).toEqual(['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp']);
    expect(a.map((m) => m.copies)).toEqual([1, 11, 11, 1, 1]);
    expect(a.every((m) => m.quality === 'preview' && m.normals !== undefined)).toBe(true);
    const transfers = meshTransfers(a);
    expect(transfers).toHaveLength(15);
    expect(new Set(transfers).size).toBe(15);
  });

  it('builds one mesh per form of a stack, in order of first appearance, and caches each', () => {
    const h = createHandler(k);
    const seen: [PartId, number][] = [];
    const parts = h.buildParts(ballLamp(), 'preview', undefined, (id, i) => seen.push([id, i]));
    expect(parts.map((m) => [m.id, m.form ?? null, m.copies])).toEqual([
      ['base', null, 1],
      ['inner-segment', 'ball', 7],
      ['inner-segment', 'straight', 4],
      ['outer-segment', 'straight', 11],
      ['top-cover', null, 1],
      ['plate-clamp', null, 1],
    ]);
    expect(seen).toEqual(parts.map((m, i) => [m.id, i]));
    expect(h.stats).toMatchObject({ hits: 0, misses: 6 });
    expect(Object.keys(h.stats.lastMs)).toEqual(
      expect.arrayContaining(['inner-segment#ball|preview', 'inner-segment|preview', 'outer-segment|preview']),
    );
    expect(Object.keys(h.stats.lastMs)).not.toContain('inner-segment#straight|preview');
    // the same lamp again: every mesh from the cache, with fresh buffers
    const again = h.buildParts(ballLamp(), 'preview');
    expect(h.stats).toMatchObject({ hits: 6, misses: 6 });
    expect(again.map((m) => [m.id, m.form ?? null, m.copies])).toEqual(parts.map((m) => [m.id, m.form ?? null, m.copies]));
    expect(again[1]!.positions).not.toBe(parts[1]!.positions);
    // the default lamp shares the straight inner mesh: only base … clamp hit, nothing rebuilt
    h.buildParts(defaultParams(), 'preview');
    expect(h.stats).toMatchObject({ hits: 11, misses: 6 });
    // a different pattern with the same forms reuses both meshes with new copy counts
    const swapped = h.buildParts(withParams((p) => (p.forms.inner = ['straight', 'ball'])), 'preview');
    expect(h.stats.misses).toBe(6);
    expect(swapped.filter((m) => m.id === 'inner-segment').map((m) => [m.form, m.copies])).toEqual([
      ['straight', 6],
      ['ball', 5],
    ]);
  });

  it('counts export progress per mesh', () => {
    const h = createHandler(k);
    const steps: [ExportStage, number, number][] = [];
    h.exportZip(
      {
        params: ballLamp(),
        colourPlan: { palette: [], inner: [], outer: [] },
        format: '3mf',
        includeFitTest: true,
        meta: { shareUrl: '', appVersion: 'test', createdAt: '2026-10-22T12:00:00.000Z' },
      },
      (stage, done, total) => steps.push([stage, done, total]),
    );
    // 7 meshes (two inner forms) + docs + zip
    expect(steps.map((s) => s[0])).toEqual(['base', 'inner-segment', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp', 'fit-test', 'docs', 'zip', 'zip']);
    expect(steps.every((s) => s[2] === 9)).toBe(true);
    expect(steps.map((s) => s[1])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
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
    expect(types.filter((t) => t === 'progress')).toHaveLength(9);
    expect(types.at(-1)).toBe('zip');
    const zip = posted.at(-1)!;
    expect(zip.res).toMatchObject({ id: 2, fileName: 'stacklamp-L1500-D200-rod-o11x154.5-i11x154.3.zip' });
    expect(zip.transfer).toHaveLength(1);
    posted.length = 0;
    h.handle({ type: 'build', id: 3, params: { nonsense: true } as never, quality: 'preview' }, post);
    expect(posted.map((p) => p.res)).toEqual([{ type: 'error', id: 3, error: expect.any(String) }]);
  });
});
