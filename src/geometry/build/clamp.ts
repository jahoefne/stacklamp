/** Plate clamp solid (print frame, flange on the bed): one revolve, no cutters. */
import type { Manifold, Scope } from '../kernel';
import type { ClampSpec } from '../layout';
import { assertSimpleCCW } from '../profile';
import { clampProfile } from '../profiles/clamp';
import type { Resolution } from '../quality';

export function buildClamp(s: Scope, spec: ClampSpec, res: Resolution): Manifold {
  const profile = clampProfile(spec);
  assertSimpleCCW(profile, 'clamp profile');
  return s.add(s.k.Manifold.revolve([profile], res.revolve(spec.radius)));
}
