/**
 * Acceptance: build the real download ZIP in Node for a handful of lamps, write
 * it to `out/<case>/stacklamp.zip`, unpack it next to it (input for
 * `scripts/slice-check.sh out`) and check what a maker gets: exactly the
 * documented entries, valid part files, a config.json that reopens the same
 * lamp, and a print plan whose counts match the derived dimensions.
 *
 * Run with `npm run gen:samples` (vitest.acceptance.config.ts).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import type { BufferGeometry, Mesh, Object3D } from 'three';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { num } from '../../src/export/format';
import { defaultParams, deriveDims, parseConfig } from '../../src/geometry';
import type { ColourPlan, DerivedDims, ExportFormat, ExportRequest, LampParams } from '../../src/geometry';
import { fitBands } from '../../src/state/bands';
import { decodeConfig, encodeConfig } from '../../src/state/codec';
import type { LampConfig } from '../../src/state/config';
import { gradient } from '../../src/state/generators';
import { defaultPalette } from '../../src/state/palette';
import { shareUrl } from '../../src/state/url';
import { createHandler, type GeometryHandler } from '../../src/worker/handler';
import { getKernel } from '../helpers/kernel';
import { CASES, ledTube, withParams } from '../helpers/params';

const OUT = fileURLToPath(new URL('../../out/', import.meta.url));
const CREATED_AT = '2026-10-22T12:00:00.000Z';
const APP_VERSION = '0.1.0';
/** Outer stack: a 3-colour gradient bottom → top; inner stack: all clear. */
const OUTER_GRADIENT = ['amb', 'org', 'red'];
const INNER_COLOUR = 'clr';

interface SampleCase {
  name: string;
  params: LampParams;
  format: ExportFormat;
  includeFitTest: boolean;
}

const a1Mini = CASES.find((c) => c.name === 'A1 mini lamp');
if (!a1Mini) throw new Error('tests/helpers/params.ts has no "A1 mini lamp" case');

const SAMPLES: SampleCase[] = [
  { name: 'defaults', params: defaultParams(), format: '3mf', includeFitTest: true },
  { name: 'a1-mini', params: structuredClone(a1Mini.params), format: '3mf', includeFitTest: false },
  { name: 'led-tube', params: ledTube(), format: '3mf', includeFitTest: false },
  {
    name: 'locked',
    params: withParams((p) => {
      p.segments.heightMode = 'locked';
      p.segments.outerHeight = 150;
      p.segments.innerHeight = 150;
    }),
    format: '3mf',
    includeFitTest: false,
  },
  { name: 'stl-defaults', params: defaultParams(), format: 'stl', includeFitTest: false },
];

/** The colour plan and the share link the app would produce for these params. */
function appState(params: LampParams, dims: DerivedDims): { plan: ColourPlan; share: string } {
  const palette = defaultPalette();
  const config: LampConfig = {
    params,
    palette,
    bands: { inner: [INNER_COLOUR], outer: gradient(OUTER_GRADIENT, dims.outer.count) },
    gen: { inner: null, outer: { kind: 'gradient', colours: [...OUTER_GRADIENT] } },
  };
  const plan: ColourPlan = {
    palette,
    inner: fitBands(config.bands.inner, dims.inner.count, palette, config.gen.inner),
    outer: fitBands(config.bands.outer, dims.outer.count, palette, config.gen.outer),
  };
  const share = shareUrl(encodeConfig(config, { nInner: dims.inner.count, nOuter: dims.outer.count }));
  return { plan, share };
}

/** Rows of the first Markdown table after `heading` (header and separator dropped). */
function tableAfter(md: string, heading: string): string[][] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  expect(start, `heading "${heading}"`).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) {
      inTable = true;
      rows.push(line.slice(1, -1).split(' | ').map((c) => c.trim()));
    } else if (inTable) break;
  }
  return rows.slice(2);
}

/** "Amber × 4, Orange × 4, Red × 3" → 11 */
const summaryCount = (s: string): number => [...s.matchAll(/× (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);

let handler: GeometryHandler;
beforeAll(async () => {
  handler = createHandler(await getKernel());
  // three's 3MFLoader parses XML with DOMParser; give Node one
  const jsdom = 'jsdom';
  const { JSDOM } = (await import(/* @vite-ignore */ jsdom)) as { JSDOM: new (html: string) => { window: { DOMParser: unknown } } };
  (globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM('').window.DOMParser;
});

describe.each(SAMPLES)('sample $name', (sample) => {
  it('writes out/<case>/stacklamp.zip with exactly the documented, valid entries', { timeout: 60_000 }, () => {
    const t0 = performance.now();
    const dims = deriveDims(sample.params);
    expect(dims.ok, dims.messages.filter((m) => m.severity === 'error').map((m) => m.text).join(' ')).toBe(true);
    const { plan, share } = appState(sample.params, dims);
    const req: ExportRequest = {
      params: sample.params,
      colourPlan: plan,
      format: sample.format,
      includeFitTest: sample.includeFitTest,
      meta: { shareUrl: share, appVersion: APP_VERSION, createdAt: CREATED_AT },
    };
    // the exact path the worker takes for a download
    const { zip, fileName } = handler.exportZip(req);
    const ms = performance.now() - t0;

    const dir = join(OUT, sample.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'stacklamp.zip'), zip);
    writeFileSync(join(dir, 'zip-name.txt'), `${fileName}\n`);
    const files = unzipSync(zip);
    for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);

    // --- entries
    const ext = sample.format;
    const partNames = ['base', 'inner-segment', 'outer-segment', 'top-cover', ...(sample.includeFitTest ? ['fit-test'] : [])].map(
      (p) => `${p}.${ext}`,
    );
    expect(Object.keys(files)).toEqual([...partNames, 'PRINT-PLAN.md', 'ASSEMBLY.md', 'config.json']);
    expect(fileName).toBe(
      `stacklamp-L${num(sample.params.core.length)}-D${num(sample.params.tubes.outerOD)}-${sample.params.core.kind === 'led-tube' ? 'tube' : 'rod'}-o${dims.outer.count}x${num(dims.outer.height)}-i${dims.inner.count}x${num(dims.inner.height)}.zip`,
    );

    // --- part files are well-formed
    for (const name of partNames) {
      const data = files[name]!;
      if (ext === 'stl') {
        const n = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(80, true);
        expect(n, name).toBeGreaterThan(100);
        expect(data.byteLength, name).toBe(84 + 50 * n);
        expect(strFromU8(data.subarray(0, 5))).not.toBe('solid');
      } else {
        const pkg = unzipSync(data);
        expect(Object.keys(pkg).sort(), name).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
        const xml = strFromU8(pkg['3D/3dmodel.model']!);
        expect(xml).toContain('unit="millimeter"');
        expect(xml.match(/<object /g), name).toHaveLength(1);
      }
    }

    // --- config.json reopens the same lamp
    const cfg = parseConfig(strFromU8(files['config.json']!));
    expect(cfg.params).toEqual(sample.params);
    expect(cfg.colourPlan).toEqual(plan);
    expect(cfg.generated).toBe(CREATED_AT);
    const again = deriveDims(cfg.params);
    expect(again.ok).toBe(true);
    expect(again.outer.count).toBe(cfg.derived.outer.count);
    expect(again.inner.count).toBe(cfg.derived.inner.count);
    expect(again.outer.height).toBeCloseTo(cfg.derived.outer.height, 5);
    expect(again.inner.height).toBeCloseTo(cfg.derived.inner.height, 5);
    expect(cfg.derived.outer.count).toBe(dims.outer.count);
    expect(cfg.derived.inner.count).toBe(dims.inner.count);
    expect(cfg.derived.rod.requiredLength).toBeCloseTo(dims.rod.requiredLength, 5);
    // the share link decodes to the same params and colour bands
    expect(cfg.shareUrl).toBe(share);
    const decoded = decodeConfig(new URL(cfg.shareUrl).hash);
    expect(decoded, cfg.shareUrl).not.toBeNull();
    expect(decoded!.issues).toEqual([]);
    expect(decoded!.config.params).toEqual(sample.params);
    const c = decoded!.config;
    expect(fitBands(c.bands.outer, again.outer.count, c.palette, c.gen.outer)).toEqual(plan.outer);
    expect(fitBands(c.bands.inner, again.inner.count, c.palette, c.gen.inner)).toEqual(plan.inner);

    // --- PRINT-PLAN: N × H per stack, copies and colour counts
    const md = strFromU8(files['PRINT-PLAN.md']!);
    for (const s of [dims.outer, dims.inner]) expect(md).toContain(`${s.count} × ${num(s.height)} mm segments`);
    const partsRows = tableAfter(md, '## Parts');
    expect(partsRows.map((r) => r[0])).toEqual(partNames);
    const row = (file: string) => partsRows.find((r) => r[0] === file)!;
    for (const [file, n] of [
      [`outer-segment.${ext}`, dims.outer.count],
      [`inner-segment.${ext}`, dims.inner.count],
    ] as const) {
      expect(Number(row(file)[2]), file).toBe(n);
      expect(summaryCount(row(file)[3]!), file).toBe(n);
    }
    expect(row(`base.${ext}`)[2]).toBe('1');
    expect(row(`top-cover.${ext}`)[2]).toBe('1');
    if (sample.includeFitTest) expect(row(`fit-test.${ext}`)[2]).toBe('2');
    const colourRows = tableAfter(md, '### Filament per colour');
    expect(colourRows.reduce((a, r) => a + Number(r[1]), 0)).toBe(dims.inner.count);
    expect(colourRows.reduce((a, r) => a + Number(r[2]), 0)).toBe(dims.outer.count);
    const outerOf = (name: string) => Number(colourRows.find((r) => r[0]!.startsWith(name))?.[2] ?? 0);
    const want = (id: string) => plan.outer.filter((x) => x === id).length;
    expect([outerOf('Amber'), outerOf('Orange'), outerOf('Red')]).toEqual([want('amb'), want('org'), want('red')]);
    expect(Number(colourRows.find((r) => r[0]!.startsWith('Clear'))![1])).toBe(dims.inner.count);
    // the colour order lists every band once
    const order = md.slice(md.indexOf('### Colour order'));
    expect(order.match(/^\d+\. /gm)?.length).toBe(dims.inner.count + dims.outer.count);
    for (const f of partNames) expect(md, f).toContain(f);

    // --- case specifics
    const asm = strFromU8(files['ASSEMBLY.md']!);
    expect(asm).toContain(`${dims.inner.count} × inner segment, ${dims.outer.count} × outer segment`);
    if (sample.name === 'locked') {
      expect(dims.rod.cutOff).toBeGreaterThan(0);
      expect(md).toContain(`cut to ${num(dims.rod.requiredLength)} mm`);
      expect(asm).toContain(`cut to ${num(dims.rod.requiredLength)} mm`);
    } else {
      expect(md).toContain('no cut needed');
    }
    if (sample.name === 'led-tube') {
      expect(dims.base.wireRouting).toBe('through-socket');
      expect(asm).toMatch(/mains voltage/);
      expect(asm).toMatch(/socket floor/);
    } else {
      expect(asm).toMatch(/SELV/);
    }
    if (sample.name === 'a1-mini') {
      for (const f of Object.values(dims.fit).slice(0, 4)) expect(f.fitsBed && f.fitsZ).toBe(true);
      expect(md).toContain('180 × 180 × 180 mm');
    }

    console.log(`[gen:samples] ${sample.name}: ${fileName} ${(zip.byteLength / 1024).toFixed(0)} KiB in ${(ms / 1000).toFixed(1)} s`);
    expect(ms).toBeLessThan(20_000);
  });
});

describe('three.js 3MFLoader', () => {
  it('opens the default outer segment with the triangle count the print plan states', () => {
    const files = unzipSync(new Uint8Array(readFileSync(join(OUT, 'defaults', 'stacklamp.zip'))));
    const bytes = files['outer-segment.3mf']!;
    const group = new ThreeMFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    let triangles = 0;
    group.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry as BufferGeometry;
      triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    const md = strFromU8(files['PRINT-PLAN.md']!);
    const row = tableAfter(md, '## Parts').find((r) => r[0] === 'outer-segment.3mf')!;
    expect(triangles).toBeGreaterThan(1000);
    expect(triangles).toBe(Number(row[4]!.replace(/,/g, '')));
  });
});
