/**
 * Quality tiers and adaptive downgrade. Pure logic, no three.js.
 * high = bloom (EffectComposer) + pixel ratio ≤ 2; low = direct render at pixel ratio 1.
 */
import type { GlowMode, QualityTier } from './types';

/** Median frame interval above which 'auto' drops to the low tier. */
export const FRAME_BUDGET_MS = 28;
/** Number of consecutive animated frames considered. */
export const SAMPLE_WINDOW = 30;
/** Intervals above this are stalls (tab switch, GC, shader compile), not steady-state cost. */
const MAX_SAMPLE_MS = 250;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Collects frame intervals while the scene animates; reports when the budget is blown. */
export class FrameSampler {
  private samples: number[] = [];
  private readonly window: number;
  private readonly budgetMs: number;

  constructor(window = SAMPLE_WINDOW, budgetMs = FRAME_BUDGET_MS) {
    this.window = window;
    this.budgetMs = budgetMs;
  }

  /** Returns true once `window` samples are in and their median exceeds the budget. */
  push(intervalMs: number): boolean {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > MAX_SAMPLE_MS) return false;
    this.samples.push(intervalMs);
    if (this.samples.length > this.window) this.samples.shift();
    return this.samples.length >= this.window && median(this.samples) > this.budgetMs;
  }

  get count(): number {
    return this.samples.length;
  }

  reset(): void {
    this.samples = [];
  }
}

export interface DeviceHints {
  coarsePointer: boolean;
  cores?: number | undefined;
  memoryGb?: number | undefined;
}

export function readDeviceHints(): DeviceHints {
  if (typeof window === 'undefined') return { coarsePointer: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
  };
}

/** Starting tier for a glow setting. 'auto' starts high except on small touch devices. */
export function initialTier(glow: GlowMode, hints: DeviceHints): QualityTier {
  if (glow === 'on') return 'high';
  if (glow === 'off') return 'low';
  const weak = (hints.cores !== undefined && hints.cores <= 4) || (hints.memoryGb !== undefined && hints.memoryGb <= 4);
  return hints.coarsePointer && weak ? 'low' : 'high';
}

export interface TierSettings {
  bloom: boolean;
  maxPixelRatio: number;
}

/**
 * Concrete renderer settings. 'off' keeps the sharp pixel ratio (without bloom the
 * scene is cheap); the low tier of 'auto' is the reduced-cost fallback.
 */
export function tierSettings(glow: GlowMode, tier: QualityTier): TierSettings {
  if (glow === 'on') return { bloom: true, maxPixelRatio: 2 };
  if (glow === 'off') return { bloom: false, maxPixelRatio: 2 };
  return tier === 'high' ? { bloom: true, maxPixelRatio: 2 } : { bloom: false, maxPixelRatio: 1 };
}
