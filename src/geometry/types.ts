/**
 * FROZEN CONTRACT between the geometry engine (src/geometry, src/export, src/worker)
 * and the app (src/state, src/preview, src/ui). Changes go through the orchestrator
 * and are recorded in contract.md. Units: mm, z-up. See contract.md for semantics.
 */

export type CoreKind = 'aluminium-rod' | 'led-tube';
export type HeightMode = 'auto' | 'locked';
export type WireRouting = 'auto' | 'beside-collar' | 'through-socket';
export type PrinterId = 'bambu-256' | 'bambu-a1-mini' | 'prusa-mk4' | 'ender-3' | 'custom';
/** Nozzle diameters the print plan has settings for (see NOZZLES). */
export type NozzleId = '0.4' | '0.6' | '0.8';
/**
 * Body form of a segment between its shoulder and the next segment's socket (the joint is
 * always the same). Round forms are profile changes; star, flute and twist warp the body.
 */
export type FormId = 'straight' | 'drop' | 'ball' | 'waist' | 'barrel' | 'star' | 'flute' | 'twist';
export const FORM_IDS: readonly FormId[] = ['straight', 'drop', 'ball', 'waist', 'barrel', 'star', 'flute', 'twist'];

export interface LampParams {
  version: 1;
  /** The vertical core: a rod (wrapped in an LED strip) or a single-ended LED tube. */
  core: { kind: CoreKind; diameter: number; length: number; stripBuildUp: number };
  /**
   * Outer diameters of the two tube stacks, and the form diameter per stack: the widest
   * point of bulging forms (drop, ball, barrel, star, flute, twist); waists narrow by the
   * same amount.
   */
  tubes: { innerOD: number; outerOD: number; innerFormOD: number; outerFormOD: number };
  /**
   * Segment construction and height fitting. innerHeight/outerHeight are targets (auto) or
   * exact (locked). maxOverhang (degrees from vertical) caps every outward-going flank of a
   * form, so the segments still print in vase mode.
   */
  segments: {
    wall: number;
    overlap: number;
    rimLeadIn: number;
    heightMode: HeightMode;
    innerHeight: number;
    outerHeight: number;
    maxDeviation: number;
    maxOverhang: number;
  };
  base: {
    diameter: number;
    minHeight: number;
    topRound: number;
    ringWall: number;
    footGap: number;
    collarWall: number;
    collarHeight: number;
    socketBelowTop: number;
    screwCount: number;
    screwDiameter: number;
    wireDiameter: number;
    wireRouting: WireRouting;
    intakeCount: number;
    intakeWidth: number;
    intakeHeight: number;
  };
  /** The dumbbell plate that sits in the underside pocket. */
  plate: { od: number; thickness: number; bore: number };
  cover: {
    plateThickness: number;
    ringWall: number;
    innerRingHeight: number;
    bossWall: number;
    bossHeight: number;
    bossHoleDepth: number;
    rodEndGap: number;
    outerSlits: number;
    innerSlits: number;
    slitWidth: number;
  };
  printer: { preset: PrinterId; nozzle: NozzleId; bedX: number; bedY: number; bedZ: number };
  tolerances: { segment: number; core: number; plateRadial: number; plateDepth: number };
  /**
   * Stored body forms per stack, bottom → top. May be longer or shorter than the segment
   * count: `fitForms` repeats the pattern (an empty list is all straight).
   */
  forms: { inner: FormId[]; outer: FormId[] };
}

/** Every numeric leaf of LampParams as a dotted path (the UI and the URL codec key off these). */
export type NumericParamPath =
  | 'core.diameter'
  | 'core.length'
  | 'core.stripBuildUp'
  | 'tubes.innerOD'
  | 'tubes.outerOD'
  | 'tubes.innerFormOD'
  | 'tubes.outerFormOD'
  | 'segments.wall'
  | 'segments.overlap'
  | 'segments.rimLeadIn'
  | 'segments.innerHeight'
  | 'segments.outerHeight'
  | 'segments.maxDeviation'
  | 'segments.maxOverhang'
  | 'base.diameter'
  | 'base.minHeight'
  | 'base.topRound'
  | 'base.ringWall'
  | 'base.footGap'
  | 'base.collarWall'
  | 'base.collarHeight'
  | 'base.socketBelowTop'
  | 'base.screwCount'
  | 'base.screwDiameter'
  | 'base.wireDiameter'
  | 'base.intakeCount'
  | 'base.intakeWidth'
  | 'base.intakeHeight'
  | 'plate.od'
  | 'plate.thickness'
  | 'plate.bore'
  | 'cover.plateThickness'
  | 'cover.ringWall'
  | 'cover.innerRingHeight'
  | 'cover.bossWall'
  | 'cover.bossHeight'
  | 'cover.bossHoleDepth'
  | 'cover.rodEndGap'
  | 'cover.outerSlits'
  | 'cover.innerSlits'
  | 'cover.slitWidth'
  | 'printer.bedX'
  | 'printer.bedY'
  | 'printer.bedZ'
  | 'tolerances.segment'
  | 'tolerances.core'
  | 'tolerances.plateRadial'
  | 'tolerances.plateDepth';

export type EnumParamPath = 'core.kind' | 'segments.heightMode' | 'base.wireRouting' | 'printer.preset' | 'printer.nozzle';

export type ParamGroup = 'core' | 'tubes' | 'segments' | 'base' | 'plate' | 'cover' | 'printer' | 'tolerances';

/** UI metadata for one numeric parameter. Ranges are hard clamps; cross-field conflicts are Messages. */
export interface ParamMeta {
  path: NumericParamPath;
  label: string;
  unit: 'mm' | '' | '%' | '°';
  min: number;
  max: number;
  step: number;
  precision: number;
  group: ParamGroup;
  advanced: boolean;
  hint?: string;
}

export interface CorePreset {
  kind: CoreKind;
  label: string;
  diameter: number;
  /** false for LED tubes: the length cannot be cut. */
  cuttable: boolean;
}
export interface PrinterPreset {
  id: PrinterId;
  label: string;
  bed: [number, number, number];
}
/** One nozzle size and the slicer settings that follow from it (PRINT-PLAN.md, mass estimates). */
export interface NozzlePreset {
  id: NozzleId;
  /** "0.6 mm" */
  label: string;
  /** Nozzle diameter, mm. */
  diameter: number;
  /** Default segment wall = the vase-mode line width, mm. Applied when the nozzle is chosen. */
  wall: number;
  /** Segment walls that print reliably in vase mode, mm; outside this range the engine warns (`vase-wall`). */
  wallRange: [number, number];
  /** Standard layer height (segments, fit test, base), mm. */
  layer: number;
  /** Finer layer height for the cover's visible top, mm. */
  fineLayer: number;
  /** The slicer's default line width for normal-mode walls (base, cover, clamp), mm. */
  lineWidth: number;
}

export type PartId = 'base' | 'inner-segment' | 'outer-segment' | 'top-cover' | 'plate-clamp' | 'fit-test';
export const PART_IDS: readonly PartId[] = ['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp', 'fit-test'];
/** Parts that appear in the assembled lamp (fit-test is print-only). */
export const ASSEMBLY_PART_IDS: readonly PartId[] = ['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp'];

export type Quality = 'preview' | 'export';

export interface Message {
  severity: 'error' | 'warning' | 'info';
  code: string;
  text: string;
  /** Dotted LampParams path the message is about, for "jump to field". */
  path?: string;
}

export interface SegmentDims {
  count: number;
  /** Exact segment height used for the mesh. */
  height: number;
  targetHeight: number;
  /** height / targetHeight − 1 */
  deviation: number;
  /** Stack pitch = height − seatZ. */
  pitch: number;
  /** Body outer diameter. */
  D: number;
  /** Outer diameter of the flared foot = D + 2c + 2w. */
  socketOD: number;
  /** World z of the bottom edge of segment 1. */
  stackBottomZ: number;
  /** World z of the top rim of the top segment. */
  topZ: number;
  /** Body form of every segment, index 0 = bottom (`params.forms` fitted to `count`). */
  forms: FormId[];
  /** Widest point of any form in use (≥ socketOD): the stack's footprint. */
  maxOD: number;
}

export interface DerivedDims {
  /** No error-severity messages. Export is refused when false. */
  ok: boolean;
  messages: Message[];
  /** Seat height of the joint = overlap + clearance + rimLeadIn. */
  seatZ: number;
  /** Height of the base spigot rings = seatZ + footGap. */
  ringHeight: number;
  inner: SegmentDims;
  outer: SegmentDims;
  base: {
    height: number;
    topZ: number;
    printHeight: number;
    collarOD: number;
    /** World z of the screw hole axes. */
    screwZ: number;
    wireRouting: 'beside-collar' | 'through-socket';
    pocketDiameter: number;
    /** Plate thickness + the clamp flange + the extra depth. */
    pocketDepth: number;
    /** The boss hanging from the pocket ceiling through the plate's bore. */
    bossDiameter: number;
    /** The printed plate clamp under the plate and the screw that pulls it onto the boss. */
    clampDiameter: number;
    clampScrewLength: number;
    /** How far the clamp's underside sits above the floor at the entered plate thickness. */
    clampRecess: number;
  };
  cover: {
    od: number;
    printHeight: number;
    plateUndersideZ: number;
    topZ: number;
    /** Actual gap between the inner stack's top rim and the cover plate. */
    innerTopGap: number;
  };
  rod: {
    diameter: number;
    bottomZ: number;
    topZ: number;
    /** Length the rod must be cut to (equals core.length in auto mode). */
    requiredLength: number;
    cutOff: number;
    /** Gap between the rod end and the boss hole ceiling. */
    endGap: number;
    /** World z range available for the LED strip. */
    stripZone: [number, number];
  };
  /** Cover top = total lamp height. */
  totalHeight: number;
  /** One column-major 4×4 matrix per copy, print frame → world (mm). fit-test has none. */
  placements: Record<PartId, number[][]>;
  fit: Record<PartId, { size: [number, number, number]; fitsBed: boolean; fitsZ: boolean }>;
}

export interface PartMesh {
  id: PartId;
  /**
   * Segments only: the body form this mesh has. A stack with several forms yields several
   * PartMesh objects with the same `id`, one per distinct form, each with the copies that
   * form needs (`DerivedDims.inner/outer.forms` says which band gets which).
   */
  form?: FormId;
  quality: Quality;
  /** xyz triples, print frame: bed at z = 0, centred on the origin, mm. */
  positions: Float32Array;
  /** Triangle indices, CCW seen from outside. */
  indices: Uint32Array;
  /** Preview quality may carry normals; export quality never does. */
  normals?: Float32Array;
  triangleCount: number;
  /** mm³ */
  volume: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  /** How many copies the lamp needs (segments: N; others: 1). */
  copies: number;
  /** solid = volume × 1.27 g/cm³; estimate accounts for walls + 20 % infill on solid parts. */
  massGrams: { solid: number; estimate: number };
}

export interface PetgColour {
  id: string;
  name: string;
  /** '#rrggbb' */
  hex: string;
}
/** Fitted colour ids per band, index 0 = bottom. Lengths equal DerivedDims.inner/outer.count. */
export interface ColourPlan {
  palette: PetgColour[];
  inner: string[];
  outer: string[];
}

export type ExportFormat = '3mf' | 'stl';
export interface ExportMeta {
  shareUrl: string;
  appVersion: string;
  /** ISO timestamp, injected so output is deterministic in tests. */
  createdAt: string;
}
export interface ExportRequest {
  params: LampParams;
  colourPlan: ColourPlan;
  format: ExportFormat;
  includeFitTest: boolean;
  meta: ExportMeta;
}
export type ExportStage = PartId | 'docs' | 'zip';
export interface ExportResult {
  zip: Uint8Array;
  fileName: string;
}

export interface BomPartRow {
  part: PartId;
  /** Segments only: the form of this row's mesh (one row per form in use). */
  form?: FormId;
  file: string;
  copies: number;
  volumeMm3Each: number;
  gramsEach: number;
  gramsEstimateEach: number;
  metresEach: number;
  fitsBed: boolean;
  fitsZ: boolean;
}
export interface BomColourRow {
  colourId: string;
  inner: number;
  outer: number;
  grams: number;
  metres: number;
}
export interface Bom {
  parts: BomPartRow[];
  colours: BomColourRow[];
  totalGrams: number;
  totalMetres: number;
  densityGcm3: number;
}

/** Main-thread handle on the geometry worker. */
export interface GeometryClient {
  /** Resolves once the WASM kernel is initialised; rejects if it cannot load. */
  ready: Promise<void>;
  /** Newest-wins for 'preview'. Buffers are transferred. */
  buildParts(params: LampParams, quality: Quality): Promise<PartMesh[]>;
  /** FIFO. Rejects when deriveDims(params).ok is false. */
  exportZip(
    req: ExportRequest,
    onProgress?: (stage: ExportStage, done: number, total: number) => void,
  ): Promise<ExportResult>;
  /** Abort in-flight work (terminate + respawn) and reject pending promises. */
  cancel(): void;
  dispose(): void;
}
