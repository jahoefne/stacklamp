/**
 * Parameter sets for the engine tests: the defaults, the LED-tube preset and
 * edge cases across the parameter ranges. Every set is expected to derive
 * without errors unless `expectErrors` lists the codes it should produce.
 */
import { NOZZLES, defaultParams } from '../../src/geometry/params';
import type { LampParams, NozzleId } from '../../src/geometry/types';

export interface ParamCase {
  name: string;
  params: LampParams;
  /** Error codes this set is expected to produce (the geometry must still build). */
  expectErrors?: string[];
}

export function withParams(mutate: (p: LampParams) => void): LampParams {
  const p = defaultParams();
  mutate(p);
  return p;
}

export const ledTube = (): LampParams =>
  withParams((p) => {
    p.core.kind = 'led-tube';
    p.core.diameter = 28;
  });

/** The defaults on another nozzle, with the wall the app sets for it. */
export const withNozzle = (id: NozzleId): LampParams =>
  withParams((p) => {
    p.printer.nozzle = id;
    p.segments.wall = NOZZLES[id].wall;
  });

export const CASES: ParamCase[] = [
  { name: 'defaults', params: defaultParams() },
  { name: 'led tube', params: ledTube() },
  { name: 'short rod 600', params: withParams((p) => (p.core.length = 600)) },
  { name: 'long rod 2000', params: withParams((p) => (p.core.length = 2000)) },
  {
    name: 'short segments 80',
    params: withParams((p) => {
      p.segments.innerHeight = 80;
      p.segments.outerHeight = 80;
    }),
  },
  {
    name: 'tall segments 250',
    params: withParams((p) => {
      p.segments.innerHeight = 250;
      p.segments.outerHeight = 250;
    }),
  },
  { name: 'overlap 10', params: withParams((p) => (p.segments.overlap = 10)) },
  {
    name: 'overlap 30, taller collar',
    params: withParams((p) => {
      p.segments.overlap = 30;
      p.base.collarHeight = 45;
    }),
  },
  { name: 'clearance 0.15', params: withParams((p) => (p.tolerances.segment = 0.15)) },
  { name: 'clearance 0.4', params: withParams((p) => (p.tolerances.segment = 0.4)) },
  { name: 'wall 0.6', params: withParams((p) => (p.segments.wall = 0.6)) },
  { name: 'wall 1.2', params: withParams((p) => (p.segments.wall = 1.2)) },
  { name: 'nozzle 0.4', params: withNozzle('0.4') },
  { name: 'nozzle 0.8', params: withNozzle('0.8') },
  { name: 'lead-in 0.4', params: withParams((p) => (p.segments.rimLeadIn = 0.4)) },
  { name: 'lead-in 2', params: withParams((p) => (p.segments.rimLeadIn = 2)) },
  {
    name: 'small lamp',
    params: withParams((p) => {
      p.tubes.innerOD = 50;
      p.tubes.outerOD = 120;
      p.base.diameter = 170;
      p.plate.od = 120;
    }),
  },
  {
    name: 'big lamp on a big printer',
    params: withParams((p) => {
      p.tubes.outerOD = 240;
      p.base.diameter = 300;
      p.printer = { ...p.printer, preset: 'custom', bedX: 320, bedY: 320, bedZ: 320 };
    }),
  },
  {
    name: 'A1 mini lamp',
    params: withParams((p) => {
      p.printer = { ...p.printer, preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 };
      p.tubes.outerOD = 150;
      p.base.diameter = 170;
      p.plate.od = 120;
    }),
  },
  {
    name: 'no intakes, no screws',
    params: withParams((p) => {
      p.base.intakeCount = 0;
      p.base.screwCount = 0;
    }),
  },
  {
    name: 'many intakes and screws',
    params: withParams((p) => {
      p.base.intakeCount = 12;
      p.base.intakeWidth = 4;
      p.base.screwCount = 6;
    }),
  },
  {
    name: 'many thin slits',
    params: withParams((p) => {
      p.cover.outerSlits = 48;
      p.cover.innerSlits = 24;
      p.cover.slitWidth = 1.5;
    }),
  },
  {
    name: 'no slits',
    params: withParams((p) => {
      p.cover.outerSlits = 0;
      p.cover.innerSlits = 0;
    }),
  },
  { name: 'wire through socket', params: withParams((p) => (p.base.wireRouting = 'through-socket')) },
  {
    name: 'sharp tall base',
    params: withParams((p) => {
      p.base.topRound = 0;
      p.base.minHeight = 80;
    }),
  },
  {
    name: 'no foot gap, tall collar',
    params: withParams((p) => {
      p.base.footGap = 0;
      p.base.collarHeight = 60;
    }),
  },
  {
    name: 'locked 120',
    params: withParams((p) => {
      p.segments.heightMode = 'locked';
      p.segments.outerHeight = 120;
      p.segments.innerHeight = 120;
    }),
  },
  {
    name: 'shallow boss hole',
    params: withParams((p) => {
      p.cover.bossHeight = 20;
      p.cover.bossHoleDepth = 8;
    }),
  },
  {
    name: 'thick wall, short lead-in',
    params: withParams((p) => {
      p.segments.wall = 2;
      p.segments.rimLeadIn = 0.4;
    }),
  },
  {
    name: 'mixed forms',
    params: withParams((p) => {
      p.forms.inner = ['ball', 'straight', 'drop', 'waist'];
      p.forms.outer = ['barrel', 'star', 'flute', 'twist'];
      p.tubes.innerFormOD = 84;
      p.tubes.outerFormOD = 230;
    }),
  },
  {
    name: 'outer waist around inner drops',
    params: withParams((p) => {
      p.forms.inner = ['drop'];
      p.forms.outer = ['waist', 'straight'];
      p.tubes.innerFormOD = 100;
      p.tubes.outerFormOD = 260;
    }),
  },
  {
    // inner widest 71 mm radius + 2 mm against the outer tube's rim at 73.2 mm
    name: 'inner bulge near the outer tube',
    params: withParams((p) => {
      p.tubes.outerOD = 150;
      p.forms.inner = ['ball', 'flute'];
      p.tubes.innerFormOD = 142;
    }),
  },
  {
    // the waist's inside (30 − 13 − 0.8 − 1 = 15.2 mm) just clears the rod and strip (15 mm)
    name: 'inner waist near the rod',
    params: withParams((p) => {
      p.forms.inner = ['waist'];
      p.tubes.innerFormOD = 86;
    }),
  },
  {
    name: 'inner form too wide',
    params: withParams((p) => {
      p.tubes.outerOD = 150;
      p.forms.inner = ['ball'];
      p.tubes.innerFormOD = 150;
    }),
    expectErrors: ['form-too-wide'],
  },
  {
    // the outer zone is ~34 mm: a 20 mm ball (and the twist) are scaled down (form-squeezed)
    name: 'short 80 mm segments with balls',
    params: withParams((p) => {
      p.segments.innerHeight = 80;
      p.segments.outerHeight = 80;
      p.forms.inner = ['ball'];
      p.forms.outer = ['ball', 'twist'];
    }),
  },
];
