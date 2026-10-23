/**
 * PRINT-PLAN.md: what to print, how often, in which colours, with which
 * slicer settings. Generated from the request, the derived dimensions and the
 * export-quality meshes. Deterministic (the timestamp comes from the request).
 */
import { PRINTER_PRESETS, nozzleOf } from '../geometry/params';
import { computeBom, FILAMENT_DIAMETER_MM, PETG_DENSITY_G_CM3 } from '../geometry/bom';
import { supportVolume } from '../geometry/estimate';
import { DEFAULT_FORM, FORMS, allStraight, partFileStem } from '../geometry/forms';
import { PART_LABELS } from '../geometry/messages';
import { BASE_WALLS, COVER_WALLS, baseShellLayers } from '../geometry/print';
import type { DerivedDims, ExportRequest, FormId, PartMesh } from '../geometry/types';
import { FORM_IDS } from '../geometry/types';
import { colourById, colourSummary, meshColours } from './colours';
import { fixed, int, num, percent, table, yesNo } from './format';

/** Margin Bambu Studio's auto-arrange keeps around a part with supports, mm (observed). */
export const ARRANGE_MARGIN = 12;

export interface DocInput {
  req: ExportRequest;
  dims: DerivedDims;
  /** Export-quality meshes in ZIP order (a segment stack has one per form in use). */
  parts: readonly PartMesh[];
  /** File name of each mesh in the ZIP. */
  files: ReadonlyMap<PartMesh, string>;
}

/** True when a stack has a form other than straight. */
export const stackHasForms = (s: Pick<DerivedDims['inner'], 'forms'>): boolean => !allStraight(s.forms ?? []);

/** True when either stack has a form other than straight (the documents then give the segment order). */
export const formsInUse = (dims: Pick<DerivedDims, 'inner' | 'outer'>): boolean => stackHasForms(dims.inner) || stackHasForms(dims.outer);

/** `Inner segment`, `Inner segment (Ball)`: the part label, with a form other than straight. */
export const meshLabel = (m: Pick<PartMesh, 'id' | 'form'>): string =>
  m.form && m.form !== DEFAULT_FORM ? `${PART_LABELS[m.id]} (${FORMS[m.form].label})` : PART_LABELS[m.id];

/** "Star", "Star and Fluted", "Star, Fluted and Twist". */
function listText(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)!}`;
}

/** "Ball × 2, Straight × 1" in order of first appearance. */
function formSummary(forms: readonly FormId[]): string {
  const counts = new Map<FormId, number>();
  for (const f of forms) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()].map(([f, n]) => `${FORMS[f].label} × ${n}`).join(', ');
}

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
    `${s.count} × ${num(s.height)} mm segments, Ø ${num(s.D)} mm, pitch ${num(s.pitch)} mm (${percent(s.deviation)} from the ${num(s.targetHeight)} mm target)` +
    (stackHasForms(s) ? `; forms ${formSummary(s.forms)}, Ø ${num(s.maxOD)} mm at the widest` : '');
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
        // a stack with forms: each mesh's own footprint (the stack's fit is its widest form)
        const ownSize = (m.id === 'inner-segment' && stackHasForms(dims.inner)) || (m.id === 'outer-segment' && stackHasForms(dims.outer));
        const size = ownSize ? [0, 1, 2].map((i) => num(m.bbox.max[i]! - m.bbox.min[i]!, 1)) : f.size.map((v) => num(v));
        return [meshLabel(m), size.join(' × '), yesNo(f.fitsBed), yesNo(f.fitsZ)];
      }),
    ),
    '',
  );

  out.push('## Parts', '');
  out.push(
    table(
      ['File', 'Part', 'Copies', 'Colours', 'Triangles', 'Volume each (cm³)', 'Solid each (g)', 'Estimate each (g)', 'Estimate total (g)'],
      parts.map((m) => {
        const bands = meshColours(plan, dims, m);
        const colours = bands.length > 0 ? colourSummary(plan, bands) : m.id === 'fit-test' ? 'any (test colour)' : 'any (opaque recommended)';
        return [
          files.get(m) ?? `${partFileStem(m.id, m.form)}.${req.format}`,
          meshLabel(m),
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
      `walls + 20 % infill for the base and cover, the plate clamp solid; the base includes ≈ ${fixed(supportGrams, 0)} g of tree supports.`,
    '',
  );

  const withForms = formsInUse(dims);
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
  }
  if (withForms) {
    // which file and which colour goes where: a form is its own file
    out.push('### Segment order (bottom → top)', '');
    const order = (id: 'inner-segment' | 'outer-segment', s: DerivedDims['inner'], bands: readonly string[]) =>
      table(
        ['Band', 'Form', 'Colour', 'File'],
        (s.forms ?? []).map((f, k) => {
          const colour = bands[k];
          return [String(k + 1), FORMS[f].label, colour === undefined ? '–' : colourById(plan, colour).name, `${partFileStem(id, f)}.${req.format}`];
        }),
        ['r', 'l', 'l', 'l'],
      );
    out.push('**Outer stack**', '', order('outer-segment', dims.outer, plan.outer), '');
    out.push('**Inner stack**', '', order('inner-segment', dims.inner, plan.inner), '');
  } else if (bom.colours.length > 0) {
    out.push('### Colour order (bottom → top)', '');
    const order = (bands: readonly string[]) => bands.map((id, i) => `${i + 1}. ${colourById(plan, id).name}`).join('  \n');
    out.push(`**Outer stack**  \n${order(plan.outer)}`, '');
    out.push(`**Inner stack**  \n${order(plan.inner)}`, '');
  }
  if (bom.colours.length > 0) {
    out.push('Slicers ignore the colours stored in the 3MF files (they are a viewer hint only): load the filament for each print yourself.', '');
  }

  const w = num(p.segments.wall);
  const c = p.tolerances.segment;
  const bedXY = Math.min(p.printer.bedX, p.printer.bedY);
  const nz = nozzleOf(p);
  const shells = baseShellLayers(nz);
  // the classic wall generator lays two line-width loops into the single wall
  const loops = (2 * nz.lineWidth) / p.segments.wall;
  const classic = loops >= 1.2 ? `about ${num(Math.round(loops * 2) / 2)}× the material and oversized` : 'oversized';
  // forms that warp the revolved body (star, flute, twist), in catalogue order
  const used = new Set([...(dims.inner.forms ?? []), ...(dims.outer.forms ?? [])]);
  const ribbed = FORM_IDS.filter((f) => used.has(f) && !FORMS[f].round);
  out.push('## Slicer settings', '');
  out.push(
    [
      `- All parts: ${nz.label} nozzle, ${num(nz.layer)} mm layers unless noted, PETG at 240–250 °C, bed 70–80 °C on the **Textured PEI plate** (Bambu Studio's Generic PETG profile has no Cool Plate temperature).`,
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
      `- Layer height ${num(nz.layer)} mm, part cooling fan 30–50 %.`,
      '- Brim 5 mm on the outer segments (tall and thin); none needed on the inner ones.',
      `- **Elephant-foot compensation 0.** In vase mode it pulls the single line inward and narrows the socket mouth: 0.15 mm would leave ${num(Math.max(0, c - 0.15))} mm instead of ${num(c)} mm clearance around the rim below.`,
      '- Print the foot (socket) down, as exported.',
      ...(withForms
        ? [
            `- Segments with a form print the same way, in spiral vase mode and without supports: the form leaves the joint alone, and no flank leans outwards more than ${num(p.segments.maxOverhang)}° from vertical.`,
          ]
        : []),
      ...(ribbed.length > 0
        ? [
            `- ${listText(ribbed.map((f) => FORMS[f].label))} bodies are not round: the single vase line traces their ridges, and sharp points come out rounded by about half the line width (${num(p.segments.wall / 2)} mm).`,
          ]
        : []),
      `- Normal (non-vase) mode works too with 1 wall and **Wall generator = Arachne**: the classic generator prints the wall as two overlapping ${num(nz.lineWidth)} mm loops, ${classic}.`,
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
      `- ${BASE_WALLS} walls, 20 % gyroid infill, ${shells} top and ${shells} bottom layers (${num(nz.layer)} mm), elephant-foot compensation 0.15 mm.`,
      `- **Tree supports, on build plate only**: the ${num(dims.base.pocketDiameter)} mm plate pocket in the underside has a flat ceiling. The Ø ${num(dims.base.bossDiameter)} mm boss hanging from its middle ends in a 45° tip and needs only a small support under its flat; the cable tunnel has a 45° teardrop roof and needs none.`,
    ].join('\n'),
    '',
  );
  out.push('### Top cover — normal mode', '');
  out.push(
    [
      '- Print plate-down, as exported (rings and boss pointing up), no supports. The top edge is a 45° chamfer blending into a round, so nothing overhangs more than 45°.',
      `- ${COVER_WALLS} walls, 20 % infill, ${num(nz.fineLayer)} mm layers for a clean top surface, elephant-foot compensation 0.15 mm.`,
    ].join('\n'),
    '',
  );
  out.push('### Plate clamp — normal mode', '');
  out.push(
    [
      `- Print as exported (flange on the bed, the countersink opening downwards), no supports: the countersink is a 45° cone.`,
      `- 3 walls, **100 % infill** with the aligned rectilinear pattern (Bambu Studio refuses 100 % with grid, cubic or gyroid): a Ø ${num(dims.base.clampDiameter)} × ${num(dims.fit['plate-clamp'].size[2])} mm disc whose screw head bears on it. Elephant-foot compensation 0.15 mm.`,
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
