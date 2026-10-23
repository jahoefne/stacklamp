/**
 * Body forms of the tube segments: the catalogue, the share-link codes and the
 * fit of a stored form list to a segment count. Pure data, no kernel.
 *
 * A form only touches the body between the shoulder and the next segment's
 * socket; the joint stays identical for every form (see profiles/forms.ts).
 */
import type { FormId, PartId } from './types';
import { FORM_IDS } from './types';

export interface FormPreset {
  id: FormId;
  label: string;
  /** One character in the share link (`fi` / `fo`). Never reuse a code. */
  code: string;
  /** Round forms are (r, z) profile changes; the others warp the revolved body. */
  round: boolean;
  hint: string;
}

export const FORMS: Record<FormId, FormPreset> = {
  straight: { id: 'straight', label: 'Straight', code: 's', round: true, hint: 'A plain tube.' },
  drop: { id: 'drop', label: 'Drop', code: 'd', round: true, hint: 'A belly low in the segment, tapering up.' },
  ball: { id: 'ball', label: 'Ball', code: 'b', round: true, hint: 'A belly in the middle of the segment.' },
  waist: { id: 'waist', label: 'Waist', code: 'w', round: true, hint: 'Narrows in the middle of the segment.' },
  barrel: { id: 'barrel', label: 'Barrel', code: 'r', round: true, hint: 'A gentle bulge over the whole body.' },
  star: { id: 'star', label: 'Star', code: 't', round: false, hint: 'Six sharp ridges.' },
  flute: { id: 'flute', label: 'Fluted', code: 'f', round: false, hint: 'Twelve soft ribs.' },
  twist: { id: 'twist', label: 'Twist', code: 'x', round: false, hint: 'Eight ribs turning a quarter around the body.' },
};

export const DEFAULT_FORM: FormId = 'straight';

/** Straight body kept above the shoulder and below the next socket, mm. */
export const ZONE_MARGIN = 2;
export const STAR_POINTS = 6;
export const FLUTE_LOBES = 12;
export const TWIST_LOBES = 8;
/** How far the twist's ribs turn across the form zone, degrees. */
export const TWIST_TURN_DEG = 90;

const FORM_SET: ReadonlySet<string> = new Set(FORM_IDS);
const BY_CODE: ReadonlyMap<string, FormId> = new Map(FORM_IDS.map((id) => [FORMS[id].code, id]));

export function isFormId(v: unknown): v is FormId {
  return typeof v === 'string' && FORM_SET.has(v);
}

/** The form with this share-link code, or undefined. */
export const formByCode = (code: string): FormId | undefined => BY_CODE.get(code);

/**
 * Fit a stored form list to `n` segments, bottom → top: the pattern repeats (longer lists
 * are truncated), unknown ids read as straight, an empty list is all straight.
 */
export function fitForms(stored: readonly string[], n: number): FormId[] {
  if (n <= 0) return [];
  if (stored.length === 0) return Array<FormId>(n).fill(DEFAULT_FORM);
  return Array.from({ length: n }, (_, i) => {
    const v = stored[i % stored.length];
    return isFormId(v) ? v : DEFAULT_FORM;
  });
}

export function formsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x === b[i]));
}

/** True when every fitted form is straight (the default lamp). */
export const allStraight = (forms: readonly FormId[]): boolean => forms.every((f) => f === DEFAULT_FORM);

/**
 * File stem of a part in the ZIP and the BOM: `inner-segment` for a straight segment (and
 * every other part), `inner-segment-ball` for a form. The export adds the extension.
 */
export function partFileStem(id: PartId, form?: FormId): string {
  return form && form !== DEFAULT_FORM ? `${id}-${form}` : id;
}
