/**
 * Base profile (one revolve), print frame = world frame, CCW (r, z): the puck
 * with its bottom chamfer and rounded top edge, the underside plate pocket
 * (mouth chamfer) with the boss hanging from its ceiling (45° tip around the
 * clamp screw's blind pilot hole), both spigot rings (outer cone = a segment
 * rim), the collar (top chamfer) and the rod socket (entry chamfer) down to
 * its floor.
 */
import { arc, dedupe, type Profile, type Pt } from '../profile';
import type { BaseSpec } from '../layout';

export function baseProfile(s: BaseSpec, arcSegments = 8): Profile {
  const R = s.radius;
  const H = s.height;
  const pts: Pt[] = [
    [s.pocketRadius + s.pocketChamfer, 0],
    [R - s.bottomChamfer, 0],
    [R, s.bottomChamfer],
  ];
  if (s.topRound > 0) pts.push(...arc(R - s.topRound, H - s.topRound, s.topRound, 0, Math.PI / 2, arcSegments));
  else pts.push([R, H]);
  for (const ring of s.rings) {
    const top = H + ring.height;
    pts.push(
      [ring.R, H],
      [ring.R, top - ring.leadIn],
      [ring.R - ring.leadIn, top],
      [ring.R - ring.wall, top],
      [ring.R - ring.wall, H],
    );
  }
  const { collar, bore, boss } = s;
  const ctop = H + collar.height;
  // the boss tip's 45° chamfer, cut short when it would reach the ceiling first
  const coneH = Math.max(0, Math.min(boss.radius - boss.tipRadius, s.pocketDepth - boss.tipZ));
  pts.push(
    [collar.radius, H],
    [collar.radius, ctop - collar.topChamfer],
    [collar.radius - collar.topChamfer, ctop],
    [bore.radius + bore.entryChamfer, ctop],
    [bore.radius, ctop - bore.entryChamfer],
    [bore.radius, bore.floorZ],
    [0, bore.floorZ],
    [0, boss.pilotTopZ],
    [boss.pilotRadius, boss.pilotTopZ],
    [boss.pilotRadius, boss.tipZ],
    [boss.tipRadius, boss.tipZ],
    [boss.tipRadius + coneH, boss.tipZ + coneH],
    [boss.tipRadius + coneH, s.pocketDepth],
    [s.pocketRadius, s.pocketDepth],
    [s.pocketRadius, s.pocketChamfer],
  );
  return dedupe(pts);
}
