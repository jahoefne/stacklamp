import { describe, expect, it } from 'vitest';
import {
  computeFraming,
  directionFromAngles,
  FRAME_MARGIN,
  frameDistance,
  MAX_ZOOM,
  MIN_ZOOM,
  shouldReframe,
  TARGET_HEIGHT_FRACTION,
  type FrameBounds,
} from './framing';

const tan15 = Math.tan((15 * Math.PI) / 180);
const lamp: FrameBounds = { height: 1.5335, minX: -0.12, maxX: 0.12, radius: 0.12 };

describe('frameDistance', () => {
  it('fits a tall lamp by its height', () => {
    const d = frameDistance(1.53, 0.12, 30, 0.6);
    expect(d).toBeCloseTo((1.53 * FRAME_MARGIN) / 2 / tan15 + 0.12, 6);
  });

  it('fits a wide, low object by its width', () => {
    const d = frameDistance(0.2, 1, 30, 1);
    expect(d).toBeCloseTo((1 * FRAME_MARGIN) / tan15 + 1, 6);
    expect(d).toBeGreaterThan((0.2 * FRAME_MARGIN) / 2 / tan15 + 1);
  });

  it('backs off for narrow viewports only when width becomes the limit', () => {
    const wideView = frameDistance(1.53, 0.12, 30, 1.8);
    const portrait = frameDistance(1.53, 0.12, 30, 0.5);
    expect(portrait).toBeCloseTo(wideView, 6); // still height-limited at 0.5
    const veryNarrow = frameDistance(1.53, 0.12, 30, 0.05);
    expect(veryNarrow).toBeGreaterThan(wideView);
  });

  it('grows monotonically as the aspect shrinks', () => {
    const aspects = [3, 2, 1, 0.5, 0.2, 0.1, 0.05];
    const ds = aspects.map((a) => frameDistance(0.6, 0.4, 30, a));
    for (let i = 1; i < ds.length; i++) expect(ds[i]!).toBeGreaterThanOrEqual(ds[i - 1]! - 1e-9);
  });

  it('treats a broken aspect or fov as sane defaults', () => {
    expect(frameDistance(1, 0.1, 30, 0)).toBeCloseTo(frameDistance(1, 0.1, 30, 1), 9);
    expect(frameDistance(1, 0.1, 30, Number.NaN)).toBeCloseTo(frameDistance(1, 0.1, 30, 1), 9);
    expect(frameDistance(1, 0.1, Number.NaN, 1)).toBeCloseTo(frameDistance(1, 0.1, 30, 1), 9);
    expect(Number.isFinite(frameDistance(0, 0, 30, 1))).toBe(true);
  });

  it('scales with the margin', () => {
    expect(frameDistance(1, 0.01, 30, 1, 1.5)).toBeGreaterThan(frameDistance(1, 0.01, 30, 1, 1.0));
  });
});

describe('computeFraming', () => {
  it('targets 48 % of the height on the lamp axis and looks from az 35° / el 10°', () => {
    const f = computeFraming(lamp, 30, 1);
    expect(f.target[0]).toBeCloseTo(0, 9);
    expect(f.target[1]).toBeCloseTo(lamp.height * TARGET_HEIGHT_FRACTION, 9);
    const dir = [0, 1, 2].map((i) => (f.position[i]! - f.target[i]!) / f.distance);
    const expected = directionFromAngles(35, 10);
    dir.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
    expect(Math.atan2(dir[0]!, dir[2]!) * (180 / Math.PI)).toBeCloseTo(35, 6);
    expect(Math.asin(dir[1]!) * (180 / Math.PI)).toBeCloseTo(10, 6);
  });

  it('keeps a user direction and zoom', () => {
    const base = computeFraming(lamp, 30, 1);
    const f = computeFraming(lamp, 30, 1, { direction: [0, 0, -2], zoom: 2 });
    expect(f.distance).toBeCloseTo(base.distance * 2, 9);
    expect(f.position[2]).toBeCloseTo(f.target[2] - f.distance, 9);
  });

  it('clamps zoom to 0.5–3× and sets matching limits', () => {
    const base = computeFraming(lamp, 30, 1);
    expect(computeFraming(lamp, 30, 1, { zoom: 10 }).distance).toBeCloseTo(base.distance * MAX_ZOOM, 9);
    expect(computeFraming(lamp, 30, 1, { zoom: 0.01 }).distance).toBeCloseTo(base.distance * MIN_ZOOM, 9);
    expect(base.minDistance).toBeCloseTo(base.distance * MIN_ZOOM, 9);
    expect(base.maxDistance).toBeCloseTo(base.distance * MAX_ZOOM, 9);
  });

  it('never lets the camera go under the floor, even fully zoomed out', () => {
    const f = computeFraming(lamp, 30, 1);
    const lowestY = f.target[1] + Math.cos(f.maxPolarAngle) * f.maxDistance;
    expect(f.maxPolarAngle).toBeGreaterThanOrEqual(Math.PI / 2);
    expect(lowestY).toBeGreaterThan(0);
  });

  it('centres a laterally extended (exploded) layout', () => {
    const exploded: FrameBounds = { height: 1.9, minX: -0.12, maxX: 0.38, radius: 0.12 };
    const f = computeFraming(exploded, 30, 1.5);
    expect(f.target[0]).toBeCloseTo(0.13, 9);
    expect(f.distance).toBeGreaterThan(computeFraming(lamp, 30, 1.5).distance);
  });
});

describe('shouldReframe', () => {
  it('reframes the first time and on > 10 % height changes only', () => {
    expect(shouldReframe(null, lamp)).toBe(true);
    expect(shouldReframe(lamp, { ...lamp, height: lamp.height * 1.05 })).toBe(false);
    expect(shouldReframe(lamp, { ...lamp, height: lamp.height * 1.15 })).toBe(true);
    expect(shouldReframe(lamp, { ...lamp, height: lamp.height * 0.85 })).toBe(true);
  });

  it('reframes when the layout widens or shifts sideways', () => {
    expect(shouldReframe(lamp, { ...lamp, maxX: 0.4 })).toBe(true);
  });
});
