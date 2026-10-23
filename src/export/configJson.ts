/**
 * config.json: the parameters, colour plan and key derived numbers of an
 * export, plus the share URL that reopens it. `parseConfig` validates a
 * parsed file with zod and returns it typed (throws on anything invalid).
 */
import { z } from 'zod';
import type { ColourPlan, DerivedDims, ExportRequest, LampParams } from '../geometry/types';

const n = z.number();
/** Unknown forms (from a newer app) read as straight. */
const FormIdSchema = z.enum(['straight', 'drop', 'ball', 'waist', 'barrel', 'star', 'flute', 'twist']).catch('straight');

export const LampParamsSchema = z.object({
  version: z.literal(1),
  core: z.object({ kind: z.enum(['aluminium-rod', 'led-tube']), diameter: n, length: n, stripBuildUp: n }),
  // form diameters, overhang and forms were added later: older files read as straight tubes
  tubes: z.object({ innerOD: n, outerOD: n, innerFormOD: n.default(90), outerFormOD: n.default(240) }),
  segments: z.object({
    wall: n,
    overlap: n,
    rimLeadIn: n,
    heightMode: z.enum(['auto', 'locked']),
    innerHeight: n,
    outerHeight: n,
    maxDeviation: n,
    maxOverhang: n.default(45),
  }),
  base: z.object({
    diameter: n,
    minHeight: n,
    topRound: n,
    ringWall: n,
    footGap: n,
    collarWall: n,
    collarHeight: n,
    socketBelowTop: n,
    screwCount: n,
    screwDiameter: n,
    wireDiameter: n,
    wireRouting: z.enum(['auto', 'beside-collar', 'through-socket']),
    intakeCount: n,
    intakeWidth: n,
    intakeHeight: n,
  }),
  plate: z.object({ od: n, thickness: n, bore: n }),
  cover: z.object({
    plateThickness: n,
    ringWall: n,
    innerRingHeight: n,
    bossWall: n,
    bossHeight: n,
    bossHoleDepth: n,
    rodEndGap: n,
    outerSlits: n,
    innerSlits: n,
    slitWidth: n,
  }),
  printer: z.object({
    preset: z.enum(['bambu-256', 'bambu-a1-mini', 'prusa-mk4', 'ender-3', 'custom']),
    // added later: files written before it was exported for the 0.6 mm nozzle
    nozzle: z.enum(['0.4', '0.6', '0.8']).default('0.6'),
    bedX: n,
    bedY: n,
    bedZ: n,
  }),
  tolerances: z.object({ segment: n, core: n, plateRadial: n, plateDepth: n }),
  forms: z
    .object({ inner: z.array(FormIdSchema), outer: z.array(FormIdSchema) })
    .default({ inner: [], outer: [] }),
});

const ColourPlanSchema = z.object({
  palette: z.array(z.object({ id: z.string(), name: z.string(), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })),
  inner: z.array(z.string()),
  outer: z.array(z.string()),
});

const StackSchema = z.object({ count: n, height: n, targetHeight: n, deviation: n, pitch: n, D: n });

const DerivedSchema = z.object({
  seatZ: n,
  ringHeight: n,
  outer: StackSchema,
  inner: StackSchema,
  base: z.object({ height: n, printHeight: n, wireRouting: z.enum(['beside-collar', 'through-socket']) }),
  cover: z.object({ od: n, plateUndersideZ: n, innerTopGap: n }),
  rod: z.object({ requiredLength: n, cutOff: n, endGap: n, bottomZ: n, topZ: n }),
  totalHeight: n,
});

export const ConfigFileSchema = z.object({
  app: z.literal('stacklamp'),
  schema: z.literal(1),
  generated: z.string(),
  appVersion: z.string(),
  shareUrl: z.string(),
  params: LampParamsSchema,
  colourPlan: ColourPlanSchema,
  derived: DerivedSchema,
});

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

// compile-time: the schema's params and colour plan are the contract types
const paramsMatch: LampParams = null as unknown as z.infer<typeof LampParamsSchema>;
const planMatch: ColourPlan = null as unknown as z.infer<typeof ColourPlanSchema>;
void paramsMatch;
void planMatch;

/** Derived numbers rounded to 6 decimals (no float noise in the file). */
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;

export function configObject(req: ExportRequest, dims: DerivedDims): ConfigFile {
  const stack = (s: DerivedDims['outer']) => ({
    count: s.count,
    height: r6(s.height),
    targetHeight: r6(s.targetHeight),
    deviation: r6(s.deviation),
    pitch: r6(s.pitch),
    D: r6(s.D),
  });
  return {
    app: 'stacklamp',
    schema: 1,
    generated: req.meta.createdAt,
    appVersion: req.meta.appVersion,
    shareUrl: req.meta.shareUrl,
    params: req.params,
    colourPlan: req.colourPlan,
    derived: {
      seatZ: r6(dims.seatZ),
      ringHeight: r6(dims.ringHeight),
      outer: stack(dims.outer),
      inner: stack(dims.inner),
      base: { height: r6(dims.base.height), printHeight: r6(dims.base.printHeight), wireRouting: dims.base.wireRouting },
      cover: { od: r6(dims.cover.od), plateUndersideZ: r6(dims.cover.plateUndersideZ), innerTopGap: r6(dims.cover.innerTopGap) },
      rod: {
        requiredLength: r6(dims.rod.requiredLength),
        cutOff: r6(dims.rod.cutOff),
        endGap: r6(dims.rod.endGap),
        bottomZ: r6(dims.rod.bottomZ),
        topZ: r6(dims.rod.topZ),
      },
      totalHeight: r6(dims.totalHeight),
    },
  };
}

export function configJson(req: ExportRequest, dims: DerivedDims): string {
  return `${JSON.stringify(configObject(req, dims), null, 2)}\n`;
}

/** Validate a parsed config.json (or its text). Throws an Error listing the invalid fields. */
export function parseConfig(input: unknown): ConfigFile {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new Error('config.json is not valid JSON');
    }
  }
  const parsed = ConfigFileSchema.safeParse(value);
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
    throw new Error(`Invalid stacklamp config: ${where}`);
  }
  return parsed.data;
}
