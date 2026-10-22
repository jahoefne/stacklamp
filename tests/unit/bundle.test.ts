/**
 * The export ZIP: entries, file name, STL variant, fit test, config.json
 * round trip, document snapshots, refusal while there are errors.
 */
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { bundleEntryNames, bundleFileName } from '../../src/export/bundle';
import { parseConfig } from '../../src/export/configJson';
import { deriveDims } from '../../src/geometry/derive';
import type { Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import type { ColourPlan, ExportRequest, ExportStage, LampParams } from '../../src/geometry/types';
import { createHandler, type GeometryHandler } from '../../src/worker/handler';
import { getKernel } from '../helpers/kernel';
import { ledTube, withParams } from '../helpers/params';

const PALETTE = [
  { id: 'clr', name: 'Clear', hex: '#e8eef0' },
  { id: 'amb', name: 'Amber', hex: '#f0a020' },
  { id: 'tea', name: 'Teal', hex: '#109090' },
];

function plan(p: LampParams): ColourPlan {
  const d = deriveDims(p);
  const cycle = (n: number, ids: string[]) => Array.from({ length: n }, (_, i) => ids[i % ids.length]!);
  return { palette: PALETTE, inner: cycle(d.inner.count, ['clr', 'amb']), outer: cycle(d.outer.count, ['amb', 'tea', 'clr']) };
}

function request(p: LampParams, over: Partial<ExportRequest> = {}): ExportRequest {
  return {
    params: p,
    colourPlan: plan(p),
    format: '3mf',
    includeFitTest: false,
    meta: { shareUrl: 'https://jahoefne.github.io/stacklamp/#v=1', appVersion: '0.1.0', createdAt: '2026-10-22T12:00:00.000Z' },
    ...over,
  };
}

let k: Kernel;
let h: GeometryHandler;
beforeAll(async () => {
  k = await getKernel();
  h = createHandler(k);
});

describe('export ZIP', () => {
  it('has exactly the documented entries and file name (3MF)', () => {
    const stages: ExportStage[] = [];
    const req = request(defaultParams());
    const { zip, fileName } = h.exportZip(req, (s, done, total) => {
      stages.push(s);
      expect(done).toBeLessThanOrEqual(total);
    });
    expect(fileName).toBe('stacklamp-L1500-D200-rod-o11x154.5-i11x154.3.zip');
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual([
      'base.3mf',
      'inner-segment.3mf',
      'outer-segment.3mf',
      'top-cover.3mf',
      'plate-clamp.3mf',
      'PRINT-PLAN.md',
      'ASSEMBLY.md',
      'config.json',
    ]);
    expect(stages).toEqual(['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp', 'docs', 'zip', 'zip']);
    for (const name of Object.keys(files).filter((n) => n.endsWith('.3mf'))) {
      expect(Object.keys(unzipSync(files[name]!))).toContain('3D/3dmodel.model');
    }
  });

  it('STL format and the fit test', () => {
    const req = request(defaultParams(), { format: 'stl', includeFitTest: true });
    const files = unzipSync(h.exportZip(req).zip);
    expect(Object.keys(files)).toEqual(bundleEntryNames('stl', true));
    expect(Object.keys(files)).toContain('fit-test.stl');
    for (const name of Object.keys(files).filter((n) => n.endsWith('.stl'))) {
      const b = files[name]!;
      const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(80, true);
      expect(b.byteLength, name).toBe(84 + 50 * n);
    }
    const planMd = strFromU8(files['PRINT-PLAN.md']!);
    expect(planMd).toContain('fit-test.stl');
  });

  it('config.json round-trips through parseConfig', () => {
    const req = request(ledTube());
    const files = unzipSync(h.exportZip(req).zip);
    const text = strFromU8(files['config.json']!);
    const cfg = parseConfig(text);
    expect(cfg.app).toBe('stacklamp');
    expect(cfg.schema).toBe(1);
    expect(cfg.generated).toBe(req.meta.createdAt);
    expect(cfg.shareUrl).toBe(req.meta.shareUrl);
    expect(cfg.params).toEqual(req.params);
    expect(cfg.colourPlan).toEqual(req.colourPlan);
    expect(cfg.derived.outer.count).toBe(11);
    expect(cfg.derived.base.wireRouting).toBe('through-socket');
    expect(parseConfig(JSON.parse(text))).toEqual(cfg);
    expect(() => parseConfig({ ...JSON.parse(text), schema: 2 })).toThrow(/schema/);
    expect(() => parseConfig('{nope')).toThrow(/JSON/);
    const broken = JSON.parse(text) as { params: { core: { kind: string } } };
    broken.params.core.kind = 'candle';
    expect(() => parseConfig(broken)).toThrow(/params\.core\.kind/);
  });

  it('documents (snapshot)', () => {
    const files = unzipSync(h.exportZip(request(defaultParams())).zip);
    expect(strFromU8(files['PRINT-PLAN.md']!)).toMatchSnapshot('PRINT-PLAN.md');
    expect(strFromU8(files['ASSEMBLY.md']!)).toMatchSnapshot('ASSEMBLY.md');
    expect(strFromU8(files['config.json']!)).toMatchSnapshot('config.json');
  });

  it('LED tube documents mention mains and no strip', () => {
    const files = unzipSync(h.exportZip(request(ledTube())).zip);
    const asm = strFromU8(files['ASSEMBLY.md']!);
    expect(asm).toMatch(/mains voltage/);
    expect(asm).not.toMatch(/LED strip\*\*/);
    expect(asm).toMatch(/socket floor/);
    // no metal set screws against a mains tube, no rod-as-heat-sink advice
    expect(asm).not.toMatch(/M4 screws\*\*/);
    expect(asm).toMatch(/Hot glue\*\*/);
    expect(asm).toMatch(/Never drive bare metal screws/);
    expect(asm).not.toMatch(/heat sink/);
  });

  it('locked mode states the cut length', () => {
    const p = withParams((q) => {
      q.segments.heightMode = 'locked';
      q.segments.outerHeight = 140;
    });
    const files = unzipSync(h.exportZip(request(p)).zip);
    const d = deriveDims(p);
    expect(strFromU8(files['PRINT-PLAN.md']!)).toContain(`cut to ${Math.round(d.rod.requiredLength * 100) / 100} mm`);
  });

  it('refuses to export while there are errors', () => {
    const p = withParams((q) => (q.printer = { preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 }));
    expect(() => h.exportZip(request(p))).toThrow(/Fix these problems/);
    const posted: { type: string }[] = [];
    h.handle({ type: 'export', id: 7, req: request(p) }, (r) => posted.push(r));
    expect(posted.map((r) => r.type)).toEqual(['error']);
  });

  it('file name formats heights compactly', () => {
    const p = withParams((q) => (q.core.length = 1234));
    expect(bundleFileName({ params: p }, deriveDims(p))).toMatch(/^stacklamp-L1234-D200-rod-o\d+x[\d.]+-i\d+x[\d.]+\.zip$/);
    // lamps that differ only in tube diameter or core get different names
    const names = new Set(
      [defaultParams(), withParams((q) => (q.tubes.outerOD = 150)), ledTube()].map((q) => bundleFileName({ params: q }, deriveDims(q))),
    );
    expect(names.size).toBe(3);
    expect(bundleFileName({ params: ledTube() }, deriveDims(ledTube()))).toContain('-D200-tube-');
  });
});
