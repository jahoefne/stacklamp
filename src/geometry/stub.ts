/**
 * Pure-JS stand-in for the real engine so the app can be built before the
 * Manifold engine lands. Same contract, crude meshes (open tubes and discs),
 * simplified-but-consistent derived dims, placeholder ZIP.
 */
import { strToU8, zipSync } from 'fflate';
import { defaultParams } from './params';
import type {
  Bom,
  BomColourRow,
  BomPartRow,
  ColourPlan,
  DerivedDims,
  ExportRequest,
  ExportResult,
  ExportStage,
  GeometryClient,
  LampParams,
  Message,
  PartId,
  PartMesh,
  Quality,
  SegmentDims,
} from './types';
import { ASSEMBLY_PART_IDS, PART_IDS } from './types';

export const PETG_DENSITY_G_CM3 = 1.27;
const FILAMENT_AREA_MM2 = Math.PI * 0.875 * 0.875;

const translateZ = (z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
const flipAtZ = (z: number): number[] => [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, z, 1];

export function partsKey(p: LampParams): string {
  const { printer, ...rest } = p;
  return JSON.stringify({ ...rest, bedZ: printer.bedZ });
}

function fitStack(A: number, Ht: number, seatZ: number, Hmin: number, Hmax: number): { n: number; H: number } {
  const Pt = Math.max(1, Ht - seatZ);
  const nLo = Math.max(1, Math.ceil(A / Math.max(1, Hmax - seatZ)));
  const nHi = Math.max(nLo, Math.floor(A / Math.max(1, Hmin - seatZ)));
  const cands = [Math.floor(A / Pt), Math.ceil(A / Pt)].map((n) => Math.min(nHi, Math.max(nLo, n)));
  let best = cands[0]!;
  for (const n of cands) if (Math.abs(A / n + seatZ - Ht) < Math.abs(A / best + seatZ - Ht)) best = n;
  const H = Math.round((A / best + seatZ) * 10) / 10;
  return { n: best, H };
}

export function deriveDims(p: LampParams): DerivedDims {
  const messages: Message[] = [];
  const c = p.tolerances.segment;
  const w = p.segments.wall;
  const seatZ = p.segments.overlap + c + p.segments.rimLeadIn;
  const ringHeight = seatZ + p.base.footGap;
  const pocketDiameter = p.plate.od + 2 * p.tolerances.plateRadial;
  const pocketDepth = p.plate.thickness + 3 + p.tolerances.plateDepth;
  const clampOD = p.plate.bore + 20;
  const collarOD = p.core.diameter + 2 * p.tolerances.core + 2 * p.base.collarWall;
  const wireRouting: 'beside-collar' | 'through-socket' =
    p.base.wireRouting === 'auto'
      ? (p.tubes.innerOD / 2 - p.base.ringWall - collarOD / 2 - p.base.wireDiameter) / 2 >= 1
        ? 'beside-collar'
        : 'through-socket'
      : p.base.wireRouting;
  const tunnelTop = pocketDepth + 2 + p.base.wireDiameter / 2 + Math.SQRT2 * (p.base.wireDiameter / 2);
  const baseHeight =
    Math.ceil(
      Math.max(
        p.base.minHeight,
        pocketDepth + 2 + p.base.socketBelowTop,
        tunnelTop + (wireRouting === 'through-socket' ? 2 + p.base.socketBelowTop : Math.max(4, p.base.topRound)),
      ) * 2,
    ) / 2;
  const zt = baseHeight;
  const Hmin = p.segments.overlap + w + c + p.segments.rimLeadIn + 10;
  const Hmax = p.printer.bedZ - 1;
  const A_o =
    p.core.length - p.base.socketBelowTop - ringHeight + p.cover.bossHeight - p.cover.bossHoleDepth + p.cover.rodEndGap;
  if (A_o <= Hmin - seatZ) messages.push({ severity: 'error', code: 'rod-too-short', text: 'The rod is too short for even one segment.', path: 'core.length' });
  const outerFit = fitStack(Math.max(A_o, 1), p.segments.outerHeight, seatZ, Hmin, Hmax);
  const A_i = outerFit.n * (outerFit.H - seatZ) - 2;
  const innerFit = fitStack(Math.max(A_i, 1), p.segments.innerHeight, seatZ, Hmin, Hmax);
  const seg = (id: 'inner' | 'outer', D: number, fit: { n: number; H: number }, target: number): SegmentDims => ({
    count: fit.n,
    height: fit.H,
    targetHeight: target,
    deviation: fit.H / target - 1,
    pitch: fit.H - seatZ,
    D,
    socketOD: D + 2 * c + 2 * w,
    forms: Array(fit.n).fill('straight'),
    maxOD: D + 2 * c + 2 * w,
    stackBottomZ: zt + p.base.footGap,
    topZ: zt + ringHeight + fit.n * (fit.H - seatZ),
  });
  const outer = seg('outer', p.tubes.outerOD, outerFit, p.segments.outerHeight);
  const inner = seg('inner', p.tubes.innerOD, innerFit, p.segments.innerHeight);
  for (const s of [outer, inner]) {
    if (Math.abs(s.deviation) > p.segments.maxDeviation)
      messages.push({ severity: 'warning', code: 'segment-deviation', text: `Segment height adjusted by ${(s.deviation * 100).toFixed(1)} %.`, path: s === outer ? 'segments.outerHeight' : 'segments.innerHeight' });
  }
  const plateUndersideZ = outer.topZ;
  const coverTopZ = plateUndersideZ + p.cover.plateThickness;
  const ceiling = plateUndersideZ - p.cover.bossHeight + p.cover.bossHoleDepth;
  const rodBottomZ = zt - p.base.socketBelowTop;
  const rodTopZ = rodBottomZ + p.core.length;
  const coverOD = p.tubes.outerOD + 2 * c + 2 * p.cover.ringWall;
  const sizes: Record<PartId, [number, number, number]> = {
    base: [p.base.diameter, p.base.diameter, baseHeight + p.base.collarHeight],
    'inner-segment': [inner.socketOD, inner.socketOD, inner.height],
    'outer-segment': [outer.socketOD, outer.socketOD, outer.height],
    'top-cover': [coverOD, coverOD, p.cover.plateThickness + p.segments.overlap],
    'plate-clamp': [clampOD, clampOD, 3],
    'fit-test': [outer.socketOD, outer.socketOD, seatZ + 15],
  };
  const fit = Object.fromEntries(
    PART_IDS.map((id) => {
      const [x, y, z] = sizes[id];
      const fitsBed = Math.max(x, y) <= Math.min(p.printer.bedX, p.printer.bedY) - 10;
      const fitsZ = z <= p.printer.bedZ - 1;
      if (!fitsBed) messages.push({ severity: 'error', code: `bed-fit-${id}`, text: `${id} (${x.toFixed(1)} mm) does not fit the bed.`, path: 'printer.bedX' });
      if (!fitsZ) messages.push({ severity: 'error', code: `z-fit-${id}`, text: `${id} is taller than the printer allows.`, path: 'printer.bedZ' });
      return [id, { size: [x, y, z], fitsBed, fitsZ }];
    }),
  ) as DerivedDims['fit'];
  if (p.core.diameter / 2 + p.core.stripBuildUp + 2 > p.tubes.innerOD / 2 - w - p.segments.rimLeadIn)
    messages.push({ severity: 'error', code: 'core-vs-inner-tube', text: 'The inner tube is too small for the core and the LED strip.', path: 'tubes.innerOD' });
  messages.push({ severity: 'info', code: 'pocket-needs-supports', text: 'The plate pocket ceiling needs tree supports (build plate only).' });
  const placements: Record<PartId, number[][]> = {
    base: [translateZ(0)],
    'inner-segment': Array.from({ length: inner.count }, (_, k) => translateZ(inner.stackBottomZ + k * inner.pitch)),
    'outer-segment': Array.from({ length: outer.count }, (_, k) => translateZ(outer.stackBottomZ + k * outer.pitch)),
    'top-cover': [flipAtZ(coverTopZ)],
    'plate-clamp': [translateZ(p.tolerances.plateDepth)],
    'fit-test': [],
  };
  return {
    ok: !messages.some((m) => m.severity === 'error'),
    messages,
    seatZ,
    ringHeight,
    inner,
    outer,
    base: { height: baseHeight, topZ: zt, printHeight: baseHeight + p.base.collarHeight, collarOD, screwZ: zt + Math.max(20, ringHeight + 6), wireRouting, pocketDiameter, pocketDepth, bossDiameter: p.plate.bore - 2 * p.tolerances.plateRadial, clampDiameter: clampOD, clampScrewLength: 25, clampRecess: p.tolerances.plateDepth },
    cover: { od: coverOD, printHeight: p.cover.plateThickness + p.segments.overlap, plateUndersideZ, topZ: coverTopZ, innerTopGap: plateUndersideZ - inner.topZ },
    rod: { diameter: p.core.diameter, bottomZ: rodBottomZ, topZ: rodTopZ, requiredLength: p.core.length, cutOff: 0, endGap: ceiling - rodTopZ, stripZone: [zt + p.base.collarHeight, plateUndersideZ - p.cover.bossHeight] },
    totalHeight: coverTopZ,
    placements,
    fit,
  };
}

/** Closed annular prism (or solid cylinder when ri <= 0), print frame, bed at z = 0. */
function tube(ro: number, ri: number, h: number, n: number): { positions: Float32Array; indices: Uint32Array } {
  const solid = ri <= 0;
  const rings = solid ? 2 : 4;
  const pos = new Float32Array(n * rings * 3 + (solid ? 6 : 0));
  const set = (i: number, x: number, y: number, z: number) => {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  };
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    set(k, ro * cx, ro * sy, 0);
    set(n + k, ro * cx, ro * sy, h);
    if (!solid) {
      set(2 * n + k, ri * cx, ri * sy, 0);
      set(3 * n + k, ri * cx, ri * sy, h);
    }
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    quad(k, k1, n + k1, n + k); // outer wall, outward
    if (solid) {
      const cb = 2 * n;
      const ct = 2 * n + 1;
      set(cb, 0, 0, 0);
      set(ct, 0, 0, h);
      idx.push(cb, k1, k, ct, n + k, n + k1);
    } else {
      quad(2 * n + k1, 2 * n + k, 3 * n + k, 3 * n + k1); // inner wall, inward
      quad(n + k, n + k1, 3 * n + k1, 3 * n + k); // top annulus
      quad(k1, k, 2 * n + k, 2 * n + k1); // bottom annulus
    }
  }
  return { positions: pos, indices: new Uint32Array(idx) };
}

function mesh(id: PartId, quality: Quality, geo: { positions: Float32Array; indices: Uint32Array }, volume: number, copies: number, size: [number, number, number]): PartMesh {
  const solid = (volume * PETG_DENSITY_G_CM3) / 1000;
  return {
    id,
    quality,
    positions: geo.positions,
    indices: geo.indices,
    triangleCount: geo.indices.length / 3,
    volume,
    bbox: { min: [-size[0] / 2, -size[1] / 2, 0], max: [size[0] / 2, size[1] / 2, size[2]] },
    copies,
    massGrams: { solid, estimate: id === 'base' || id === 'top-cover' ? solid * 0.35 : solid },
  };
}

export function buildStubParts(p: LampParams, quality: Quality, withFitTest = false): PartMesh[] {
  const d = deriveDims(p);
  const n = quality === 'preview' ? 64 : 128;
  const w = p.segments.wall;
  const ring = (D: number, H: number): { geo: ReturnType<typeof tube>; vol: number } => ({
    geo: tube(D / 2, D / 2 - w, H, n),
    vol: Math.PI * ((D / 2) ** 2 - (D / 2 - w) ** 2) * H,
  });
  const o = ring(p.tubes.outerOD, d.outer.height);
  const i = ring(p.tubes.innerOD, d.inner.height);
  const baseVol = Math.PI * (p.base.diameter / 2) ** 2 * d.base.height;
  const coverVol = Math.PI * (d.cover.od / 2) ** 2 * p.cover.plateThickness;
  const parts: PartMesh[] = [
    mesh('base', quality, tube(p.base.diameter / 2, 0, d.base.height, n), baseVol, 1, d.fit.base.size),
    mesh('inner-segment', quality, i.geo, i.vol, d.inner.count, d.fit['inner-segment'].size),
    mesh('outer-segment', quality, o.geo, o.vol, d.outer.count, d.fit['outer-segment'].size),
    mesh('top-cover', quality, tube(d.cover.od / 2, 0, p.cover.plateThickness, n), coverVol, 1, d.fit['top-cover'].size),
    mesh('plate-clamp', quality, tube(d.base.clampDiameter / 2, p.base.screwDiameter / 2 + 0.6, 3, n), Math.PI * (d.base.clampDiameter / 2) ** 2 * 3, 1, d.fit['plate-clamp'].size),
  ];
  if (withFitTest) {
    const f = ring(p.tubes.outerOD, d.seatZ + 15);
    parts.push(mesh('fit-test', quality, f.geo, f.vol, 1, d.fit['fit-test'].size));
  }
  return parts;
}

export function computeBom(parts: PartMesh[], dims: DerivedDims, plan: ColourPlan): Bom {
  const rows: BomPartRow[] = parts.map((m) => ({
    part: m.id,
    file: m.id,
    copies: m.copies,
    volumeMm3Each: m.volume,
    gramsEach: m.massGrams.solid,
    gramsEstimateEach: m.massGrams.estimate,
    metresEach: m.volume / FILAMENT_AREA_MM2 / 1000,
    fitsBed: dims.fit[m.id].fitsBed,
    fitsZ: dims.fit[m.id].fitsZ,
  }));
  const byId = new Map(parts.map((m) => [m.id, m]));
  const colours = new Map<string, BomColourRow>();
  const add = (stack: 'inner' | 'outer', id: string) => {
    const row = colours.get(id) ?? { colourId: id, inner: 0, outer: 0, grams: 0, metres: 0 };
    const m = byId.get(stack === 'inner' ? 'inner-segment' : 'outer-segment');
    row[stack] += 1;
    if (m) {
      row.grams += m.massGrams.estimate;
      row.metres += m.volume / FILAMENT_AREA_MM2 / 1000;
    }
    colours.set(id, row);
  };
  plan.inner.forEach((id) => add('inner', id));
  plan.outer.forEach((id) => add('outer', id));
  const totalGrams = rows.reduce((s, r) => s + r.gramsEstimateEach * r.copies, 0);
  const totalMetres = rows.reduce((s, r) => s + r.metresEach * r.copies, 0);
  return { parts: rows, colours: [...colours.values()], totalGrams, totalMetres, densityGcm3: PETG_DENSITY_G_CM3 };
}

export function createStubClient(latencyMs = 120): GeometryClient {
  let disposed = false;
  // The core slice has no DOM/Node lib; the stub only needs a timer, so reach it via globalThis.
  const timers = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown };
  const wait = (ms: number) => new Promise<void>((r) => timers.setTimeout(r, ms));
  return {
    ready: Promise.resolve(),
    async buildParts(params, quality) {
      await wait(latencyMs);
      if (disposed) throw new Error('disposed');
      return buildStubParts(params, quality);
    },
    async exportZip(req: ExportRequest, onProgress?: (s: ExportStage, done: number, total: number) => void): Promise<ExportResult> {
      const d = deriveDims(req.params);
      if (!d.ok) throw new Error('Fix the errors before exporting.');
      const ids: PartId[] = [...ASSEMBLY_PART_IDS, ...(req.includeFitTest ? (['fit-test'] as PartId[]) : [])];
      const total = ids.length + 2;
      const files: Record<string, Uint8Array> = {};
      ids.forEach((id, k) => {
        onProgress?.(id, k, total);
        files[`${id}.${req.format}`] = strToU8(`stub ${id}`);
      });
      await wait(latencyMs);
      onProgress?.('docs', ids.length, total);
      files['PRINT-PLAN.md'] = strToU8(`# Print plan (stub)\n\nOuter: ${d.outer.count} × ${d.outer.height} mm\nInner: ${d.inner.count} × ${d.inner.height} mm\n`);
      files['ASSEMBLY.md'] = strToU8('# Assembly (stub)\n');
      files['config.json'] = strToU8(JSON.stringify({ app: 'stacklamp', schema: 1, generated: req.meta.createdAt, shareUrl: req.meta.shareUrl, params: req.params }, null, 2));
      onProgress?.('zip', total - 1, total);
      const zip = zipSync(files, { level: 6 });
      return { zip, fileName: `stacklamp-L${req.params.core.length}-o${d.outer.count}x${d.outer.height}-i${d.inner.count}x${d.inner.height}.zip` };
    },
    cancel() {},
    dispose() {
      disposed = true;
    },
  };
}

export { defaultParams };
