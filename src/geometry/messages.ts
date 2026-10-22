/**
 * Message codes the engine emits from `deriveDims`. The UI shows `text` and may
 * jump to `path`; it can key styling or help links off `code`.
 *
 * `bed-fit-<part>` and `z-fit-<part>` are families (one code per PartId).
 */
import type { Message, PartId } from './types';

export type Severity = Message['severity'];

/** Every fixed code with its severity. */
export const MESSAGE_CODES = {
  // errors: export is refused while any of these is present
  'rod-too-short': 'error',
  'no-feasible-height': 'error',
  'segment-too-tall': 'error',
  'led-tube-not-cuttable': 'error',
  'core-vs-inner-tube': 'error',
  'collar-vs-ring': 'error',
  'intake-overlap': 'error',
  'profile-invalid': 'error',
  'tubes-too-close': 'error',
  'base-too-small': 'error',
  'wire-no-room': 'error',
  'screw-vs-collar': 'error',
  'invalid-number': 'error',
  'out-of-range': 'error',
  // warnings
  'segment-deviation': 'warning',
  'inner-height-adjusted': 'warning',
  'inner-slits-dropped': 'warning',
  'outer-slits-dropped': 'warning',
  'vase-wall': 'warning',
  // info
  'base-height-raised': 'info',
  'wire-routing-through-socket': 'info',
  'pocket-needs-supports': 'info',
  'screw-height-raised': 'info',
} as const satisfies Record<string, Severity>;

export type MessageCode = keyof typeof MESSAGE_CODES;

/** Families of part-specific errors: `bed-fit-base`, `z-fit-outer-segment`, … */
export const bedFitCode = (id: PartId): string => `bed-fit-${id}`;
export const zFitCode = (id: PartId): string => `z-fit-${id}`;

export function message(code: MessageCode, text: string, path?: string): Message {
  const m: Message = { severity: MESSAGE_CODES[code], code, text };
  if (path !== undefined) m.path = path;
  return m;
}

export function errorMessage(code: string, text: string, path?: string): Message {
  const m: Message = { severity: 'error', code, text };
  if (path !== undefined) m.path = path;
  return m;
}

/** Errors first, then warnings, then info; stable within a severity. */
export function sortMessages(messages: Message[]): Message[] {
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return messages
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank[a.m.severity] - rank[b.m.severity] || a.i - b.i)
    .map((x) => x.m);
}

/** Human labels of the parts, for message texts and docs. */
export const PART_LABELS: Record<PartId, string> = {
  base: 'Base',
  'inner-segment': 'Inner segment',
  'outer-segment': 'Outer segment',
  'top-cover': 'Top cover',
  'plate-clamp': 'Plate clamp',
  'fit-test': 'Fit test',
};
