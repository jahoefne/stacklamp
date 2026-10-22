/**
 * Top cover profile (one revolve), print frame: plate on the bed (z = 0..pt),
 * the outer socket ring, the inner capture ring and the boss pointing up; the
 * boss's blind hole opens at the boss tip and its ceiling is at ceilingZ.
 *
 * The bottom outer edge (the lamp's top edge) is "printably rounded": a 45°
 * chamfer from the bed into an arc that turns vertical, so no surface
 * overhangs more than 45°.
 */
import { arc, dedupe, type Profile, type Pt } from '../profile';
import type { CoverSpec } from '../layout';

export function coverProfile(s: CoverSpec, arcSegments = 6): Profile {
  const Rc = s.radius;
  const pt = s.plate;
  const rho = s.edgeRound;
  const k = 1 - Math.SQRT1_2;
  const pts: Pt[] = [[0, 0]];
  if (rho > 0) {
    pts.push([Rc - 2 * rho * k, 0]);
    pts.push(...arc(Rc - rho, rho, rho, -Math.PI / 4, 0, arcSegments));
  } else {
    pts.push([Rc, 0]);
  }
  const o = s.outerRing;
  const i = s.innerRing;
  const b = s.boss;
  pts.push(
    [o.rOut, pt + o.height],
    [o.rIn + o.leadIn, pt + o.height],
    [o.rIn, pt + o.height - o.leadIn],
    [o.rIn, pt],
    [i.rOut, pt],
    [i.rOut, pt + i.height],
    [i.rIn + i.leadIn, pt + i.height],
    [i.rIn, pt + i.height - i.leadIn],
    [i.rIn, pt],
    [b.rOut, pt],
    [b.rOut, pt + b.height],
    [b.holeR + b.holeChamfer, pt + b.height],
    [b.holeR, pt + b.height - b.holeChamfer],
    [b.holeR, b.ceilingZ],
    [0, b.ceilingZ],
  );
  return dedupe(pts);
}
