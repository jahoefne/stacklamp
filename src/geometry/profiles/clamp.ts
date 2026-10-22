/**
 * Plate clamp profile (one revolve), print frame: the flange lies on the bed
 * (z = 0..t) with the 45° countersink for the screw head opening at the bed,
 * the screw clearance hole through the middle and a small chamfer on the
 * bottom outer edge. In the lamp it sits under the weight plate, pulled onto
 * the base's boss by one screw.
 */
import { dedupe, type Profile, type Pt } from '../profile';
import type { ClampSpec } from '../layout';

export function clampProfile(s: ClampSpec): Profile {
  const R = s.radius;
  const t = s.thickness;
  const h = s.holeR;
  const cs = s.countersink;
  const ch = s.bottomChamfer;
  const pts: Pt[] = [
    [h + cs, 0],
    [R - ch, 0],
    [R, ch],
    [R, t],
    [h, t],
    [h, cs],
  ];
  return dedupe(pts);
}
