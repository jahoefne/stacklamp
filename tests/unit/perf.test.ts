/**
 * Build times (logged). Hard limits are generous for CI machines; the
 * contract budgets (M-series laptop) are preview ≤ 500 ms for all parts and
 * export-quality base ≤ 2 s.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import { ASSEMBLY_PART_IDS, PART_IDS, type ExportRequest } from '../../src/geometry/types';
import { createHandler } from '../../src/worker/handler';
import { getKernel } from '../helpers/kernel';
import { ledTube } from '../helpers/params';

let k: Kernel;
beforeAll(async () => {
  k = await getKernel();
  // warm up the WASM code paths
  createHandler(k).buildParts(defaultParams(), 'preview');
});

const time = <T>(fn: () => T): [T, number] => {
  const t0 = performance.now();
  const r = fn();
  return [r, performance.now() - t0];
};

describe('performance', () => {
  it('preview build of all parts (cold cache)', () => {
    for (const [name, params] of [
      ['defaults', defaultParams()],
      ['led tube', ledTube()],
    ] as const) {
      const h = createHandler(k);
      const [, ms] = time(() => h.buildParts(params, 'preview', ASSEMBLY_PART_IDS));
      console.log(`preview, all parts, ${name}: ${ms.toFixed(0)} ms ${JSON.stringify(roundAll(h.stats.lastMs))}`);
      expect(ms).toBeLessThan(2000);
    }
  });

  it('export-quality parts; the base under 5 s', () => {
    const h = createHandler(k);
    const [, ms] = time(() => h.buildParts(defaultParams(), 'export', PART_IDS));
    console.log(`export, all parts: ${ms.toFixed(0)} ms ${JSON.stringify(roundAll(h.stats.lastMs))}`);
    expect(h.stats.lastMs['base|export']!).toBeLessThan(5000);
  });

  it('full ZIP export (3MF and STL)', () => {
    for (const format of ['3mf', 'stl'] as const) {
      const req: ExportRequest = {
        params: defaultParams(),
        colourPlan: { palette: [], inner: [], outer: [] },
        format,
        includeFitTest: true,
        meta: { shareUrl: '', appVersion: 'test', createdAt: '2026-10-22T12:00:00.000Z' },
      };
      const [res, ms] = time(() => createHandler(k).exportZip(req));
      console.log(`export ZIP (${format}): ${ms.toFixed(0)} ms, ${(res.zip.byteLength / 1e6).toFixed(2)} MB`);
      expect(ms).toBeLessThan(15000);
    }
  });
});

function roundAll(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]));
}
