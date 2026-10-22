/**
 * Height solver and derived dimensions: the golden values at the defaults
 * (snapshot + explicit), the closure of the stacks on the rod over a
 * parameter grid, auto ↔ locked round trips and the locked-mode rod cut.
 */
import { describe, expect, it } from 'vitest';
import { deriveDims } from '../../src/geometry/derive';
import { PRINTER_PRESETS, defaultParams } from '../../src/geometry/params';
import { INNER_GAP_RANGE, fitStackAuto, fitStackLocked, solveStacks } from '../../src/geometry/solver';
import type { LampParams, PrinterId } from '../../src/geometry/types';
import { withParams } from '../helpers/params';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(eps);

describe('golden values at the defaults', () => {
  const p = defaultParams();
  const d = deriveDims(p);
  const s = solveStacks(p);

  it('match the specification', () => {
    expect(d.ok).toBe(true);
    close(d.seatZ, 21.25);
    close(d.ringHeight, 21.75);
    close(d.base.height, 46);
    close(d.base.printHeight, 81);
    close(d.base.screwZ - d.base.topZ, 27.75);
    close(s.A_o, 1465.75);
    expect(d.outer.count).toBe(11);
    close(d.outer.height, 154.5);
    close(d.outer.pitch, 133.25);
    close(d.outer.deviation, 0.03, 1e-9);
    expect(d.inner.count).toBe(11);
    close(d.inner.height, 154.3);
    close(d.cover.plateUndersideZ, 1533.5);
    close(d.rod.bottomZ, 31);
    close(d.rod.topZ, 1531);
    close(d.rod.endGap, 2.5);
    close(d.rod.requiredLength, 1500);
    close(d.rod.cutOff, 0);
    close(d.totalHeight, 1536.5);
    close(d.cover.od, 205.3);
    close(d.outer.socketOD, 202.1);
    close(d.inner.socketOD, 62.1);
    close(d.cover.innerTopGap, 2.2, 1e-9);
    expect(d.base.wireRouting).toBe('beside-collar');
  });

  it('snapshot', () => {
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    expect({
      seatZ: r(d.seatZ),
      ringHeight: r(d.ringHeight),
      base: { height: r(d.base.height), printHeight: r(d.base.printHeight), screwAboveTop: r(d.base.screwZ - d.base.topZ), wire: d.base.wireRouting },
      A_o: r(s.A_o),
      outer: { count: d.outer.count, height: r(d.outer.height), pitch: r(d.outer.pitch), deviation: r(d.outer.deviation) },
      inner: { count: d.inner.count, height: r(d.inner.height), pitch: r(d.inner.pitch), deviation: r(d.inner.deviation) },
      plateUndersideZ: r(d.cover.plateUndersideZ),
      rod: { bottomZ: r(d.rod.bottomZ), topZ: r(d.rod.topZ), endGap: r(d.rod.endGap) },
      totalHeight: r(d.totalHeight),
      coverOD: r(d.cover.od),
      socketODs: [r(d.outer.socketOD), r(d.inner.socketOD)],
      messages: d.messages.map((m) => `${m.severity}:${m.code}`),
    }).toMatchSnapshot();
  });

  it('LED-tube preset: wire through the socket, base 58', () => {
    const t = withParams((q) => {
      q.core.kind = 'led-tube';
      q.core.diameter = 28;
    });
    const dt = deriveDims(t);
    expect(dt.ok).toBe(true);
    expect(dt.base.wireRouting).toBe('through-socket');
    close(dt.base.height, 58);
    expect(dt.messages.map((m) => m.code)).toContain('wire-routing-through-socket');
    close(dt.rod.requiredLength, 1500);
  });
});

describe('fitStackAuto', () => {
  const w = { seatZ: 0, Hmin: 1, Hmax: 1000 };
  const any = { min: -1000, max: 1000 };
  it('picks the count closest to the target, fewer segments on a tie', () => {
    // N = 2 → 60 (+10), N = 3 → 40 (−10)
    expect(fitStackAuto(120, 50, w, any)!.count).toBe(2);
    expect(fitStackAuto(120, 41, w, any)!.count).toBe(3);
  });
  it('rounds to 0.1 only while the excess stays in range, else 0.01, else exact', () => {
    const exact = fitStackAuto(1000 / 3, 100, { seatZ: 0, Hmin: 1, Hmax: 1000 }, { min: -0.001, max: 0.001 })!;
    expect(exact.count).toBe(3);
    close(exact.height, 1000 / 9, 1e-9);
    const hundredth = fitStackAuto(1000 / 3, 100, w, { min: -0.02, max: 0.02 })!;
    close(hundredth.height, 111.11, 1e-9);
    const tenth = fitStackAuto(1000 / 3, 100, w, { min: -0.5, max: 0.5 })!;
    close(tenth.height, 111.1, 1e-9);
  });
  it('returns null when no count fits the window', () => {
    expect(fitStackAuto(5, 50, { seatZ: 0, Hmin: 10, Hmax: 20 }, any)).toBeNull();
    expect(fitStackAuto(25, 50, { seatZ: 0, Hmin: 15, Hmax: 20 }, any)).toBeNull();
  });
  it('clamps to the printer height', () => {
    const f = fitStackAuto(1000, 400, { seatZ: 20, Hmin: 40, Hmax: 179 }, any)!;
    expect(f.height).toBeLessThanOrEqual(179);
  });
});

describe('fitStackLocked', () => {
  it('takes the largest count whose stack ends at most range.max above A', () => {
    const f = fitStackLocked(1000, 120, { seatZ: 20, Hmin: 40, Hmax: 255 }, { min: -0.5, max: 0.5 });
    expect(f.count).toBe(10);
    close(f.excess, 0);
    const g = fitStackLocked(1000.4, 120, { seatZ: 20, Hmin: 40, Hmax: 255 }, { min: -0.5, max: 0.5 });
    expect(g.count).toBe(10);
    close(g.excess, -0.4);
    const h = fitStackLocked(999.6, 120, { seatZ: 20, Hmin: 40, Hmax: 255 }, { min: -0.5, max: 0.5 });
    expect(h.count).toBe(10);
    close(h.excess, 0.4);
  });
});

describe('locked mode', () => {
  it('reports the rod cut and keeps the nominal end gap', () => {
    const p = withParams((q) => {
      q.segments.heightMode = 'locked';
      q.segments.outerHeight = 140;
      q.segments.innerHeight = 140;
    });
    const d = deriveDims(p);
    const s = solveStacks(p);
    expect(d.outer.count).toBe(Math.floor((s.A_o + 0.5) / (140 - d.seatZ)));
    expect(d.rod.cutOff).toBeGreaterThan(0.5);
    close(d.rod.requiredLength, p.core.length - d.rod.cutOff);
    close(d.rod.endGap, p.cover.rodEndGap);
    close(d.outer.height, 140);
    expect(d.messages.map((m) => m.code)).toContain('inner-height-adjusted');
    expect(d.cover.innerTopGap).toBeGreaterThanOrEqual(INNER_GAP_RANGE[0]);
    expect(d.cover.innerTopGap).toBeLessThanOrEqual(INNER_GAP_RANGE[1]);
  });
  it('refuses to cut an LED tube', () => {
    const p = withParams((q) => {
      q.core.kind = 'led-tube';
      q.core.diameter = 28;
      q.segments.heightMode = 'locked';
      q.segments.outerHeight = 140;
    });
    const d = deriveDims(p);
    expect(d.ok).toBe(false);
    expect(d.messages.map((m) => m.code)).toContain('led-tube-not-cuttable');
    close(d.rod.requiredLength, p.core.length);
  });
  it('auto mode keeps segments within the Bambu X1C / P1S height (250 mm)', () => {
    // 1420 mm rod, 250 mm targets: 6 × 252.2 mm would not fit a 250 mm build height
    const p = withParams((q) => {
      q.core.length = 1420;
      q.segments.outerHeight = 250;
      q.segments.innerHeight = 250;
    });
    expect(p.printer.bedZ).toBe(250);
    const d = deriveDims(p);
    expect(d.ok).toBe(true);
    expect(d.outer.height).toBeLessThanOrEqual(249);
    expect(d.inner.height).toBeLessThanOrEqual(249);
    expect(d.outer.count).toBe(7);
    expect(PRINTER_PRESETS['bambu-256'].bed).toEqual([256, 256, 250]);
  });

  it('flags segments taller than the printer', () => {
    const p = withParams((q) => {
      q.segments.heightMode = 'locked';
      q.segments.outerHeight = 250;
      q.printer = { ...q.printer, preset: 'bambu-a1-mini', bedX: 180, bedY: 180, bedZ: 180 };
    });
    const d = deriveDims(p);
    expect(d.messages.map((m) => m.code)).toContain('segment-too-tall');
    expect(d.ok).toBe(false);
  });
});

describe('parameter grid', () => {
  const lengths = [600, 777, 1000, 1234, 1500, 1750, 2000];
  const targets = [80, 110, 150, 190, 250];
  const overlaps = [10, 20, 30];
  const clearances = [0.15, 0.25, 0.4];
  const cores = [20, 28];
  const printers: PrinterId[] = ['bambu-256', 'bambu-a1-mini', 'prusa-mk4', 'ender-3'];

  const grid: LampParams[] = [];
  for (const L of lengths)
    for (const Ht of targets)
      for (const ov of overlaps)
        for (const c of clearances)
          for (const core of cores)
            for (const printer of printers) {
              grid.push(
                withParams((p) => {
                  p.core.length = L;
                  p.core.diameter = core;
                  if (core === 28) p.core.kind = 'led-tube';
                  p.segments.outerHeight = Ht;
                  p.segments.innerHeight = Ht;
                  p.segments.overlap = ov;
                  p.tolerances.segment = c;
                  const bed = PRINTER_PRESETS[printer].bed;
                  p.printer = { ...p.printer, preset: printer, bedX: bed[0], bedY: bed[1], bedZ: bed[2] };
                }),
              );
            }

  it(`closes every stack on the rod (${grid.length} combinations)`, () => {
    for (const p of grid) {
      const d = deriveDims(p);
      const tag = `L${p.core.length} H${p.segments.outerHeight} ov${p.segments.overlap} c${p.tolerances.segment} d${p.core.diameter} ${p.printer.preset}`;
      const codes = d.messages.map((m) => m.code);
      expect(codes, tag).not.toContain('rod-too-short');
      expect(codes, tag).not.toContain('no-feasible-height');
      expect(d.outer.count, tag).toBeGreaterThanOrEqual(1);
      expect(d.inner.count, tag).toBeGreaterThanOrEqual(1);
      expect(d.rod.endGap, tag).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(d.rod.endGap, tag).toBeLessThanOrEqual(3 + 1e-9);
      expect(d.cover.innerTopGap, tag).toBeGreaterThanOrEqual(INNER_GAP_RANGE[0] - 1e-9);
      expect(d.cover.innerTopGap, tag).toBeLessThanOrEqual(INNER_GAP_RANGE[1] + 1e-9);
      expect(d.outer.height, tag).toBeLessThanOrEqual(p.printer.bedZ - 1 + 1e-9);
      expect(d.inner.height, tag).toBeLessThanOrEqual(p.printer.bedZ - 1 + 1e-9);
      close(d.rod.requiredLength, p.core.length);
      close(d.cover.plateUndersideZ, d.outer.topZ);
      close(d.rod.topZ, d.rod.bottomZ + p.core.length);
      close(d.cover.plateUndersideZ - p.cover.bossHeight + p.cover.bossHoleDepth - d.rod.topZ, d.rod.endGap);
      if (Math.abs(d.outer.deviation) > p.segments.maxDeviation + 1e-9) expect(codes, tag).toContain('segment-deviation');
    }
  });

  it('round-trips auto → locked → same stacks', () => {
    for (const p of grid) {
      const a = deriveDims(p);
      const locked = withParams((q) => {
        Object.assign(q, structuredClone(p));
        q.segments.heightMode = 'locked';
        q.segments.outerHeight = a.outer.height;
        q.segments.innerHeight = a.inner.height;
      });
      const l = deriveDims(locked);
      const tag = `L${p.core.length} H${p.segments.outerHeight} ov${p.segments.overlap} c${p.tolerances.segment} ${p.printer.preset}`;
      expect(l.outer.count, tag).toBe(a.outer.count);
      expect(l.inner.count, tag).toBe(a.inner.count);
      close(l.outer.height, a.outer.height);
      close(l.inner.height, a.inner.height);
      close(l.rod.cutOff, 0);
      close(l.rod.endGap, a.rod.endGap);
      close(l.cover.innerTopGap, a.cover.innerTopGap);
      expect(l.messages.map((m) => m.code), tag).not.toContain('inner-height-adjusted');
      expect(l.messages.map((m) => m.code), tag).not.toContain('led-tube-not-cuttable');
    }
  });

  it('round-trips locked → auto: a locked height that closes exactly is what auto picks', () => {
    for (const L of lengths) {
      const p = withParams((q) => (q.core.length = L));
      const a = deriveDims(p);
      const l = deriveDims(
        withParams((q) => {
          q.core.length = L;
          q.segments.heightMode = 'locked';
          q.segments.outerHeight = a.outer.height;
          q.segments.innerHeight = a.inner.height;
        }),
      );
      const back = deriveDims(
        withParams((q) => {
          q.core.length = l.rod.requiredLength;
          q.segments.outerHeight = l.outer.height;
          q.segments.innerHeight = l.inner.height;
        }),
      );
      expect(back.outer.count).toBe(l.outer.count);
      close(back.outer.height, l.outer.height);
      expect(back.inner.count).toBe(l.inner.count);
    }
  });
});
