/**
 * The download: one ZIP with the printable parts (3MF or STL), PRINT-PLAN.md,
 * ASSEMBLY.md and config.json. Pure: takes export-quality PartMeshes (the
 * worker builds them), writes nothing but bytes.
 */
import { PART_LABELS } from '../geometry/messages';
import type { DerivedDims, ExportFormat, ExportRequest, ExportResult, ExportStage, PartId, PartMesh } from '../geometry/types';
import { ASSEMBLY_PART_IDS } from '../geometry/types';
import { assemblyMarkdown } from './assemblyDoc';
import { NEUTRAL_COLOUR, dominantColour } from './colours';
import { configJson } from './configJson';
import { num } from './format';
import { printPlanMarkdown } from './printPlan';
import { meshToBinaryStl } from './stl';
import { partTo3mf } from './threemf';
import { zipFiles, zipTime, type ZipEntry } from './zip';

export const DOC_FILES = ['PRINT-PLAN.md', 'ASSEMBLY.md', 'config.json'] as const;

/** The parts in the ZIP, in order. */
export function exportPartIds(includeFitTest: boolean): PartId[] {
  return [...ASSEMBLY_PART_IDS, ...(includeFitTest ? (['fit-test'] as PartId[]) : [])];
}

export const partFileName = (id: PartId, format: ExportFormat): string => `${id}.${format}`;

/** Every entry name of the ZIP, in order. */
export function bundleEntryNames(format: ExportFormat, includeFitTest: boolean): string[] {
  return [...exportPartIds(includeFitTest).map((id) => partFileName(id, format)), ...DOC_FILES];
}

/** `stacklamp-L1500-D200-rod-o11x154.5-i11x154.3.zip` (LED tube: `-tube-`): length, outer OD, core, stacks. */
export function bundleFileName(req: Pick<ExportRequest, 'params'>, dims: DerivedDims): string {
  const p = req.params;
  const core = p.core.kind === 'led-tube' ? 'tube' : 'rod';
  return `stacklamp-L${num(p.core.length)}-D${num(p.tubes.outerOD)}-${core}-o${dims.outer.count}x${num(dims.outer.height)}-i${dims.inner.count}x${num(dims.inner.height)}.zip`;
}

/** One part file (3MF centred on the bed, or binary STL in the print frame). */
export function partFile(mesh: PartMesh, req: ExportRequest): Uint8Array {
  const label = PART_LABELS[mesh.id];
  if (req.format === 'stl') return meshToBinaryStl(mesh, mesh.id);
  const plan = req.colourPlan;
  const colour =
    mesh.id === 'inner-segment'
      ? dominantColour(plan, plan.inner)
      : mesh.id === 'outer-segment' || mesh.id === 'fit-test'
        ? dominantColour(plan, plan.outer)
        : NEUTRAL_COLOUR;
  const p = req.params.printer;
  const metadata: Record<string, string> = {
    'stacklamp:part': mesh.id,
    'stacklamp:copies': String(mesh.copies),
  };
  if (req.meta.shareUrl) metadata['stacklamp:share'] = req.meta.shareUrl;
  return partTo3mf(mesh, {
    name: label,
    colour: colour.hex,
    colourName: colour.name,
    bed: [p.bedX, p.bedY, p.bedZ],
    title: `stacklamp ${label}`,
    createdAt: req.meta.createdAt,
    metadata,
  });
}

export function buildBundle(
  req: ExportRequest,
  dims: DerivedDims,
  parts: readonly PartMesh[],
  onProgress?: (stage: ExportStage, done: number, total: number) => void,
  progressBase = 0,
  progressTotal = parts.length + 2,
): ExportResult {
  const ids = exportPartIds(req.includeFitTest);
  const byId = new Map(parts.map((m) => [m.id, m]));
  const ordered = ids.map((id) => {
    const m = byId.get(id);
    if (!m) throw new Error(`Missing part ${id} for the export`);
    return m;
  });
  const files: Partial<Record<PartId, string>> = {};
  const entries: ZipEntry[] = [];
  for (const m of ordered) {
    const name = partFileName(m.id, req.format);
    files[m.id] = name;
    // 3MF packages are deflated already; STL deflates fast at level 1
    entries.push({ name, data: partFile(m, req), level: req.format === 'stl' ? 1 : 0 });
  }
  onProgress?.('docs', progressBase, progressTotal);
  const doc = { req, dims, parts: ordered, files };
  entries.push({ name: 'PRINT-PLAN.md', data: printPlanMarkdown(doc), level: 6 });
  entries.push({ name: 'ASSEMBLY.md', data: assemblyMarkdown(doc), level: 6 });
  entries.push({ name: 'config.json', data: configJson(req, dims), level: 6 });
  onProgress?.('zip', progressBase + 1, progressTotal);
  const zip = new Uint8Array(zipFiles(entries, 0, zipTime(req.meta.createdAt)));
  return { zip, fileName: bundleFileName(req, dims) };
}
