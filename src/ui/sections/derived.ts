/**
 * UI-side derived values: memoised store selectors the state package does not offer
 * (bands fitted to the PREVIEW's band counts) and text builders shared by sections.
 */
import type { DerivedDims, ExportStage, PartId, PetgColour } from '../../geometry';
import { fitBands, selectCounts, selectFittedBands, selectPreviewDims } from '../../state';
import type { Bands, ExportJob, Generators, LampState } from '../../state';
import { fmt, listJoin } from '../primitives/format';

function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; value: R } | null = null;
  return (...args: A) => {
    if (last && last.args.length === args.length && last.args.every((a, i) => Object.is(a, args[i]))) return last.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}

const previewFit = memoLast(
  (stored: Bands, gen: Generators, palette: PetgColour[], nInner: number, nOuter: number): Bands => ({
    inner: fitBands(stored.inner, nInner, palette, gen.inner),
    outer: fitBands(stored.outer, nOuter, palette, gen.outer),
  }),
);

/**
 * Band colour ids fitted to the band counts of the parts on screen (`selectPreviewDims`).
 * Equal to `selectFittedBands` once the preview has caught up with the config; during a
 * rebuild after an N change it keeps matching the old meshes. Stable reference.
 */
export function selectPreviewBands(s: LampState): Bands {
  const fitted = selectFittedBands(s);
  const pd = selectPreviewDims(s);
  if (!pd) return fitted;
  const c = selectCounts(s);
  if (pd.inner.count === c.nInner && pd.outer.count === c.nOuter) return fitted;
  return previewFit(s.config.bands, s.config.gen, s.config.palette, pd.inner.count, pd.outer.count);
}

/** Palette lookups. */
export function colourIndex(palette: readonly PetgColour[]): Map<string, PetgColour> {
  return new Map(palette.map((c) => [c.id, c]));
}

export function hexesFor(ids: readonly string[], palette: readonly PetgColour[]): string[] {
  const byId = colourIndex(palette);
  const fallback = palette[0]?.hex ?? '#fff4dc';
  return ids.map((id) => byId.get(id)?.hex ?? fallback);
}

/** Distinct colour names in order of first appearance (bottom → top). */
export function distinctNames(ids: readonly string[], palette: readonly PetgColour[]): string[] {
  const byId = colourIndex(palette);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id)?.name ?? id);
  }
  return out;
}

/** "1.53 m" */
export function metres(mm: number): string {
  return `${fmt(mm / 1000, 2, true)} m`;
}

/** Accessible name of the preview canvas, stating the configuration. */
export function previewLabel(dims: DerivedDims | null, bands: Bands, palette: readonly PetgColour[]): string {
  if (!dims) return 'Lamp preview, loading';
  const outer = listJoin(distinctNames(bands.outer, palette));
  const inner = listJoin(distinctNames(bands.inner, palette));
  return (
    `Lamp preview: ${metres(dims.totalHeight)} tall, ` +
    `${dims.outer.count} outer rings${outer ? ` in ${outer}` : ''}, ` +
    `${dims.inner.count} inner rings${inner ? ` in ${inner}` : ''}`
  );
}

export const PART_LABELS: Record<PartId, string> = {
  base: 'Base',
  'inner-segment': 'Inner segment',
  'outer-segment': 'Outer segment',
  'top-cover': 'Top cover',
  'fit-test': 'Fit-test ring',
};

/** Progress text for a running export. */
export function stageText(stage: ExportStage, done: number, total: number): string {
  if (stage === 'docs') return 'Writing files…';
  if (stage === 'zip') return 'Zipping…';
  const n = Math.min(total, done + 1);
  return `Building print meshes… ${n} of ${total}`;
}

export function exportProgress(job: ExportJob): number {
  if (job.phase !== 'running') return job.phase === 'done' ? 1 : 0;
  return job.total > 0 ? Math.min(1, job.done / job.total) : 0;
}

/** "≈ 98 g" / "≈ 1.43 kg" */
export function grams(g: number): string {
  return g >= 1000 ? `≈ ${fmt(g / 1000, 2)} kg` : `≈ ${fmt(g, 0)} g`;
}

/** Scroll an element into view (instant under reduced motion) and focus it. */
export function scrollAndFocus(el: HTMLElement | null, focusEl: HTMLElement | null = el, block: ScrollLogicalPosition = 'start'): void {
  if (!el) return;
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block });
  focusEl?.focus({ preventScroll: true });
}

/** Focus a field by its param path, opening the tuning panel first when it lives there. */
export function focusField(path: string, openTuning: () => void): void {
  const id = `field-${path}`;
  const find = () => document.getElementById(id);
  const go = (el: HTMLElement) => {
    el.scrollIntoView?.({ block: 'center' });
    el.focus({ preventScroll: true });
  };
  const el = find();
  if (el && !el.closest('details:not([open])')) {
    go(el);
    return;
  }
  openTuning();
  // Wait for the disclosure to open (timers, not rAF: rAF stalls in background tabs).
  let tries = 0;
  const retry = () => {
    const again = find();
    if (again && !again.closest('details:not([open])')) go(again);
    else if (++tries < 10) setTimeout(retry, 30);
  };
  setTimeout(retry, 0);
}
