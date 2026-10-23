/**
 * View-mode layout: where each part copy goes (lamp frame: mm, z-up, inside `root`).
 * A copy's world matrix is T(offset) · placement, so the modes only differ by
 * per-copy translations plus the outer stack's fade, which makes tweening trivial.
 */
import { Matrix4 } from 'three';
import type { DerivedDims, PartId } from '../geometry';
import type { FrameBounds } from './framing';
import type { ViewMode } from './types';

export type LampPartId = Exclude<PartId, 'fit-test'>;
export const LAMP_PART_IDS: readonly LampPartId[] = ['base', 'inner-segment', 'outer-segment', 'top-cover', 'plate-clamp'];

export type Offset = [number, number, number];

/** Vertical gap added per segment index in the exploded view (mm). */
export const EXPLODE_STEP_MM = 30;
/**
 * Clearance between the inner assembly and the outer stack moved aside (mm, added to the
 * outer stack's widest point, so a bulging form never touches the base or the inner stack).
 */
export const OUTER_SIDE_GAP_MM = 80;
/** Outer glow level in the "inner" view (a faint ghost of the outer stack). */
export const INNER_VIEW_GHOST = 0.08;
export const LAYOUT_TWEEN_MS = 400;

export interface LayoutState {
  offsets: Record<LampPartId, Offset[]>;
  /** Multiplier on the outer stack's glow (1 normally, 0.08 in the inner view). */
  outerGlow: number;
  /** Multiplier on the outer stack's sheen opacity (0 hides it). */
  outerSheen: number;
}

const zero = (): Offset => [0, 0, 0];

export function copyCount(dims: DerivedDims, id: LampPartId): number {
  return dims.placements[id]?.length ?? 0;
}

export function computeLayout(dims: DerivedDims, mode: ViewMode): LayoutState {
  const n = (id: LampPartId) => copyCount(dims, id);
  const exploded = mode === 'exploded';
  const step = exploded ? EXPLODE_STEP_MM : 0;
  const outerShift = exploded ? outerSideShift(dims) : 0;
  const topIndex = Math.max(n('inner-segment'), n('outer-segment')) + 1;
  return {
    offsets: {
      base: Array.from({ length: n('base') }, zero),
      'inner-segment': Array.from({ length: n('inner-segment') }, (_, k): Offset => [0, 0, k * step]),
      'outer-segment': Array.from({ length: n('outer-segment') }, (_, k): Offset => [outerShift, 0, k * step]),
      'top-cover': Array.from({ length: n('top-cover') }, (): Offset => [0, 0, topIndex * step]),
      // the plate clamp stays inside the base's pocket in every view
      'plate-clamp': Array.from({ length: n('plate-clamp') }, zero),
    },
    outerGlow: mode === 'inner' ? INNER_VIEW_GHOST : 1,
    outerSheen: mode === 'inner' ? 0 : 1,
  };
}

/** How far the exploded view moves the outer stack aside (mm): its widest point plus the gap. */
export function outerSideShift(dims: DerivedDims): number {
  return dims.outer.maxOD + OUTER_SIDE_GAP_MM;
}

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** Interpolates two layouts; copies missing on one side interpolate from/to zero offset. */
export function lerpLayout(a: LayoutState, b: LayoutState, t: number): LayoutState {
  const mix = (x: number, y: number) => x + (y - x) * t;
  const offsets = {} as Record<LampPartId, Offset[]>;
  for (const id of LAMP_PART_IDS) {
    const to = b.offsets[id];
    const from = a.offsets[id];
    offsets[id] = to.map((o, k): Offset => {
      const f = from[k] ?? zero();
      return [mix(f[0], o[0]), mix(f[1], o[1]), mix(f[2], o[2])];
    });
  }
  return { offsets, outerGlow: mix(a.outerGlow, b.outerGlow), outerSheen: mix(a.outerSheen, b.outerSheen) };
}

/** T(offset) · placement. `placement` is a column-major 4×4 (16 numbers). */
export function placementMatrix(placement: readonly number[], offset: Offset, out = new Matrix4()): Matrix4 {
  out.fromArray(placement as number[]);
  // Pre-multiplying by a pure translation only adds to the translation column.
  out.elements[12] += offset[0];
  out.elements[13] += offset[1];
  out.elements[14] += offset[2];
  return out;
}

/** The per-copy objects LampScene keeps. `group` carries the matrix; its children share it. */
export interface PartCopy {
  group: { matrix: Matrix4; matrixAutoUpdate: boolean; matrixWorldNeedsUpdate: boolean; visible: boolean };
  glow?: { visible: boolean } | undefined;
  sheen?: { visible: boolean } | undefined;
  solid?: { visible: boolean } | undefined;
}
export type PartCopies = Partial<Record<LampPartId, PartCopy[]>>;

/** Writes the layout into the copy groups (matrices + outer visibility). */
export function applyLayout(copies: PartCopies, dims: DerivedDims, layout: LayoutState): void {
  for (const id of LAMP_PART_IDS) {
    const list = copies[id];
    if (!list) continue;
    const placements = dims.placements[id] ?? [];
    list.forEach((copy, k) => {
      const p = placements[k];
      if (!p) {
        copy.group.visible = false;
        return;
      }
      copy.group.visible = true;
      copy.group.matrixAutoUpdate = false;
      placementMatrix(p, layout.offsets[id][k] ?? zero(), copy.group.matrix);
      copy.group.matrixWorldNeedsUpdate = true;
      if (id === 'outer-segment') {
        if (copy.sheen) copy.sheen.visible = layout.outerSheen > 0.001;
        if (copy.glow) copy.glow.visible = layout.outerGlow > 0.001;
      }
    });
  }
}

/**
 * What the camera must show for a mode, in metres. The radius covers the widest point of
 * both stacks (`maxOD`: a bulging form can stand out past the base and the cover).
 */
export function layoutBounds(dims: DerivedDims, mode: ViewMode): FrameBounds {
  const radiusMm = Math.max(
    (dims.fit.base?.size[0] ?? 0) / 2,
    dims.cover.od / 2,
    dims.outer.maxOD / 2,
    dims.inner.maxOD / 2,
    1,
  );
  let heightMm = dims.totalHeight;
  let maxXMm = radiusMm;
  if (mode === 'exploded') {
    const nIn = copyCount(dims, 'inner-segment');
    const nOut = copyCount(dims, 'outer-segment');
    const coverLift = (Math.max(nIn, nOut) + 1) * EXPLODE_STEP_MM;
    heightMm = Math.max(dims.totalHeight + coverLift, dims.outer.topZ + Math.max(0, nOut - 1) * EXPLODE_STEP_MM);
    maxXMm = outerSideShift(dims) + dims.outer.maxOD / 2;
  }
  return { height: heightMm / 1000, minX: -radiusMm / 1000, maxX: maxXMm / 1000, radius: radiusMm / 1000 };
}
