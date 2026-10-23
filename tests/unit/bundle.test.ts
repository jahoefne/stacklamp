/**
 * The export ZIP: entries, file name, STL variant, fit test, config.json
 * round trip, document snapshots, refusal while there are errors; segment
 * forms (one file per form, per-form colours, the segment order, the BOM).
 */
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { bundleEntryNames, bundleFileName, partFileName } from '../../src/export/bundle';
import { parseConfig } from '../../src/export/configJson';
import { computeBom } from '../../src/geometry/bom';
import { deriveDims } from '../../src/geometry/derive';
import type { Kernel } from '../../src/geometry/kernel';
import { defaultParams } from '../../src/geometry/params';
import type { ColourPlan, ExportRequest, ExportStage, LampParams, PartMesh } from '../../src/geometry/types';
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
    const p = withParams((q) => (q.printer = { ...q.printer, preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 }));
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

/** Rows of the first Markdown table after the line `heading` (header and separator dropped). */
function tableAfter(md: string, heading: string): string[][] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) rows.push(line.slice(1, -1).split(' | ').map((c) => c.trim()));
    else if (rows.length > 0) break;
  }
  return rows.slice(2);
}

const modelXml = (pkg: Uint8Array): string => strFromU8(unzipSync(pkg)['3D/3dmodel.model']!);

describe('export ZIP with segment forms', () => {
  // inner bands from ['ball', 'straight', 'ball'] over 11: ball at 0 2 3 5 6 8 9, straight at 1 4 7 10
  const balls = () => withParams((p) => (p.forms.inner = ['ball', 'straight', 'ball']));
  const BALL_BANDS = [0, 2, 3, 5, 6, 8, 9];

  it('entry names: one file per form, straight keeps the plain name', () => {
    expect(partFileName('inner-segment', '3mf')).toBe('inner-segment.3mf');
    expect(partFileName('inner-segment', '3mf', 'straight')).toBe('inner-segment.3mf');
    expect(partFileName('outer-segment', 'stl', 'twist')).toBe('outer-segment-twist.stl');
    const plain = bundleEntryNames('3mf', false);
    expect(plain).toEqual(['base.3mf', 'inner-segment.3mf', 'outer-segment.3mf', 'top-cover.3mf', 'plate-clamp.3mf', 'PRINT-PLAN.md', 'ASSEMBLY.md', 'config.json']);
    const d = deriveDims(defaultParams());
    expect(bundleEntryNames('3mf', false, { inner: d.inner.forms, outer: d.outer.forms })).toEqual(plain);
    expect(bundleEntryNames('3mf', false, { inner: [], outer: [] })).toEqual(plain);
    expect(bundleEntryNames('stl', true, { inner: ['ball', 'straight', 'ball'], outer: ['star'] })).toEqual([
      'base.stl',
      'inner-segment-ball.stl',
      'inner-segment.stl',
      'outer-segment-star.stl',
      'top-cover.stl',
      'plate-clamp.stl',
      'fit-test.stl',
      'PRINT-PLAN.md',
      'ASSEMBLY.md',
      'config.json',
    ]);
  });

  it('writes each form as its own file with its own colour, name and metadata', () => {
    const p = balls();
    const req = request(p);
    const stages: ExportStage[] = [];
    const files = unzipSync(h.exportZip(req, (s) => stages.push(s)).zip);
    const d = deriveDims(p);
    expect(Object.keys(files)).toEqual(bundleEntryNames('3mf', false, { inner: d.inner.forms, outer: d.outer.forms }));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['inner-segment.3mf', 'inner-segment-ball.3mf']));
    expect(stages).toEqual(['base', 'inner-segment', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp', 'docs', 'zip', 'zip']);
    // ball bands: Clear × 4, Amber × 3 → Clear; straight bands: Amber × 2, Clear × 2 → Amber (first seen)
    const ball = modelXml(files['inner-segment-ball.3mf']!);
    expect(ball).toContain('<metadata name="stacklamp:form">ball</metadata>');
    expect(ball).toContain('<metadata name="stacklamp:copies">7</metadata>');
    expect(ball).toContain('name="Inner segment (Ball)"');
    expect(ball).toContain('displaycolor="#E8EEF0FF"');
    const straight = modelXml(files['inner-segment.3mf']!);
    expect(straight).not.toContain('stacklamp:form');
    expect(straight).toContain('<metadata name="stacklamp:copies">4</metadata>');
    expect(straight).toContain('name="Inner segment"');
    expect(straight).toContain('displaycolor="#F0A020FF"');
    expect(modelXml(files['outer-segment.3mf']!)).not.toContain('stacklamp:form');
  });

  it('STL files are named after the form too', () => {
    const files = unzipSync(h.exportZip(request(balls(), { format: 'stl' })).zip);
    expect(Object.keys(files)).toEqual(bundleEntryNames('stl', false, { inner: ['ball', 'straight'] }));
    expect(strFromU8(files['inner-segment-ball.stl']!.subarray(0, 80)).replace(/\0+$/, '')).toBe('stacklamp inner-segment-ball binary STL, mm');
  });

  it('the print plan lists one row per file and the segment order; the assembly follows it', () => {
    const p = balls();
    const req = request(p);
    const files = unzipSync(h.exportZip(req).zip);
    const md = strFromU8(files['PRINT-PLAN.md']!);
    const rows = tableAfter(md, '## Parts');
    expect(rows.map((r) => r.slice(0, 4))).toEqual([
      ['base.3mf', 'Base', '1', 'any (opaque recommended)'],
      ['inner-segment-ball.3mf', 'Inner segment (Ball)', '7', 'Clear × 4, Amber × 3'],
      ['inner-segment.3mf', 'Inner segment', '4', 'Amber × 2, Clear × 2'],
      ['outer-segment.3mf', 'Outer segment', '11', 'Amber × 4, Teal × 4, Clear × 3'],
      ['top-cover.3mf', 'Top cover', '1', 'any (opaque recommended)'],
      ['plate-clamp.3mf', 'Plate clamp', '1', 'any (opaque recommended)'],
    ]);
    expect(tableAfter(md, `## Printer fit — Bambu Lab P1S / X1C / A1, 256 × 256 × 250 mm`).map((r) => r[0])).toEqual([
      'Base',
      'Inner segment (Ball)',
      'Inner segment',
      'Outer segment',
      'Top cover',
      'Plate clamp',
    ]);
    // the summary names the forms of the stack that has them
    const summary = tableAfter(md, '## Summary');
    expect(summary.find((r) => r[0] === 'Inner stack')![1]).toMatch(/; forms Ball × 7, Straight × 4, Ø [\d.]+ mm at the widest$/);
    expect(summary.find((r) => r[0] === 'Outer stack')![1]).not.toContain('forms');
    // the segment order replaces the colour order: band, form, colour, file per stack
    expect(md).not.toContain('### Colour order');
    const order = md.slice(md.indexOf('### Segment order (bottom → top)'));
    const inner = tableAfter(order, '**Inner stack**');
    expect(inner).toHaveLength(11);
    inner.forEach((r, k) => {
      const ball = BALL_BANDS.includes(k);
      expect(r).toEqual([String(k + 1), ball ? 'Ball' : 'Straight', k % 2 === 0 ? 'Clear' : 'Amber', ball ? 'inner-segment-ball.3mf' : 'inner-segment.3mf']);
    });
    const outer = tableAfter(order, '**Outer stack**');
    expect(outer.map((r) => r[1])).toEqual(Array(11).fill('Straight'));
    expect(outer.map((r) => r[2])).toEqual(req.colourPlan.outer.map((id) => ({ amb: 'Amber', tea: 'Teal', clr: 'Clear' })[id]));
    // still spiral vase; no ridged form, so no note about ridges
    expect(md).toMatch(/- Segments with a form print the same way, in spiral vase mode and without supports: .* 45° from vertical\./);
    expect(md).not.toContain('bodies are not round');
    // filament per colour still adds up to every band
    const colourRows = tableAfter(md, '### Filament per colour');
    expect(colourRows.reduce((a, r) => a + Number(r[1]), 0)).toBe(11);
    const asm = strFromU8(files['ASSEMBLY.md']!);
    expect(asm).toContain('following the segment order in PRINT-PLAN.md (the form and colour of every band, band 1 at the bottom)');
    expect(asm).not.toContain('in the colour order of PRINT-PLAN.md');
    expect(asm).toContain('11 × inner segment, 11 × outer segment');
  });

  it('ridged forms get a note in the vase settings, and the segment order shows without a colour plan', () => {
    const p = withParams((q) => {
      q.forms.outer = ['star', 'straight', 'flute'];
      q.forms.inner = ['twist'];
    });
    const req = request(p, { colourPlan: { palette: [], inner: [], outer: [] } });
    const md = strFromU8(unzipSync(h.exportZip(req).zip)['PRINT-PLAN.md']!);
    expect(md).toContain('- Star, Fluted and Twist bodies are not round: the single vase line traces their ridges');
    const order = md.slice(md.indexOf('### Segment order (bottom → top)'));
    expect(tableAfter(order, '**Outer stack**').slice(0, 3)).toEqual([
      ['1', 'Star', '–', 'outer-segment-star.3mf'],
      ['2', 'Straight', '–', 'outer-segment.3mf'],
      ['3', 'Fluted', '–', 'outer-segment-flute.3mf'],
    ]);
    expect(tableAfter(order, '**Inner stack**').every((r) => r[1] === 'Twist' && r[3] === 'inner-segment-twist.3mf')).toBe(true);
    // a stack whose bands all share one non-straight form: one file, every band
    expect(tableAfter(md, '## Parts').find((r) => r[0] === 'inner-segment-twist.3mf')![2]).toBe('11');
    expect(md).not.toContain('Slicers ignore the colours');
  });

  it('the BOM has one row per mesh and weighs each band with its own form', () => {
    const p = balls();
    const dims = deriveDims(p);
    const parts = h.buildParts(p, 'preview');
    // make the forms distinguishable: a ball weighs 10 g, a straight inner 20 g, outers nothing
    const weighed: PartMesh[] = parts.map((m) => {
      const estimate = m.id === 'inner-segment' ? (m.form === 'ball' ? 10 : 20) : m.id === 'outer-segment' ? 0 : m.massGrams.estimate;
      return { ...m, massGrams: { ...m.massGrams, estimate } };
    });
    const bom = computeBom(weighed, dims, plan(p));
    expect(bom.parts.map((r) => [r.part, r.form ?? null, r.file, r.copies])).toEqual([
      ['base', null, 'base', 1],
      ['inner-segment', 'ball', 'inner-segment-ball', 7],
      ['inner-segment', 'straight', 'inner-segment', 4],
      ['outer-segment', 'straight', 'outer-segment', 11],
      ['top-cover', null, 'top-cover', 1],
      ['plate-clamp', null, 'plate-clamp', 1],
    ]);
    // Clear: balls 0 2 6 8 + straight 4 10 = 4·10 + 2·20; Amber: balls 3 5 9 + straight 1 7 = 3·10 + 2·20
    const grams = Object.fromEntries(bom.colours.map((c) => [c.colourId, c.grams]));
    expect(grams).toEqual({ clr: 80, amb: 70, tea: 0 });
    expect(bom.colours.find((c) => c.colourId === 'clr')).toMatchObject({ inner: 6, outer: 3 });
    const others = weighed.filter((m) => !m.id.endsWith('segment')).reduce((a, m) => a + m.massGrams.estimate, 0);
    expect(bom.totalGrams).toBeCloseTo(others + 7 * 10 + 4 * 20, 6);
    // meshes without forms (older callers): the stack's only mesh weighs every band
    const plain = weighed.filter((m) => !(m.id === 'inner-segment' && m.form === 'ball')).map(({ form: _form, ...m }) => m);
    expect(computeBom(plain, dims, plan(p)).colours.find((c) => c.colourId === 'amb')!.grams).toBe(5 * 20);
  });
});
