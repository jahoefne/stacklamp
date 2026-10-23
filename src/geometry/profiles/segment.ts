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
 *
 * Between the shoulder and the next segment's socket the body takes the
 * segment's form (profiles/forms.ts): round forms replace both body lines by
 * the form's curve, ribbed forms keep them straight with a ring every few mm
 * for the builder's warp. Foot, shoulder, rim and the straight stretches next
 * to them are the same for every form.
 */
import { FORMS } from '../forms';
import type { SegmentSpec } from '../layout';
import type { Profile } from '../profile';
import { jointProfile, ribbedProfile, roundFormProfile } from './forms';

export function segmentProfile(s: SegmentSpec): Profile {
  if (s.form === 'straight') return jointProfile(s);
  return FORMS[s.form].round ? roundFormProfile(s) : ribbedProfile(s);
}

/** Seat height of the joint: ov + c + λ. */
export { seatHeight } from './forms';
