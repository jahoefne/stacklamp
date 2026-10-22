import { Group, Matrix4, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { defaultDims } from './fixtures.test-utils';
import {
  applyLayout,
  computeLayout,
  EXPLODE_STEP_MM,
  INNER_VIEW_GHOST,
  LAMP_PART_IDS,
  layoutBounds,
  lerpLayout,
  OUTER_SIDE_GAP_MM,
  type PartCopies,
  placementMatrix,
} from './layout';
import type { ViewMode } from './types';

function buildCopies(dims = defaultDims()): PartCopies {
  const copies: PartCopies = {};
  for (const id of LAMP_PART_IDS) {
    copies[id] = dims.placements[id].map(() => {
      const group = new Group();
      const glow = new Mesh();
      const sheen = new Mesh();
      group.add(sheen, glow);
      return { group, glow, sheen };
    });
  }
  return copies;
}

const origin = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);

describe('layout', () => {
  const dims = defaultDims();

  it('places every copy at its placement in the assembled view', () => {
    const copies = buildCopies(dims);
    applyLayout(copies, dims, computeLayout(dims, 'assembled'));
    for (const id of LAMP_PART_IDS) {
      expect(copies[id]!.length).toBe(dims.placements[id].length);
      copies[id]!.forEach((c, k) => {
        expect(c.group.matrixAutoUpdate).toBe(false);
        expect(Array.from(c.group.matrix.elements)).toEqual(dims.placements[id][k]);
      });
    }
  });

  it('stacks the segments by their pitch (print frame → world)', () => {
    const copies = buildCopies(dims);
    applyLayout(copies, dims, computeLayout(dims, 'assembled'));
    const outer = copies['outer-segment']!.map((c) => origin(c.group.matrix).z);
    for (let k = 1; k < outer.length; k++) expect(outer[k]! - outer[k - 1]!).toBeCloseTo(dims.outer.pitch, 6);
    // A point at the top rim of the top outer segment lands at the stack top.
    const top = new Vector3(dims.outer.D / 2, 0, dims.outer.height).applyMatrix4(copies['outer-segment']!.at(-1)!.group.matrix);
    expect(top.z).toBeCloseTo(dims.outer.topZ, 3);
  });

  it('flips the cover so its plate ends up on top', () => {
    const copies = buildCopies(dims);
    applyLayout(copies, dims, computeLayout(dims, 'assembled'));
    const m = copies['top-cover']![0]!.group.matrix;
    const bed = new Vector3(0, 0, 0).applyMatrix4(m);
    expect(bed.z).toBeCloseTo(dims.totalHeight, 3);
    const up = new Vector3(0, 0, 1).transformDirection(m);
    expect(up.z).toBeCloseTo(-1, 6);
  });

  it('explodes segments by index·30 mm, lifts the cover and moves the outer stack aside', () => {
    const copies = buildCopies(dims);
    applyLayout(copies, dims, computeLayout(dims, 'exploded'));
    copies['inner-segment']!.forEach((c, k) => {
      const p = origin(placementMatrix(dims.placements['inner-segment'][k]!, [0, 0, 0]));
      const q = origin(c.group.matrix);
      expect(q.x - p.x).toBeCloseTo(0, 9);
      expect(q.z - p.z).toBeCloseTo(k * EXPLODE_STEP_MM, 9);
    });
    copies['outer-segment']!.forEach((c, k) => {
      const p = origin(placementMatrix(dims.placements['outer-segment'][k]!, [0, 0, 0]));
      const q = origin(c.group.matrix);
      expect(q.x - p.x).toBeCloseTo(dims.outer.D + OUTER_SIDE_GAP_MM, 9);
      expect(q.z - p.z).toBeCloseTo(k * EXPLODE_STEP_MM, 9);
    });
    const n = Math.max(dims.inner.count, dims.outer.count);
    const cover = origin(copies['top-cover']![0]!.group.matrix);
    expect(cover.z - dims.totalHeight).toBeCloseTo((n + 1) * EXPLODE_STEP_MM, 6);
    expect(Array.from(copies.base![0]!.group.matrix.elements)).toEqual(dims.placements.base[0]);
  });

  it('ghosts the outer stack in the inner view', () => {
    const copies = buildCopies(dims);
    const layout = computeLayout(dims, 'inner');
    applyLayout(copies, dims, layout);
    expect(layout.outerGlow).toBe(INNER_VIEW_GHOST);
    expect(layout.outerSheen).toBe(0);
    for (const c of copies['outer-segment']!) {
      expect(c.sheen!.visible).toBe(false);
      expect(c.glow!.visible).toBe(true);
      expect(c.group.visible).toBe(true);
    }
    for (const c of copies['inner-segment']!) expect(c.sheen!.visible).toBe(true);
    // Back to assembled restores the sheen.
    applyLayout(copies, dims, computeLayout(dims, 'assembled'));
    for (const c of copies['outer-segment']!) expect(c.sheen!.visible).toBe(true);
  });

  it('interpolates between modes', () => {
    const a = computeLayout(dims, 'assembled');
    const b = computeLayout(dims, 'exploded');
    const half = lerpLayout(a, b, 0.5);
    expect(half.offsets['outer-segment'][2]).toEqual([(dims.outer.D + OUTER_SIDE_GAP_MM) / 2, 0, EXPLODE_STEP_MM]);
    const ghost = lerpLayout(a, computeLayout(dims, 'inner'), 0.5);
    expect(ghost.outerGlow).toBeCloseTo((1 + INNER_VIEW_GHOST) / 2, 9);
  });

  it('hides copies that have no placement (counts changed under the meshes)', () => {
    const copies = buildCopies(dims);
    copies['outer-segment']!.push({ group: new Group() });
    applyLayout(copies, dims, computeLayout(dims, 'assembled'));
    expect(copies['outer-segment']!.at(-1)!.group.visible).toBe(false);
  });

  it('reports bounds per mode (metres)', () => {
    const modes: ViewMode[] = ['assembled', 'inner', 'exploded'];
    const [assembled, inner, exploded] = modes.map((m) => layoutBounds(dims, m));
    expect(assembled!.height).toBeCloseTo(dims.totalHeight / 1000, 9);
    expect(inner).toEqual(assembled);
    expect(exploded!.height).toBeGreaterThan(assembled!.height * 1.1);
    expect(exploded!.maxX).toBeGreaterThan(assembled!.maxX * 2);
  });
});
