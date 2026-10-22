/**
 * PRINT-PLAN.md: what to print, how often, in which colours, with which
 * slicer settings. Generated from the request, the derived dimensions and the
 * export-quality meshes. Deterministic (the timestamp comes from the request).
 */
import { PRINTER_PRESETS } from '../geometry/params';
import { computeBom, FILAMENT_DIAMETER_MM, PETG_DENSITY_G_CM3 } from '../geometry/bom';
import { supportVolume } from '../geometry/estimate';
import { PART_LABELS } from '../geometry/messages';
import type { DerivedDims, ExportRequest, PartId, PartMesh } from '../geometry/types';
import { colourById, colourSummary } from './colours';
import { fixed, int, num, percent, table, yesNo } from './format';

/** Margin Bambu Studio's auto-arrange keeps around a part with supports, mm (observed). */
export const ARRANGE_MARGIN = 12;

export interface DocInput {
  req: ExportRequest;
  dims: DerivedDims;
  /** Export-quality meshes of the parts in the ZIP. */
  parts: readonly PartMesh[];
  /** File name of each part in the ZIP. */
  files: Partial<Record<PartId, string>>;
}

const bandsOf = (req: ExportRequest, id: PartId): string[] =>
  id === 'inner-segment' ? req.colourPlan.inner : id === 'outer-segment' ? req.colourPlan.outer : [];

export function rodLine(req: ExportRequest, dims: DerivedDims): string {
  const p = req.params;
  const what = `${p.core.kind === 'led-tube' ? 'single-ended LED tube' : 'aluminium tube'} Ø ${num(p.core.diameter)} mm`;
  const cut =
    dims.rod.cutOff > 0 && p.core.kind !== 'led-tube'
      ? `**cut to ${num(dims.rod.requiredLength)} mm** (cut off ${num(dims.rod.cutOff)} mm)`
      : 'no cut needed';
  return `${num(p.core.length)} mm ${what}, ${cut}`;
}

export function printPlanMarkdown(input: DocInput): string {
  const { req, dims, parts, files } = input;
  const p = req.params;
  const plan = req.colourPlan;
  const bom = computeBom([...parts], dims, plan);
  const printer = PRINTER_PRESETS[p.printer.preset];
  const out: string[] = [];

  out.push('# stacklamp — print plan', '');
  out.push(`Generated ${req.meta.createdAt} by stacklamp ${req.meta.appVersion}.`);
  if (req.meta.shareUrl) out.push(`Reopen this lamp: ${req.meta.shareUrl}`);
  out.push('');

  out.push('## Summary', '');
  const stack = (s: DerivedDims['outer']): string =>
    `${s.count} × ${num(s.height)} mm segments, Ø ${num(s.D)} mm, pitch ${num(s.pitch)} mm (${percent(s.deviation)} from the ${num(s.targetHeight)} mm target)`;
  out.push(
    table(
      ['Item', 'Value'],
      [
        ['Rod', rodLine(req, dims)],
        ['Lamp height', `${num(dims.totalHeight, 1)} mm (base ${num(dims.base.height)} mm + stacks + ${num(p.cover.plateThickness)} mm cover plate)`],
        ['Outer stack', stack(dims.outer)],
        ['Inner stack', stack(dims.inner)],
        ['Height mode', p.segments.heightMode === 'auto' ? 'auto (segment heights fitted to the rod)' : 'locked (segment heights as entered)'],
        ['Joint', `${num(p.segments.overlap)} mm overlap, ${num(p.tolerances.segment)} mm clearance, seat height ${num(dims.seatZ)} mm`],
        ['Rod end', `${num(dims.rod.endGap)} mm below the cover's boss hole ceiling`],
        ['Inner stack top', `${num(dims.cover.innerTopGap)} mm below the cover plate`],
      ],
    ),
    '',
  );

  const printerName = p.printer.preset === 'custom' ? 'custom printer' : printer.label.replace(/\s*\([^)]*\)\s*$/, '');
  out.push(`## Printer fit — ${printerName}, ${num(p.printer.bedX)} × ${num(p.printer.bedY)} × ${num(p.printer.bedZ)} mm`, '');
  out.push(
    table(
      ['Part', 'Size (mm)', 'Fits bed', 'Fits height'],
      parts.map((m) => {
        const f = dims.fit[m.id];
        return [PART_LABELS[m.id], f.size.map((v) => num(v)).join(' × '), yesNo(f.fitsBed), yesNo(f.fitsZ)];
      }),
    ),
    '',
  );

  out.push('## Parts', '');
  out.push(
    table(
      ['File', 'Part', 'Copies', 'Colours', 'Triangles', 'Volume each (cm³)', 'Solid each (g)', 'Estimate each (g)', 'Estimate total (g)'],
      parts.map((m) => {
        const bands = bandsOf(req, m.id);
        const colours = bands.length > 0 ? colourSummary(plan, bands) : m.id === 'fit-test' ? 'any (test colour)' : 'any (opaque recommended)';
        return [
          files[m.id] ?? m.id,
          PART_LABELS[m.id],
          String(m.copies),
          colours,
          int(m.triangleCount),
          fixed(m.volume / 1000, 1),
          fixed(m.massGrams.solid, 1),
          fixed(m.massGrams.estimate, 1),
          fixed(m.massGrams.estimate * m.copies, 0),
        ];
      }),
      ['l', 'l', 'r', 'l', 'r', 'r', 'r', 'r', 'r'],
    ),
    '',
  );
  const supportGrams = (supportVolume(dims.base.pocketDiameter / 2, dims.base.pocketDepth) * PETG_DENSITY_G_CM3) / 1000;
  out.push(
    `Total ≈ ${fixed(bom.totalGrams, 0)} g / ${fixed(bom.totalMetres, 0)} m of ${FILAMENT_DIAMETER_MM} mm PETG (density ${PETG_DENSITY_G_CM3} g/cm³). ` +
      'The estimates are what the slicer extrudes with the settings below: vase lines with rounded flanks for the segments, ' +
      `walls + 20 % infill for the base and cover; the base includes ≈ ${fixed(supportGrams, 0)} g of tree supports.`,
    '',
  );

  if (bom.colours.length > 0) {
    out.push('### Filament per colour', '');
    out.push(
      table(
        ['Colour', 'Inner segments', 'Outer segments', 'Mass (g)', 'Filament (m)'],
        bom.colours.map((c) => {
          const col = colourById(plan, c.colourId);
          return [`${col.name} (${col.hex})`, String(c.inner), String(c.outer), fixed(c.grams, 0), fixed(c.metres, 1)];
        }),
        ['l', 'r', 'r', 'r', 'r'],
      ),
      '',
    );
    out.push('### Colour order (bottom → top)', '');
    const order = (bands: readonly string[]) => bands.map((id, i) => `${i + 1}. ${colourById(plan, id).name}`).join('  \n');
    out.push(`**Outer stack**  \n${order(plan.outer)}`, '');
    out.push(`**Inner stack**  \n${order(plan.inner)}`, '');
    out.push('Slicers ignore the colours stored in the 3MF files (they are a viewer hint only): load the filament for each print yourself.', '');
  }

  const w = num(p.segments.wall);
  const c = p.tolerances.segment;
  const bedXY = Math.min(p.printer.bedX, p.printer.bedY);
  out.push('## Slicer settings', '');
  out.push(
    [
      '- All parts: 0.6 mm nozzle, PETG at 240–250 °C, bed 70–80 °C on the **Textured PEI plate** (Bambu Studio\'s Generic PETG profile has no Cool Plate temperature).',
      '- One object per plate, left where the file places it (centred on the bed).',
      ...(req.format === 'stl'
        ? ['- STL files store float32 coordinates: on import a slicer may weld a few dozen sliver triangles of the base and cover. That is harmless.']
        : []),
    ].join('\n'),
    '',
  );
  out.push(req.includeFitTest ? '### Segments (and the fit test) — spiral vase' : '### Segments — spiral vase', '');
  out.push(
    [
      `- Line width = wall = ${w} mm: in Bambu Studio set Quality → Line width → **Outer wall** and **First layer** to ${w} mm.`,
      '- Spiral vase mode on: 1 wall, 0 top and 0 bottom layers, 0 % infill.',
      '- Layer height 0.3 mm, part cooling fan 30–50 %.',
      '- Brim 5 mm on the outer segments (tall and thin); none needed on the inner ones.',
      `- **Elephant-foot compensation 0.** In vase mode it pulls the single line inward and narrows the socket mouth: 0.15 mm would leave ${num(Math.max(0, c - 0.15))} mm instead of ${num(c)} mm clearance around the rim below.`,
      '- Print the foot (socket) down, as exported.',
      '- Normal (non-vase) mode works too with 1 wall and **Wall generator = Arachne**: the classic generator prints the wall as two overlapping 0.62 mm loops, about 1.5× the material and oversized.',
      ...(req.includeFitTest
        ? [
            `- **Print the fit test first** (2 rings): push one ring's foot over the other's rim. It should slide on with light pressure and sit on the 45° shoulder without wobble. Too tight → raise the joint clearance by 0.05 mm (now ${num(c)} mm); loose → lower it.`,
          ]
        : [
            `- Tip: tick "Include fit test" in the download panel to get two short rings for checking the joint clearance (now ${num(c)} mm) before printing every segment.`,
          ]),
    ].join('\n'),
    '',
  );
  out.push('### Base — normal mode', '');
  out.push(
    [
      `- Print top-up, as exported, and **keep it centred** on the bed${
        p.base.diameter + 2 * ARRANGE_MARGIN > bedXY
          ? `: Bambu Studio's auto-arrange keeps a margin around parts with supports and refuses a ${num(p.base.diameter)} mm base on a ${num(bedXY)} mm bed`
          : ''
      }.`,
      '- 4 walls, 20 % gyroid infill, 5 top and 5 bottom layers, elephant-foot compensation 0.15 mm.',
      `- **Tree supports, on build plate only**: the ${num(dims.base.pocketDiameter)} mm plate pocket in the underside has a flat ceiling. The cable tunnel has a 45° teardrop roof and needs no support.`,
    ].join('\n'),
    '',
  );
  out.push('### Top cover — normal mode', '');
  out.push(
    [
      '- Print plate-down, as exported (rings and boss pointing up), no supports. The top edge is a 45° chamfer blending into a round, so nothing overhangs more than 45°.',
      '- 3 walls, 20 % infill, 0.2 mm layers for a clean top surface, elephant-foot compensation 0.15 mm.',
    ].join('\n'),
    '',
  );

  const notes = dims.messages.filter((m) => m.severity !== 'info' || m.code === 'pocket-needs-supports' || m.code === 'wire-routing-through-socket');
  if (notes.length > 0) {
    out.push('## Notes', '');
    out.push(notes.map((m) => `- ${m.severity === 'info' ? '' : `**${m.severity}:** `}${m.text}`).join('\n'), '');
  }
  return out.join('\n');
}
