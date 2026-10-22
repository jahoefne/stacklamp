/**
 * Segment ring profile, print frame (foot on the bed), CCW (r, z).
 *
 *   foot:     socket ID = D + 2c, OD = D + 2c + 2w, straight up to z = ov
 *   shoulder: 45° inward by w + c (carries the rim of the segment below)
 *   body:     OD = D, wall w
 *   rim:      leans inward 45° over λ at constant (horizontal) wall w
 *
 * A segment sits on the one below at seatZ = ov + c + λ: its shoulder's inner
 * cone coincides with the lower rim's outer cone.
 */
import { dedupe, type Profile } from '../profile';
import type { SegmentSpec } from '../layout';

export function segmentProfile(s: SegmentSpec): Profile {
  const R = s.D / 2;
  const { wall: w, overlap: ov, clearance: c, leadIn: l, height: H } = s;
  return dedupe([
    [R + c, 0],
    [R + c + w, 0],
    [R + c + w, ov],
    [R, ov + w + c],
    [R, H - l],
    [R - l, H],
    [R - l - w, H],
    [R - w, H - l],
    [R - w, ov + w + c],
    [R + c, ov],
  ]);
}

/** Seat height of the joint: ov + c + λ. */
export const seatHeight = (s: SegmentSpec): number => s.overlap + s.clearance + s.leadIn;
