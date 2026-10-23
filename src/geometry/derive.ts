/**
 * deriveDims(params): every derived number the app shows and the engine
 * builds from, plus the messages. Synchronous, pure, < 1 ms, never throws:
 * problems become error messages and `ok = false`.
 */
import {
  BED_MARGIN,
  FIT_TEST_EXTRA,
  SCREW_MIN_Z,
  SCREW_TOP_MARGIN,
  computeLayout,
  coverPrintHeight,
  socketOD,
  type Layout,
  type SegmentSpec,
  type SegmentVariant,
} from './layout';
import { FORMS } from './forms';
import { PART_LABELS, bedFitCode, errorMessage, message, sortMessages, zFitCode } from './messages';
import { NOZZLES, NOZZLE_IDS, PARAM_META, nozzleOf } from './params';
import { flipAt, identity, translateZ } from './placements';
import { profileProblem } from './profile';
import { baseProfile } from './profiles/base';
import { clampProfile } from './profiles/clamp';
import { coverProfile } from './profiles/cover';
import { effectiveAmplitude, formAmplitude, formRadiusRange, formZone, segmentRMax } from './profiles/forms';
import { segmentProfile } from './profiles/segment';
import { BED_Z_MARGIN, INNER_GAP_RANGE, ROD_GAP_SLACK, type StackSolution } from './solver';
import type { DerivedDims, FormId, LampParams, Message, PartId, SegmentDims } from './types';
import { ASSEMBLY_PART_IDS, PART_IDS } from './types';

export interface Derivation {
  dims: DerivedDims;
  /** null when the parameters could not be laid out at all (non-numbers, internal failure). */
  layout: Layout | null;
}

/** Radial clearance a form keeps to the other stack, the rod collar and the cover's boss and inner ring, mm. */
const FORM_GAP = 2;
/** A form scaled down by less than this (radially, mm) is not reported as squeezed. */
const SQUEEZE_TOLERANCE = 0.05;

const f1 = (v: number): string => String(Math.round(v * 10) / 10);
/** Round down to 0.1 (a stated maximum must not round up past the limit). */
const floor1 = (v: number): number => Math.floor(v * 10 + 1e-9) / 10;
const f2 = (v: number): string => String(Math.round(v * 100) / 100);
const pct = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} %`;

export function deriveDims(p: LampParams): DerivedDims {
  return derive(p).dims;
}

export function derive(p: LampParams): Derivation {
  try {
    const bad = PARAM_META.filter((m) => {
      const [g, k] = m.path.split('.') as [keyof LampParams, string];
      const v = (p[g] as unknown as Record<string, unknown>)[k];
      return typeof v !== 'number' || !Number.isFinite(v);
    });
    if (bad.length > 0) {
      const first = bad[0]!;
      return {
        dims: failedDims(p, errorMessage('invalid-number', `${first.label} is not a valid number.`, first.path)),
        layout: null,
      };
    }
    const outOfRange = PARAM_META.filter((m) => {
      const v = (p[m.path.split('.')[0] as keyof LampParams] as unknown as Record<string, number>)[m.path.split('.')[1]!]!;
      return v < m.min - 1e-9 || v > m.max + 1e-9;
    }).map((m) =>
      message('out-of-range', `${m.label} must be between ${m.min} and ${m.max}${m.unit === 'mm' ? ' mm' : ''}.`, m.path),
    );
    return deriveUnsafe(p, outOfRange);
  } catch (err) {
    const text = `The geometry could not be derived: ${err instanceof Error ? err.message : String(err)}`;
    return { dims: failedDims(p, errorMessage('profile-invalid', text)), layout: null };
  }
}

function segmentDims(
  sol: StackSolution,
  spec: SegmentSpec,
  forms: FormId[],
  variants: readonly SegmentVariant[],
  stackBottomZ: number,
  zt: number,
  ringHeight: number,
): SegmentDims {
  const { count, height, pitch } = sol.fit;
  const socket = socketOD(spec);
  let maxOD = socket;
  for (const v of variants) if (v.bands.length > 0) maxOD = Math.max(maxOD, 2 * segmentRMax(v.spec));
  return {
    count,
    height,
    targetHeight: sol.targetHeight,
    deviation: sol.targetHeight > 0 ? height / sol.targetHeight - 1 : 0,
    pitch,
    D: spec.D,
    socketOD: socket,
    stackBottomZ,
    topZ: zt + ringHeight + count * pitch,
    forms,
    // the widest form envelope in use (profiles/forms.ts), at least the socket
    maxOD,
  };
}

function deriveUnsafe(p: LampParams, initial: Message[]): Derivation {
  const msgs: Message[] = [...initial];
  const layout = computeLayout(p);
  const { solved, base: bl, specs } = layout;
  const { seatZ, ringHeight, window } = solved;
  const w = p.segments.wall;
  const lead = p.segments.rimLeadIn;
  const zt = bl.height;
  const locked = p.segments.heightMode === 'locked';
  const stackBottomZ = zt + p.base.footGap;
  const isTube = p.core.kind === 'led-tube';

  const outer = segmentDims(solved.outer, specs.outer, layout.forms.outer, specs.variants.outer, stackBottomZ, zt, ringHeight);
  const inner = segmentDims(solved.inner, specs.inner, layout.forms.inner, specs.variants.inner, stackBottomZ, zt, ringHeight);

  // ------------------------------------------------------------ stacks
  const Pmin = window.Hmin - seatZ;
  const tooTall = new Set<PartId>();
  if (locked) {
    if (p.segments.outerHeight > window.Hmax + 1e-9) {
      tooTall.add('outer-segment');
      msgs.push(
        message(
          'segment-too-tall',
          `Outer segments of ${f1(p.segments.outerHeight)} mm do not fit the printer (max ${f1(window.Hmax)} mm).`,
          'segments.outerHeight',
        ),
      );
    } else if (p.segments.outerHeight < window.Hmin - 1e-9) {
      msgs.push(
        message(
          'no-feasible-height',
          `Outer segments must be at least ${f2(window.Hmin)} mm tall (the joint plus a 10 mm body).`,
          'segments.outerHeight',
        ),
      );
    }
    if (solved.outer.fit.count < 1) {
      msgs.push(
        message('rod-too-short', `The rod (${f1(p.core.length)} mm) is too short for one outer segment of this height.`, 'core.length'),
      );
    }
  } else if (!solved.outer.feasible) {
    if (solved.A_o < Pmin) {
      msgs.push(
        message(
          'rod-too-short',
          `The rod (${f1(p.core.length)} mm) is too short: even one segment needs ${f1(p.core.length - solved.A_o + Pmin)} mm.`,
          'core.length',
        ),
      );
    } else {
      msgs.push(
        message('no-feasible-height', 'No outer segment count gives a printable segment height for this rod.', 'segments.outerHeight'),
      );
    }
  }
  if (!solved.inner.feasible) {
    msgs.push(
      message('no-feasible-height', 'No inner segment count gives a printable segment height for this stack.', 'segments.innerHeight'),
    );
  }
  if (solved.innerAdjusted) {
    msgs.push(
      message(
        'inner-height-adjusted',
        `With ${f1(p.segments.innerHeight)} mm inner segments the inner stack would not end ${f1(INNER_GAP_RANGE[0])}–${f1(INNER_GAP_RANGE[1])} mm below the cover; they were re-fitted to ${inner.count} × ${f2(inner.height)} mm.`,
        'segments.innerHeight',
      ),
    );
  }
  for (const [s, path, name] of [
    [outer, 'segments.outerHeight', 'Outer'],
    [inner, 'segments.innerHeight', 'Inner'],
  ] as const) {
    if (Math.abs(s.deviation) > p.segments.maxDeviation + 1e-9 && s.count >= 1) {
      msgs.push(
        message(
          'segment-deviation',
          `${name} segments are ${f2(s.height)} mm, ${pct(s.deviation)} from the ${f1(s.targetHeight)} mm target.`,
          path,
        ),
      );
    }
  }
  if (isTube && solved.cutOff > 0.25) {
    msgs.push(
      message(
        'led-tube-not-cuttable',
        `An LED tube cannot be cut, but this segment height needs ${f1(solved.cutOff)} mm less length. Switch to auto height or change the segment height.`,
        'segments.outerHeight',
      ),
    );
  }

  // ------------------------------------------------------------ core, tubes, collar
  const Ri = p.tubes.innerOD / 2;
  const Ro = p.tubes.outerOD / 2;
  const coreReach = p.core.diameter / 2 + (isTube ? 0 : p.core.stripBuildUp) + 2;
  if (coreReach > Ri - w - lead) {
    msgs.push(
      message(
        'core-vs-inner-tube',
        `The inner tube (${f1(p.tubes.innerOD)} mm) is too narrow for the ${isTube ? 'LED tube' : 'rod and LED strip'}: it needs at least ${f1(2 * (coreReach + w + lead))} mm.`,
        'tubes.innerOD',
      ),
    );
  }
  const cs = specs.cover;
  if (cs.boss.rOut + 1 > cs.innerRing.rIn) {
    msgs.push(
      message(
        'core-vs-inner-tube',
        `The cover boss (${f1(2 * cs.boss.rOut)} mm) does not fit inside the inner capture ring.`,
        'cover.bossWall',
      ),
    );
  }
  if (bl.collarR + 1 > bl.innerRingInnerR) {
    msgs.push(
      message(
        'collar-vs-ring',
        `The rod collar (${f1(2 * bl.collarR)} mm) does not fit inside the inner spigot ring (${f1(2 * bl.innerRingInnerR)} mm inside).`,
        'base.collarWall',
      ),
    );
  }
  if (lead > p.base.ringWall - 0.4) {
    msgs.push(
      message('profile-invalid', `The rim lead-in (${f1(lead)} mm) is too large for the ${f1(p.base.ringWall)} mm spigot ring wall.`, 'base.ringWall'),
    );
  }
  const innerSocketR = socketOD(specs.inner) / 2;
  if (innerSocketR + 2 > Ro - p.base.ringWall) {
    msgs.push(
      message('tubes-too-close', 'The inner and outer tubes are too close: the outer tube must be clearly wider than the inner one.', 'tubes.innerOD'),
    );
  } else if (cs.innerRing.rOut + 2 > cs.outerRing.rIn) {
    msgs.push(message('tubes-too-close', 'The cover rings of the inner and outer tube overlap.', 'tubes.innerOD'));
  }
  msgs.push(...formMessages(p, layout, { inner, outer, coreReach, stackBottomZ }));

  // ------------------------------------------------------------ base
  const bs = specs.base;
  const R = bs.radius;
  const intakes = bs.intakes;
  const outerBand = intakes.bands[0]!;
  const innerBand = intakes.bands[1]!;
  const reach = intakes.count > 0 ? outerBand.rOut : Ro;
  if (reach + 2 > R - Math.max(0, p.base.topRound)) {
    msgs.push(
      message(
        'base-too-small',
        `The base (${f1(p.base.diameter)} mm) is too small for the outer tube${intakes.count > 0 ? ' and its air grooves' : ''}: it needs at least ${f1(2 * (reach + 2 + p.base.topRound))} mm.`,
        'base.diameter',
      ),
    );
  }
  if (bl.pocketR + 3 > R) {
    msgs.push(
      message('base-too-small', `The plate pocket (${f1(2 * bl.pocketR)} mm) leaves too little wall in a ${f1(p.base.diameter)} mm base.`, 'plate.od'),
    );
  }
  if (intakes.count > 0) {
    const n = intakes.count;
    const crowded = n >= 2 && 2 * innerBand.rIn * Math.sin(Math.PI / n) < intakes.width + 1;
    if (crowded) {
      msgs.push(
        message('intake-overlap', `${n} air intakes of ${f1(intakes.width)} mm overlap inside the inner ring.`, 'base.intakeCount'),
      );
    } else if (innerBand.rIn < bl.collarR + 1) {
      msgs.push(message('intake-overlap', 'The inner air grooves run into the rod collar.', 'base.intakeCount'));
    } else if (innerBand.rOut + 2 > outerBand.rIn) {
      msgs.push(message('intake-overlap', 'The inner and outer air grooves run into each other.', 'base.intakeCount'));
    }
    if (intakes.height > ringHeight - lead - 2) {
      msgs.push(
        message('intake-overlap', `Air intakes of ${f1(intakes.height)} mm would cut through the spigot ring seat.`, 'base.intakeHeight'),
      );
    }
    const wire = bs.wire;
    if (wire.routing === 'beside-collar') {
      const a = (wire.azimuth * Math.PI) / 180;
      const hx = wire.holeR * Math.cos(a);
      const hy = wire.holeR * Math.sin(a);
      for (const az of intakes.azimuths) {
        const b = (az * Math.PI) / 180;
        // hole centre in the slot's frame (slot along +x from rIn to rOut, |y| <= width/2)
        const lx = hx * Math.cos(b) + hy * Math.sin(b);
        const ly = -hx * Math.sin(b) + hy * Math.cos(b);
        const dx = Math.max(innerBand.rIn - lx, 0, lx - innerBand.rOut);
        const dy = Math.max(Math.abs(ly) - intakes.width / 2, 0);
        if (Math.hypot(dx, dy) < wire.radius + 1) {
          msgs.push(message('intake-overlap', 'An air intake runs into the cable hole; use fewer or narrower intakes.', 'base.intakeCount'));
          break;
        }
      }
    }
  }
  const room = (bl.innerRingInnerR - bl.collarR - 2 * bs.wire.radius) / 2;
  if (bl.routing === 'beside-collar' && room < 0.5) {
    msgs.push(
      message('wire-no-room', 'There is no room for the cable hole between the collar and the inner ring; route it through the socket.', 'base.wireRouting'),
    );
  }
  if (bl.routing === 'through-socket' && bs.wire.radius + 1 > bl.boreR) {
    msgs.push(
      message('wire-no-room', `A ${f1(p.base.wireDiameter)} mm cable hole is too wide for the rod socket floor.`, 'base.wireDiameter'),
    );
  }
  if (bs.screws.count > 0 && bl.screwZAboveTop + bs.screws.radius + SCREW_TOP_MARGIN > p.base.collarHeight - bs.bore.entryChamfer) {
    msgs.push(
      message(
        'screw-vs-collar',
        `The rod screws sit ${f2(bl.screwZAboveTop)} mm above the base (to clear the inner ring); the collar must be at least ${f1(bl.screwZAboveTop + bs.screws.radius + SCREW_TOP_MARGIN + bs.bore.entryChamfer)} mm tall.`,
        'base.collarHeight',
      ),
    );
  }

  // ------------------------------------------------------------ cover
  if (cs.boss.ceilingZ < 1) {
    msgs.push(
      message('profile-invalid', 'The boss hole is deeper than boss and plate together; it would go through the cover.', 'cover.bossHoleDepth'),
    );
  }
  if (cs.boss.holeR + cs.boss.holeChamfer + 0.4 > cs.boss.rOut) {
    msgs.push(message('profile-invalid', 'The cover boss wall is too thin.', 'cover.bossWall'));
  }
  if (Math.round(p.cover.innerSlits) > 0 && cs.slits.inner.count === 0) {
    msgs.push(
      message('inner-slits-dropped', 'The inner air slits do not fit between the boss and the inner ring and were left out.', 'cover.innerSlits'),
    );
  }
  if (Math.round(p.cover.outerSlits) > 0 && cs.slits.outer.count === 0) {
    msgs.push(
      message('outer-slits-dropped', 'The outer air slits do not fit between the cover rings and were left out.', 'cover.outerSlits'),
    );
  }
  const nz = nozzleOf(p);
  const [wMin, wMax] = nz.wallRange;
  if (w < wMin - 1e-9 || w > wMax + 1e-9) {
    const i = NOZZLE_IDS.indexOf(nz.id);
    const smaller = i > 0 ? NOZZLES[NOZZLE_IDS[i - 1]!] : null;
    const bigger = i < NOZZLE_IDS.length - 1 ? NOZZLES[NOZZLE_IDS[i + 1]!] : null;
    msgs.push(
      message(
        'vase-wall',
        w < wMin
          ? `A ${f2(w)} mm wall is thinner than a ${nz.label} nozzle prints in vase mode; raise it to at least ${f2(wMin)} mm${
              smaller ? ` or switch to a ${smaller.label} nozzle` : ''
            }.`
          : `A ${f2(w)} mm wall is wider than a ${nz.label} nozzle prints in vase mode; keep it at most ${f2(wMax)} mm, ${
              bigger ? `switch to a ${bigger.label} nozzle ` : ''
            }or print the segments with 2 walls.`,
        'segments.wall',
      ),
    );
  }

  // ------------------------------------------------------------ profiles
  const profiles: [PartId, () => [number, number][]][] = [
    ['base', () => baseProfile(bs, 4)],
    ['inner-segment', () => segmentProfile(specs.inner)],
    ['outer-segment', () => segmentProfile(specs.outer)],
    ['top-cover', () => coverProfile(cs, 3)],
    ['plate-clamp', () => clampProfile(specs.clamp)],
    ['fit-test', () => segmentProfile(specs.fitTest)],
  ];
  for (const [id, make] of profiles) {
    const problem = profileProblem(make());
    if (problem) msgs.push(message('profile-invalid', `${PART_LABELS[id]} cannot be built (${problem}).`));
  }
  // round forms change the profile (ribbed ones only add rings to the straight one)
  for (const [id, stack, path] of [
    ['inner-segment', 'inner', 'tubes.innerFormOD'],
    ['outer-segment', 'outer', 'tubes.outerFormOD'],
  ] as const) {
    for (const v of specs.variants[stack]) {
      if (v.form === 'straight' || !FORMS[v.form].round || v.bands.length === 0) continue;
      const problem = profileProblem(segmentProfile(v.spec));
      if (problem) {
        msgs.push(message('profile-invalid', `${PART_LABELS[id]} (${FORMS[v.form].label.toLowerCase()}) cannot be built (${problem}).`, path));
      }
    }
  }

  // ------------------------------------------------------------ info
  if (bl.height > p.base.minHeight + 1e-9) {
    msgs.push(
      message(
        'base-height-raised',
        `The base is ${f1(bl.height)} mm tall (minimum ${f1(p.base.minHeight)} mm) to fit ${bl.routing === 'through-socket' ? 'the plate pocket and the cable tunnel under the rod socket' : 'the plate pocket, the rod socket and the cable tunnel'}.`,
        'base.minHeight',
      ),
    );
  }
  if (bl.routing === 'through-socket') {
    msgs.push(
      message(
        'wire-routing-through-socket',
        bl.routedThroughSocket
          ? 'The collar leaves no room beside it, so the cable runs through the socket floor into the tunnel.'
          : 'The cable runs through the socket floor into the tunnel.',
        'base.wireRouting',
      ),
    );
  }
  msgs.push(
    message(
      'pocket-needs-supports',
      `The ${f1(2 * bl.pocketR)} mm plate pocket ceiling needs tree supports (build plate only).`,
    ),
  );
  if (bs.screws.count > 0 && bl.screwZAboveTop > SCREW_MIN_Z + 1e-9) {
    msgs.push(
      message(
        'screw-height-raised',
        `The rod screws sit ${f2(bl.screwZAboveTop)} mm above the base top so a driver clears the inner ring.`,
        'base.collarHeight',
      ),
    );
  }

  // ------------------------------------------------------------ assembly
  const plateUndersideZ = outer.topZ;
  const coverTopZ = plateUndersideZ + p.cover.plateThickness;
  const rodBottomZ = zt - p.base.socketBelowTop;
  const rodTopZ = rodBottomZ + solved.requiredLength;
  const ceiling = plateUndersideZ - p.cover.bossHeight + p.cover.bossHoleDepth;
  const coverOD = 2 * cs.radius;
  const clampOD = 2 * specs.clamp.radius;
  const sizes: Record<PartId, [number, number, number]> = {
    base: [2 * R, 2 * R, zt + p.base.collarHeight],
    'inner-segment': [inner.maxOD, inner.maxOD, inner.height],
    'outer-segment': [outer.maxOD, outer.maxOD, outer.height],
    'top-cover': [coverOD, coverOD, coverPrintHeight(cs)],
    'plate-clamp': [clampOD, clampOD, specs.clamp.thickness],
    'fit-test': [outer.socketOD, outer.socketOD, seatZ + FIT_TEST_EXTRA],
  };
  const bedXY = Math.min(p.printer.bedX, p.printer.bedY) - 2 * BED_MARGIN;
  const bedZ = p.printer.bedZ - BED_Z_MARGIN;
  const sizePath: Record<PartId, [string, string]> = {
    base: ['base.diameter', 'base.collarHeight'],
    'inner-segment': ['tubes.innerOD', 'segments.innerHeight'],
    'outer-segment': ['tubes.outerOD', 'segments.outerHeight'],
    'top-cover': ['tubes.outerOD', 'segments.overlap'],
    'plate-clamp': ['plate.bore', 'plate.thickness'],
    'fit-test': ['tubes.outerOD', 'segments.overlap'],
  };
  const fit = {} as DerivedDims['fit'];
  for (const id of PART_IDS) {
    const size = sizes[id];
    const fitsBed = Math.max(size[0], size[1]) <= bedXY + 1e-9;
    const fitsZ = size[2] <= bedZ + 1e-9;
    fit[id] = { size, fitsBed, fitsZ };
    if (!ASSEMBLY_PART_IDS.includes(id)) continue;
    if (!fitsBed) {
      msgs.push(
        errorMessage(
          bedFitCode(id),
          `${PART_LABELS[id]} (${f1(Math.max(size[0], size[1]))} mm) does not fit the ${f1(p.printer.bedX)} × ${f1(p.printer.bedY)} mm bed with ${BED_MARGIN} mm margin.`,
          sizePath[id][0],
        ),
      );
    }
    if (!fitsZ && !tooTall.has(id)) {
      msgs.push(
        errorMessage(
          zFitCode(id),
          `${PART_LABELS[id]} (${f1(size[2])} mm tall) exceeds the printer's ${f1(p.printer.bedZ)} mm build height.`,
          sizePath[id][1],
        ),
      );
    }
  }

  const placements: Record<PartId, number[][]> = {
    base: [identity()],
    'inner-segment': Array.from({ length: inner.count }, (_, k) => translateZ(stackBottomZ + k * inner.pitch)),
    'outer-segment': Array.from({ length: outer.count }, (_, k) => translateZ(stackBottomZ + k * outer.pitch)),
    'top-cover': [flipAt(coverTopZ)],
    'plate-clamp': [translateZ(bl.clampBottomZ)],
    'fit-test': [],
  };

  const sorted = sortMessages(msgs);
  const dims: DerivedDims = {
    ok: !sorted.some((m) => m.severity === 'error'),
    messages: sorted,
    seatZ,
    ringHeight,
    inner,
    outer,
    base: {
      height: zt,
      topZ: zt,
      printHeight: zt + p.base.collarHeight,
      collarOD: 2 * bl.collarR,
      screwZ: zt + bl.screwZAboveTop,
      wireRouting: bl.routing,
      pocketDiameter: 2 * bl.pocketR,
      pocketDepth: bl.pocketDepth,
      bossDiameter: 2 * bl.bossR,
      clampDiameter: clampOD,
      clampScrewLength: bl.clampScrewLength,
      clampRecess: bl.clampBottomZ,
    },
    cover: {
      od: coverOD,
      printHeight: coverPrintHeight(cs),
      plateUndersideZ,
      topZ: coverTopZ,
      innerTopGap: solved.innerTopGap,
    },
    rod: {
      diameter: p.core.diameter,
      bottomZ: rodBottomZ,
      topZ: rodTopZ,
      requiredLength: solved.requiredLength,
      cutOff: solved.cutOff,
      endGap: ceiling - rodTopZ,
      stripZone: [zt + p.base.collarHeight, plateUndersideZ - p.cover.bossHeight],
    },
    totalHeight: coverTopZ,
    placements,
    fit,
  };
  return { dims, layout };
}

/**
 * The form checks: a squeezed form (warning), and the 2 mm radial rules of a form
 * against the other stack, the rod and the parts around the end segments: the rod
 * collar beside the bottom inner segment, the cover's boss and inner capture ring
 * around the top ones (errors). The bed is checked with every other part, through
 * maxOD.
 */
function formMessages(
  p: LampParams,
  layout: Layout,
  ctx: { inner: SegmentDims; outer: SegmentDims; coreReach: number; stackBottomZ: number },
): Message[] {
  const out: Message[] = [];
  const { specs, base: bl } = layout;
  const cs = specs.cover;
  const w = p.segments.wall;
  const lead = p.segments.rimLeadIn;
  const Ri = p.tubes.innerOD / 2;
  const Ro = p.tubes.outerOD / 2;
  const used = (vs: readonly SegmentVariant[]) => vs.filter((v) => v.bands.length > 0);
  const innerVariants = used(specs.variants.inner);
  const outerVariants = used(specs.variants.outer);
  const waistDepth = (v: SegmentVariant) => (v.form === 'waist' ? effectiveAmplitude(v.spec) : 0);
  const core = p.core.kind === 'led-tube' ? 'LED tube' : 'rod and LED strip';

  for (const [name, path, variants] of [
    ['Inner', 'tubes.innerFormOD', innerVariants],
    ['Outer', 'tubes.outerFormOD', outerVariants],
  ] as const) {
    for (const v of variants) {
      const a = formAmplitude(v.spec);
      const reached = effectiveAmplitude(v.spec);
      if (a - reached <= SQUEEZE_TOLERANCE) continue;
      const D = v.spec.D;
      out.push(
        message(
          'form-squeezed',
          v.form === 'waist'
            ? `${name} waist segments are too short to narrow to ${f1(D - 2 * a)} mm; the waist reaches ${f1(D - 2 * reached)} mm.`
            : `${name} ${FORMS[v.form].label.toLowerCase()} segments are too short for a ${f1(D + 2 * a)} mm form; it reaches ${f1(D + 2 * reached)} mm.`,
          path,
        ),
      );
    }
  }

  // ------------------------------------------------ the stacks and the rod
  const innerSocketR = socketOD(specs.inner) / 2;
  let innerWidest = innerSocketR;
  for (const v of innerVariants) innerWidest = Math.max(innerWidest, segmentRMax(v.spec));
  const straightInside = Ro - w - lead;
  let outerInside = straightInside;
  for (const v of outerVariants) outerInside = Math.min(outerInside, straightInside - waistDepth(v));
  if (innerWidest > innerSocketR + 1e-9 && innerWidest + FORM_GAP > outerInside + 1e-9) {
    out.push(
      message(
        'form-too-wide',
        `The inner forms (${f1(2 * innerWidest)} mm) run into the outer segments; the inner form diameter can be at most ${f1(floor1(2 * (outerInside - FORM_GAP)))} mm.`,
        'tubes.innerFormOD',
      ),
    );
  }
  const innerStraightInside = Ri - w - lead;
  for (const v of innerVariants) {
    const depth = waistDepth(v);
    // a tube too narrow even when straight is core-vs-inner-tube
    if (depth <= 0 || innerStraightInside < ctx.coreReach || innerStraightInside - depth >= ctx.coreReach - 1e-9) continue;
    out.push(
      message(
        'form-too-narrow',
        `An inner waist down to ${f1(2 * (Ri - depth))} mm leaves no room for the ${core}; with a waist the inner form diameter can be at most ${f1(floor1(v.spec.D + 2 * (innerStraightInside - ctx.coreReach)))} mm.`,
        'tubes.innerFormOD',
      ),
    );
  }
  for (const v of outerVariants) {
    const depth = waistDepth(v);
    const room = straightInside - FORM_GAP - innerWidest;
    if (depth <= 0 || room < 0 || room - depth >= -1e-9) continue;
    out.push(
      message(
        'form-too-narrow',
        `An outer waist down to ${f1(2 * (Ro - depth))} mm runs into the inner segments; with a waist the outer form diameter can be at most ${f1(floor1(v.spec.D + 2 * room))} mm.`,
        'tubes.outerFormOD',
      ),
    );
  }

  // ------------------------------------------------ the parts around the end segments
  // radius range of band k's form over a world z range, null when its zone is not there
  const rangeAt = (stack: 'inner' | 'outer', k: number, zLo: number, zHi: number): { form: FormId; range: [number, number] } | null => {
    const d = ctx[stack];
    const form = d.forms[k];
    const spec = form && specs.variants[stack].find((v) => v.form === form)?.spec;
    if (!form || !spec || form === 'straight') return null;
    const bottom = ctx.stackBottomZ + k * d.pitch;
    const { z0, z1 } = formZone(spec);
    const lo = Math.max(z0, zLo - bottom);
    const hi = Math.min(z1, zHi - bottom);
    return lo < hi ? { form, range: formRadiusRange(spec, lo, hi) } : null;
  };
  const plate = ctx.outer.topZ;
  // a waist is blamed only where the straight tube would clear (the other checks cover the rest)
  const waistHits = (hit: { form: FormId; range: [number, number] } | null, R: number, r: number): boolean =>
    hit?.form === 'waist' && R - w >= r + FORM_GAP && hit.range[0] - w < r + FORM_GAP;
  const collar = rangeAt('inner', 0, bl.height, bl.height + p.base.collarHeight);
  if (waistHits(collar, Ri, bl.collarR)) {
    out.push(
      message('form-too-narrow', `The bottom inner segment's waist runs into the rod collar (${f1(2 * bl.collarR)} mm).`, 'tubes.innerFormOD'),
    );
  }
  const innerTop = ctx.inner.count - 1;
  const boss = rangeAt('inner', innerTop, plate - p.cover.bossHeight, plate);
  if (waistHits(boss, Ri, cs.boss.rOut)) {
    out.push(
      message('form-too-narrow', `The top inner segment's waist runs into the cover boss (${f1(2 * cs.boss.rOut)} mm).`, 'tubes.innerFormOD'),
    );
  }
  const ringLo = plate - cs.innerRing.height;
  const innerRing = rangeAt('inner', innerTop, ringLo, plate);
  if (innerRing && innerRing.form !== 'waist' && innerRing.range[1] > cs.innerRing.rIn + 1e-9) {
    out.push(message('form-too-wide', "The top inner segment's form runs into the cover's inner capture ring.", 'tubes.innerFormOD'));
  }
  const outerRing = rangeAt('outer', ctx.outer.count - 1, ringLo, plate);
  if (waistHits(outerRing, Ro, cs.innerRing.rOut)) {
    out.push(message('form-too-narrow', "The top outer segment's waist runs into the cover's inner capture ring.", 'tubes.outerFormOD'));
  }
  return out;
}

/** Rod end gap window around the nominal gap (for tests and docs). */
export const rodGapWindow = (p: LampParams): [number, number] => [
  p.cover.rodEndGap - ROD_GAP_SLACK,
  p.cover.rodEndGap + ROD_GAP_SLACK,
];

function failedDims(p: LampParams, error: Message): DerivedDims {
  const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const seg = (D: number, target: number): SegmentDims => ({
    count: 0,
    height: num(target),
    targetHeight: num(target),
    deviation: 0,
    pitch: 0,
    D: num(D),
    socketOD: num(D),
    stackBottomZ: 0,
    topZ: 0,
    forms: [],
    maxOD: num(D),
  });
  const fit = {} as DerivedDims['fit'];
  for (const id of PART_IDS) fit[id] = { size: [0, 0, 0], fitsBed: false, fitsZ: false };
  return {
    ok: false,
    messages: [error],
    seatZ: 0,
    ringHeight: 0,
    inner: seg(p?.tubes?.innerOD, p?.segments?.innerHeight),
    outer: seg(p?.tubes?.outerOD, p?.segments?.outerHeight),
    base: {
      height: 0,
      topZ: 0,
      printHeight: 0,
      collarOD: 0,
      screwZ: 0,
      wireRouting: 'beside-collar',
      pocketDiameter: 0,
      pocketDepth: 0,
      bossDiameter: 0,
      clampDiameter: 0,
      clampScrewLength: 0,
      clampRecess: 0,
    },
    cover: { od: 0, printHeight: 0, plateUndersideZ: 0, topZ: 0, innerTopGap: 0 },
    rod: {
      diameter: num(p?.core?.diameter),
      bottomZ: 0,
      topZ: 0,
      requiredLength: num(p?.core?.length),
      cutOff: 0,
      endGap: 0,
      stripZone: [0, 0],
    },
    totalHeight: 0,
    placements: { base: [], 'inner-segment': [], 'outer-segment': [], 'top-cover': [], 'plate-clamp': [], 'fit-test': [] },
    fit,
  };
}
