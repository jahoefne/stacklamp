/**
 * Default parameters, presets and UI metadata. Pure data: no WASM, no DOM.
 * Owned by the engine after Phase 0, but the paths and PARAM_META keys are part of the contract.
 */
import type {
  CorePreset,
  CoreKind,
  LampParams,
  NozzleId,
  NozzlePreset,
  NumericParamPath,
  ParamMeta,
  PrinterId,
  PrinterPreset,
} from './types';

export const CORE_PRESETS: Record<CoreKind, CorePreset> = {
  'aluminium-rod': { kind: 'aluminium-rod', label: 'Aluminium tube + LED strip', diameter: 20, cuttable: true },
  'led-tube': { kind: 'led-tube', label: 'Single-ended LED tube', diameter: 28, cuttable: false },
};

export const PRINTER_PRESETS: Record<PrinterId, PrinterPreset> = {
  // X1C / P1S print 250 mm high (only the A1 reaches 256): use the common volume
  'bambu-256': { id: 'bambu-256', label: 'Bambu Lab P1S / X1C / A1 (256 × 256 × 250)', bed: [256, 256, 250] },
  'bambu-a1-mini': { id: 'bambu-a1-mini', label: 'Bambu Lab A1 mini (180 × 180 × 180)', bed: [180, 180, 180] },
  'prusa-mk4': { id: 'prusa-mk4', label: 'Prusa MK4 / Core One (250 × 210 × 220)', bed: [250, 210, 220] },
  'ender-3': { id: 'ender-3', label: 'Creality Ender 3 (220 × 220 × 250)', bed: [220, 220, 250] },
  custom: { id: 'custom', label: 'Custom bed size', bed: [256, 256, 256] },
};

/**
 * Nozzle sizes. Choosing one sets `segments.wall` to its vase-mode line width; its layer
 * heights, normal-mode line width and vase wall range drive PRINT-PLAN.md, the mass
 * estimates and the `vase-wall` warning. Line widths and standard layer heights are Bambu
 * Studio's per-nozzle defaults (the 0.20 / 0.30 / 0.40 mm Standard profiles); the walls are
 * 1.25–1.33 × the nozzle, the range 0.85–1.65 × (the 0.6 mm row is the calibrated original).
 */
export const NOZZLES: Record<NozzleId, NozzlePreset> = {
  '0.4': { id: '0.4', label: '0.4 mm', diameter: 0.4, wall: 0.5, wallRange: [0.35, 0.6], layer: 0.2, fineLayer: 0.2, lineWidth: 0.42 },
  '0.6': { id: '0.6', label: '0.6 mm', diameter: 0.6, wall: 0.8, wallRange: [0.5, 1.0], layer: 0.3, fineLayer: 0.2, lineWidth: 0.62 },
  '0.8': { id: '0.8', label: '0.8 mm', diameter: 0.8, wall: 1.0, wallRange: [0.7, 1.3], layer: 0.4, fineLayer: 0.24, lineWidth: 0.82 },
};
/** Nozzle ids, smallest first. */
export const NOZZLE_IDS: readonly NozzleId[] = ['0.4', '0.6', '0.8'];
/** The nozzle preset of `p`; an unknown id falls back to 0.6 mm (the calibrated default). */
export const nozzleOf = (p: LampParams): NozzlePreset => NOZZLES[p.printer.nozzle] ?? NOZZLES['0.6'];

export function defaultParams(): LampParams {
  return {
    version: 1,
    core: { kind: 'aluminium-rod', diameter: 20, length: 1500, stripBuildUp: 3 },
    tubes: { innerOD: 60, outerOD: 200, innerFormOD: 90, outerFormOD: 240 },
    segments: {
      wall: 0.8,
      overlap: 20,
      rimLeadIn: 1,
      heightMode: 'auto',
      innerHeight: 150,
      outerHeight: 150,
      maxDeviation: 0.1,
      maxOverhang: 45,
    },
    base: {
      diameter: 240,
      minHeight: 40,
      topRound: 3,
      ringWall: 3,
      footGap: 0.5,
      collarWall: 6,
      collarHeight: 35,
      socketBelowTop: 15,
      screwCount: 3,
      screwDiameter: 3.3,
      wireDiameter: 8,
      wireRouting: 'auto',
      intakeCount: 6,
      intakeWidth: 10,
      intakeHeight: 4,
    },
    plate: { od: 155, thickness: 25, bore: 30 },
    cover: {
      plateThickness: 3,
      ringWall: 2.4,
      innerRingHeight: 12,
      bossWall: 4,
      bossHeight: 15,
      bossHoleDepth: 15,
      rodEndGap: 2.5,
      outerSlits: 16,
      innerSlits: 8,
      slitWidth: 3,
    },
    printer: { preset: 'bambu-256', nozzle: '0.6', bedX: 256, bedY: 256, bedZ: 250 },
    tolerances: { segment: 0.25, core: 0.3, plateRadial: 1.5, plateDepth: 1 },
    forms: { inner: [], outer: [] },
  };
}

const mm = (
  path: NumericParamPath,
  label: string,
  min: number,
  max: number,
  step: number,
  group: ParamMeta['group'],
  advanced = false,
  hint?: string,
): ParamMeta => {
  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const meta: ParamMeta = { path, label, unit: 'mm', min, max, step, precision, group, advanced };
  if (hint !== undefined) meta.hint = hint;
  return meta;
};
const count = (
  path: NumericParamPath,
  label: string,
  min: number,
  max: number,
  group: ParamMeta['group'],
  advanced = false,
  hint?: string,
): ParamMeta => {
  const meta: ParamMeta = { path, label, unit: '', min, max, step: 1, precision: 0, group, advanced };
  if (hint !== undefined) meta.hint = hint;
  return meta;
};

/** One entry per NumericParamPath. The order is the display order within a group. */
export const PARAM_META: readonly ParamMeta[] = [
  mm('core.length', 'Rod length', 600, 2000, 10, 'core', false, 'Length of the rod or LED tube. The lamp height follows from it.'),
  mm('core.diameter', 'Core diameter', 8, 40, 0.1, 'core'),
  mm('core.stripBuildUp', 'LED strip build-up', 0, 8, 0.5, 'core', true, 'Radial thickness the strip adds to the rod.'),
  mm('tubes.innerOD', 'Inner tube diameter', 30, 120, 1, 'tubes'),
  mm('tubes.outerOD', 'Outer tube diameter', 80, 260, 1, 'tubes'),
  mm('tubes.outerFormOD', 'Outer form diameter', 40, 400, 1, 'tubes', false, 'Widest point of bulging outer forms; waists narrow by the same amount.'),
  mm('tubes.innerFormOD', 'Inner form diameter', 20, 250, 1, 'tubes', false, 'Widest point of bulging inner forms; waists narrow by the same amount.'),
  mm('segments.innerHeight', 'Inner segment height', 60, 250, 5, 'segments'),
  mm('segments.outerHeight', 'Outer segment height', 60, 250, 5, 'segments'),
  mm('segments.wall', 'Wall thickness', 0.4, 2, 0.05, 'segments', false, 'Equals the vase-mode line width.'),
  mm('segments.overlap', 'Joint overlap', 5, 40, 1, 'segments', true),
  mm('segments.rimLeadIn', 'Rim lead-in', 0.4, 2, 0.1, 'segments', true),
  {
    path: 'segments.maxDeviation',
    label: 'Max height deviation',
    unit: '%',
    min: 0,
    max: 0.3,
    step: 0.01,
    precision: 2,
    group: 'segments',
    advanced: true,
    hint: 'How far auto-fit may move the segment height from its target.',
  },
  {
    path: 'segments.maxOverhang',
    label: 'Max form overhang',
    unit: '°',
    min: 30,
    max: 60,
    step: 1,
    precision: 0,
    group: 'segments',
    advanced: true,
    hint: 'Steepest outward flank of a form, from vertical, that still prints in vase mode.',
  },
  mm('base.diameter', 'Base diameter', 150, 320, 1, 'base'),
  mm('base.minHeight', 'Base minimum height', 30, 80, 1, 'base', true),
  mm('base.topRound', 'Base edge radius', 0, 8, 0.5, 'base', true),
  mm('base.ringWall', 'Spigot ring wall', 2, 6, 0.5, 'base', true),
  mm('base.footGap', 'Foot gap', 0, 2, 0.1, 'base', true),
  mm('base.collarWall', 'Collar wall', 2, 10, 0.5, 'base', true),
  mm('base.collarHeight', 'Collar height', 20, 60, 1, 'base', true),
  mm('base.socketBelowTop', 'Socket depth below top', 5, 30, 1, 'base', true),
  count('base.screwCount', 'Rod screws', 0, 6, 'base', true),
  mm('base.screwDiameter', 'Screw hole diameter', 2, 6, 0.1, 'base', true),
  mm('base.wireDiameter', 'Cable channel diameter', 4, 12, 0.5, 'base', true),
  count('base.intakeCount', 'Air intakes per ring', 0, 12, 'base', true),
  mm('base.intakeWidth', 'Air intake width', 4, 20, 1, 'base', true),
  mm('base.intakeHeight', 'Air intake height', 2, 8, 0.5, 'base', true),
  mm('plate.od', 'Plate diameter', 100, 220, 1, 'plate'),
  mm('plate.thickness', 'Plate thickness', 10, 40, 1, 'plate'),
  mm('plate.bore', 'Plate bore', 20, 55, 0.5, 'plate'),
  mm('cover.plateThickness', 'Cover plate thickness', 2, 6, 0.5, 'cover', true),
  mm('cover.ringWall', 'Cover ring wall', 1.2, 4, 0.1, 'cover', true),
  mm('cover.innerRingHeight', 'Inner capture ring height', 6, 20, 1, 'cover', true),
  mm('cover.bossWall', 'Boss wall', 2, 8, 0.5, 'cover', true),
  mm('cover.bossHeight', 'Boss height', 8, 30, 1, 'cover', true),
  mm('cover.bossHoleDepth', 'Boss hole depth', 8, 30, 1, 'cover', true),
  mm('cover.rodEndGap', 'Rod end gap', 1, 5, 0.5, 'cover', true),
  count('cover.outerSlits', 'Outer air slits', 0, 48, 'cover'),
  count('cover.innerSlits', 'Inner air slits', 0, 24, 'cover'),
  mm('cover.slitWidth', 'Slit width', 1, 8, 0.5, 'cover'),
  mm('printer.bedX', 'Bed X', 100, 400, 1, 'printer'),
  mm('printer.bedY', 'Bed Y', 100, 400, 1, 'printer'),
  mm('printer.bedZ', 'Bed Z', 100, 400, 1, 'printer'),
  mm('tolerances.segment', 'Joint clearance', 0.05, 1, 0.05, 'tolerances', true, 'Radial clearance between a segment foot and the segment below.'),
  mm('tolerances.core', 'Rod socket clearance', 0, 1, 0.05, 'tolerances', true),
  mm('tolerances.plateRadial', 'Plate pocket clearance', 0, 5, 0.1, 'tolerances', true),
  mm('tolerances.plateDepth', 'Plate pocket extra depth', 0, 5, 0.1, 'tolerances', true, 'Beyond plate and clamp: how far the clamp sits above the floor.'),
];

export const PARAM_META_BY_PATH: ReadonlyMap<NumericParamPath, ParamMeta> = new Map(
  PARAM_META.map((m) => [m.path, m]),
);

/** Read a numeric leaf by dotted path. */
export function getParam(p: LampParams, path: NumericParamPath): number {
  const [g, k] = path.split('.') as [keyof LampParams, string];
  return (p[g] as unknown as Record<string, number>)[k] as number;
}

/** Return a copy of `p` with one numeric leaf replaced (clamped to its meta range). */
export function setParam(p: LampParams, path: NumericParamPath, value: number): LampParams {
  const meta = PARAM_META_BY_PATH.get(path);
  const v = meta ? Math.min(meta.max, Math.max(meta.min, value)) : value;
  const [g, k] = path.split('.') as [keyof LampParams, string];
  return { ...p, [g]: { ...(p[g] as object), [k]: v } } as LampParams;
}
