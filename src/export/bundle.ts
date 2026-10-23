/**
 * The download: one ZIP with the printable parts (3MF or STL), PRINT-PLAN.md,
 * ASSEMBLY.md and config.json. Pure: takes export-quality PartMeshes (the
 * worker builds them), writes nothing but bytes.
 *
 * A segment stack with several forms comes as several meshes with the same
 * part id; each is its own file (`inner-segment.3mf` for the straight ones,
 * `inner-segment-ball.3mf` for a form).
 */
import { DEFAULT_FORM, partFileStem } from '../geometry/forms';
import type { DerivedDims, ExportFormat, ExportRequest, ExportResult, ExportStage, FormId, PartId, PartMesh } from '../geometry/types';
import { ASSEMBLY_PART_IDS } from '../geometry/types';
import { assemblyMarkdown } from './assemblyDoc';
import { NEUTRAL_COLOUR, dominantColour, meshColours } from './colours';
import { configJson } from './configJson';
import { num } from './format';
import { meshLabel, printPlanMarkdown } from './printPlan';
import { meshToBinaryStl } from './stl';
import { partTo3mf } from './threemf';
import { zipFiles, zipTime, type ZipEntry } from './zip';

export const DOC_FILES = ['PRINT-PLAN.md', 'ASSEMBLY.md', 'config.json'] as const;

/** The parts in the ZIP, in order. */
export function exportPartIds(includeFitTest: boolean): PartId[] {
  return [...ASSEMBLY_PART_IDS, ...(includeFitTest ? (['fit-test'] as PartId[]) : [])];
}

/** `inner-segment.3mf`, `inner-segment-ball.3mf` (a segment with a form other than straight). */
export const partFileName = (id: PartId, format: ExportFormat, form?: FormId): string => `${partFileStem(id, form)}.${format}`;

/** Distinct forms in order of first appearance (straight for an empty stack), as the stack's variants. */
function distinctForms(forms: readonly FormId[] | undefined): FormId[] {
  const out = [...new Set(forms ?? [])];
  return out.length > 0 ? out : [DEFAULT_FORM];
}

/**
 * Every entry name of the ZIP, in order. `forms` are the fitted forms per stack, bottom → top
 * (`DerivedDims.inner/outer.forms`, or just the distinct forms); without them every segment is
 * straight.
 */
export function bundleEntryNames(
  format: ExportFormat,
  includeFitTest: boolean,
  forms?: { inner?: readonly FormId[]; outer?: readonly FormId[] },
): string[] {
  const names = exportPartIds(includeFitTest).flatMap((id) => {
    if (id === 'inner-segment') return distinctForms(forms?.inner).map((f) => partFileName(id, format, f));
    if (id === 'outer-segment') return distinctForms(forms?.outer).map((f) => partFileName(id, format, f));
    return [partFileName(id, format)];
  });
  return [...names, ...DOC_FILES];
}

/** `stacklamp-L1500-D200-rod-o11x154.5-i11x154.3.zip` (LED tube: `-tube-`): length, outer OD, core, stacks. */
export function bundleFileName(req: Pick<ExportRequest, 'params'>, dims: DerivedDims): string {
  const p = req.params;
  const core = p.core.kind === 'led-tube' ? 'tube' : 'rod';
  return `stacklamp-L${num(p.core.length)}-D${num(p.tubes.outerOD)}-${core}-o${dims.outer.count}x${num(dims.outer.height)}-i${dims.inner.count}x${num(dims.inner.height)}.zip`;
}

/**
 * One part file (3MF centred on the bed, or binary STL in the print frame). A segment's
 * viewer colour is the most used one among the bands of its form.
 */
export function partFile(mesh: PartMesh, req: ExportRequest, dims: Pick<DerivedDims, 'inner' | 'outer'>): Uint8Array {
  const label = meshLabel(mesh);
  if (req.format === 'stl') return meshToBinaryStl(mesh, partFileStem(mesh.id, mesh.form));
  const plan = req.colourPlan;
  const colour =
    mesh.id === 'inner-segment' || mesh.id === 'outer-segment'
      ? dominantColour(plan, meshColours(plan, dims, mesh))
      : mesh.id === 'fit-test'
        ? dominantColour(plan, plan.outer)
        : NEUTRAL_COLOUR;
  const p = req.params.printer;
  const metadata: Record<string, string> = { 'stacklamp:part': mesh.id };
  if (mesh.form && mesh.form !== DEFAULT_FORM) metadata['stacklamp:form'] = mesh.form;
  metadata['stacklamp:copies'] = String(mesh.copies);
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
  // every mesh of each exported part, in the order received (a stack: its variants' order)
  const ordered = exportPartIds(req.includeFitTest).flatMap((id) => {
    const meshes = parts.filter((m) => m.id === id);
    if (meshes.length === 0) throw new Error(`Missing part ${id} for the export`);
    return meshes;
  });
  const files = new Map<PartMesh, string>();
  const entries: ZipEntry[] = [];
  for (const m of ordered) {
    const name = partFileName(m.id, req.format, m.form);
    if ([...files.values()].includes(name)) throw new Error(`Two meshes for ${name} in the export`);
    files.set(m, name);
    // 3MF packages are deflated already; STL deflates fast at level 1
    entries.push({ name, data: partFile(m, req, dims), level: req.format === 'stl' ? 1 : 0 });
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
