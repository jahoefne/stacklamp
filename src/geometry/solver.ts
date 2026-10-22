/**
 * Height solver: how many segments of which height make the stacks close
 * exactly on the rod. Pure, no kernel.
 *
 * World z (see layout.ts): base top z_t, spigot rings of height
 * ringHeight = seatZ + footGap, segment k (1-based) bottom at
 * z_t + footGap + (k − 1)·P, stack top = z_t + ringHeight + N·P = cover plate
 * underside. The rod stands on the socket floor z_t − socketBelowTop and must
 * end rodEndGap below the boss hole ceiling, so
 *
 *   N_o·P_o = A_o = L − socketBelowTop − ringHeight + bossHeight − bossHoleDepth + rodEndGap
 *   N_i·P_i = A_i = N_o·P_o − INNER_TOP_GAP
 *
 * ("excess" below = N·P − A: how much taller the stack is than nominal; the
 * rod end gap is rodEndGap + excess, the inner top gap INNER_TOP_GAP − excess.)
 */
import type { LampParams } from './types';

/** Nominal gap between the inner stack's top rim and the cover plate, mm. */
export const INNER_TOP_GAP = 2;
/** Allowed inner top gap. */
export const INNER_GAP_RANGE: readonly [number, number] = [0.5, 7];
/** The rod end gap may move this far from its nominal value. */
export const ROD_GAP_SLACK = 0.5;
/** Minimum straight body of a segment above its shoulder and below its rim, mm. */
export const MIN_BODY = 10;
/** Segments may be at most bedZ − this tall. */
export const BED_Z_MARGIN = 1;

const TINY = 1e-9;

export interface FitWindow {
  seatZ: number;
  Hmin: number;
  Hmax: number;
}

/** Allowed excess N·P − A of a stack (inclusive). */
export interface ExcessRange {
  min: number;
  max: number;
}

export interface StackFit {
  count: number;
  height: number;
  pitch: number;
  /** N·P − A */
  excess: number;
}

export function joint(p: LampParams): { seatZ: number; ringHeight: number; window: FitWindow } {
  const c = p.tolerances.segment;
  const seatZ = p.segments.overlap + c + p.segments.rimLeadIn;
  const ringHeight = seatZ + p.base.footGap;
  const Hmin = p.segments.overlap + p.segments.wall + c + p.segments.rimLeadIn + MIN_BODY;
  const Hmax = p.printer.bedZ - BED_Z_MARGIN;
  return { seatZ, ringHeight, window: { seatZ, Hmin, Hmax } };
}

/** A_o: the length the outer stack's pitches must add up to. */
export function outerStackLength(p: LampParams, ringHeight: number): number {
  return (
    p.core.length -
    p.base.socketBelowTop -
    ringHeight +
    p.cover.bossHeight -
    p.cover.bossHoleDepth +
    p.cover.rodEndGap
  );
}

export const outerExcess = (): ExcessRange => ({ min: -ROD_GAP_SLACK, max: ROD_GAP_SLACK });
export const innerExcess = (): ExcessRange => ({
  min: INNER_TOP_GAP - INNER_GAP_RANGE[1],
  max: INNER_TOP_GAP - INNER_GAP_RANGE[0],
});

/** The segment counts that keep the height inside the window, or null. */
export function feasibleCounts(A: number, w: FitWindow): [number, number] | null {
  const Pmin = w.Hmin - w.seatZ;
  const Pmax = w.Hmax - w.seatZ;
  if (!(A > 0) || !(Pmin > 0) || !(Pmax >= Pmin)) return null;
  const nLo = Math.max(1, Math.ceil(A / Pmax - TINY));
  const nHi = Math.floor(A / Pmin + TINY);
  return nLo <= nHi ? [nLo, nHi] : null;
}

/**
 * Auto fit: the count whose exact height A/N + seatZ is closest to `target`
 * (tie → fewer segments) among floor/ceil(A/(target − seatZ)) clamped to the
 * feasible counts; the height is then rounded to 0.1 mm (else 0.01 mm) when
 * the excess stays inside `range` and the height inside the window.
 */
export function fitStackAuto(A: number, target: number, w: FitWindow, range: ExcessRange): StackFit | null {
  const counts = feasibleCounts(A, w);
  if (!counts) return null;
  const [nLo, nHi] = counts;
  const t = Math.min(w.Hmax, Math.max(w.Hmin, target));
  const Pt = t - w.seatZ;
  const raw = [Math.floor(A / Pt), Math.ceil(A / Pt)].map((n) => Math.min(nHi, Math.max(nLo, n)));
  let best = raw[0]!;
  const err = (n: number) => Math.abs(A / n + w.seatZ - target);
  for (const n of raw) {
    const d = err(n) - err(best);
    if (d < -TINY || (Math.abs(d) <= TINY && n < best)) best = n;
  }
  const exactH = A / best + w.seatZ;
  let height = exactH;
  for (const step of [0.1, 0.01]) {
    const h = Math.round(exactH / step) * step;
    const hr = Number(h.toFixed(step === 0.1 ? 1 : 2));
    const ex = best * (hr - w.seatZ) - A;
    if (ex >= range.min - TINY && ex <= range.max + TINY && hr >= w.Hmin - TINY && hr <= w.Hmax + TINY) {
      height = hr;
      break;
    }
  }
  const pitch = height - w.seatZ;
  return { count: best, height, pitch, excess: snap(best * pitch - A) };
}

/**
 * Locked fit: the height is given. The count is the largest N whose stack is
 * at most `range.max` taller than A. `excess` may fall below `range.min`
 * (the caller cuts the rod or re-fits).
 */
export function fitStackLocked(A: number, height: number, w: FitWindow, range: ExcessRange): StackFit {
  const pitch = height - w.seatZ;
  const count = pitch > 0 && A > 0 ? Math.max(0, Math.floor((A + range.max) / pitch + TINY)) : 0;
  return { count, height, pitch, excess: snap(count * pitch - A) };
}

function snap(v: number): number {
  return Math.abs(v) < 1e-7 ? 0 : v;
}

export interface StackSolution {
  fit: StackFit;
  /** false when no count satisfies the window (values are a best-effort fallback). */
  feasible: boolean;
  targetHeight: number;
}

export interface SolvedStacks {
  seatZ: number;
  ringHeight: number;
  window: FitWindow;
  A_o: number;
  A_i: number;
  outer: StackSolution;
  inner: StackSolution;
  /** Locked mode re-fitted the inner stack because its gap left the range. */
  innerAdjusted: boolean;
  /** Length the rod must be cut to (LED tubes: always the full length). */
  requiredLength: number;
  /** How much to cut off the rod (> 0 only in locked mode). */
  cutOff: number;
  /** Rod end gap below the boss hole ceiling. */
  endGap: number;
  /** Actual inner top gap. */
  innerTopGap: number;
}

function fallback(A: number, target: number, w: FitWindow): StackFit {
  const Pt = Math.max(1, Math.min(w.Hmax, Math.max(w.Hmin, target)) - w.seatZ);
  const count = Math.max(1, Math.round(A / Pt) || 1);
  const height = Math.max(w.Hmin, Math.min(w.Hmax, target));
  const pitch = height - w.seatZ;
  return { count, height, pitch, excess: count * pitch - A };
}

/** Solve both stacks and the rod for the given parameters. Never throws. */
export function solveStacks(p: LampParams): SolvedStacks {
  const { seatZ, ringHeight, window } = joint(p);
  const A_o = outerStackLength(p, ringHeight);
  const locked = p.segments.heightMode === 'locked';
  const oRange = outerExcess();
  const iRange = innerExcess();
  const oTarget = p.segments.outerHeight;
  const iTarget = p.segments.innerHeight;

  let outer: StackSolution;
  if (locked) {
    const fit = fitStackLocked(A_o, oTarget, window, oRange);
    outer = { fit, feasible: fit.count >= 1, targetHeight: oTarget };
  } else {
    const fit = fitStackAuto(A_o, oTarget, window, oRange);
    outer = fit
      ? { fit, feasible: true, targetHeight: oTarget }
      : { fit: fallback(A_o, oTarget, window), feasible: false, targetHeight: oTarget };
  }

  const stackO = outer.fit.count * outer.fit.pitch;
  const A_i = stackO - INNER_TOP_GAP;
  let inner: StackSolution;
  let innerAdjusted = false;
  const autoInner = (): StackSolution => {
    const fit = fitStackAuto(A_i, iTarget, window, iRange);
    return fit
      ? { fit, feasible: true, targetHeight: iTarget }
      : { fit: fallback(A_i, iTarget, window), feasible: false, targetHeight: iTarget };
  };
  if (locked) {
    const fit = fitStackLocked(A_i, iTarget, window, iRange);
    const ok =
      fit.count >= 1 &&
      fit.excess >= iRange.min - TINY &&
      iTarget >= window.Hmin - TINY &&
      iTarget <= window.Hmax + TINY;
    if (ok) inner = { fit, feasible: true, targetHeight: iTarget };
    else {
      inner = autoInner();
      innerAdjusted = true;
    }
  } else {
    inner = autoInner();
  }

  // Rod: auto mode keeps the length (the gap absorbs the rounding); locked
  // mode cuts the rod when the stack ends more than the slack below nominal.
  const cuttable = p.core.kind !== 'led-tube';
  let cutOff = 0;
  let endGap = p.cover.rodEndGap + outer.fit.excess;
  if (locked && outer.fit.excess < oRange.min - TINY) {
    cutOff = -outer.fit.excess;
    if (cuttable) endGap = p.cover.rodEndGap;
  }
  const requiredLength = cuttable ? p.core.length - cutOff : p.core.length;
  const innerTopGap = stackO - inner.fit.count * inner.fit.pitch;
  return {
    seatZ,
    ringHeight,
    window,
    A_o,
    A_i,
    outer,
    inner,
    innerAdjusted,
    requiredLength,
    cutOff: snap(cutOff),
    endGap: snap(endGap - p.cover.rodEndGap) + p.cover.rodEndGap,
    innerTopGap,
  };
}
