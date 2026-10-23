import {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { DEFAULT_FORM, FORMS, FORM_IDS } from '../../geometry';
import type { FormId } from '../../geometry';
import { selectFittedBands, selectPalette, useDims, useLamp, useLampActions } from '../../state';
import type { LampState, Stack } from '../../state';
import { FormGlyph } from '../illustrations/icons';
import { Button } from '../primitives/Button';
import { SegmentedControl, type SegmentOption } from '../primitives/SegmentedControl';
import { VisuallyHidden } from '../primitives/VisuallyHidden';
import { clamp, cx, pad2 } from '../primitives/format';
import { colourIndex } from './derived';
import styles from './FormBandEditor.module.css';
import panel from './panel.module.css';

interface Cursor {
  stack: Stack;
  index: number;
}

interface Stroke extends Cursor {
  pointerId: number;
}

const STACK_LABEL: Record<Stack, string> = { outer: 'Outer', inner: 'Inner' };
/** Columns left → right, like the colour editor's "Outer | Inner". */
const COLUMNS: readonly Stack[] = ['outer', 'inner'];

/** The brush picker: one glyph per form, the name for screen readers, name and hint as the tooltip. */
const BRUSH_OPTIONS: readonly SegmentOption<FormId>[] = FORM_IDS.map((id) => ({
  value: id,
  label: (
    <>
      <FormGlyph form={id} size={24} />
      <VisuallyHidden>{FORMS[id].label}</VisuallyHidden>
    </>
  ),
  title: `${FORMS[id].label}. ${FORMS[id].hint}`,
}));

const selectFormBrush = (s: LampState): FormId => s.ui.formBrush;

const keyOf = (c: Cursor): string => `${c.stack}:${c.index}`;

const formLabel = (form: FormId | undefined): string => FORMS[form ?? DEFAULT_FORM].label;

/** Brush on band 1, 3, 5 … (index 0, 2, 4 … from the bottom), straight in between. */
export const alternateForms = (brush: FormId, n: number): FormId[] =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? brush : DEFAULT_FORM));

function tileAt(el: Element | null): Cursor | null {
  const tile = el?.closest<HTMLElement>('[data-form-stack]');
  if (!tile) return null;
  const stack = tile.dataset.formStack;
  const index = Number(tile.dataset.formIndex);
  if ((stack !== 'inner' && stack !== 'outer') || !Number.isInteger(index)) return null;
  return { stack, index };
}

/**
 * The body form of every segment, as the colour editor draws the bands: two columns of tiles
 * (band 1 at the bottom, tile height ∝ segment pitch), each tile tinted with its band colour
 * and showing its form's glyph. A "Form brush" picker above, Fill / Alternate under each
 * column. Click or drag paints with the brush; one tab stop with arrow-key navigation,
 * Enter/Space paints, 1–8 pick the brush.
 */
export function FormBandEditor(): ReactElement {
  const dims = useDims();
  const bands = useLamp(selectFittedBands);
  const palette = useLamp(selectPalette);
  const brush = useLamp(selectFormBrush);
  const { paintForm, setForms, setFormBrush } = useLampActions();
  const [cursor, setCursor] = useState<Cursor>({ stack: 'outer', index: 0 });
  const [said, setSaid] = useState('');
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const stroke = useRef<Stroke | null>(null);
  const byId = useMemo(() => colourIndex(palette), [palette]);
  const pickerLabelId = useId();
  const pickerHintId = useId();
  const helpId = useId();

  // Forms fitted to the current N (selectFittedForms), bottom → top.
  const forms: Record<Stack, FormId[]> = { outer: dims.outer.forms, inner: dims.inner.forms };
  const counts: Record<Stack, number> = { outer: forms.outer.length, inner: forms.inner.length };
  const empty = counts.outer === 0 && counts.inner === 0;
  // Keep the cursor on an existing tile when N shrinks.
  const curStack: Stack = counts[cursor.stack] > 0 ? cursor.stack : counts.outer > 0 ? 'outer' : 'inner';
  const cur: Cursor = { stack: curStack, index: clamp(cursor.index, 0, Math.max(0, counts[curStack] - 1)) };

  const brushLabel = formLabel(brush);
  const hexOf = (stack: Stack, index: number): string => {
    const id = bands[stack][index];
    return (id ? byId.get(id)?.hex : undefined) ?? palette[0]?.hex ?? '';
  };
  const labelFor = (stack: Stack, index: number, form: FormId | undefined): string =>
    `${STACK_LABEL[stack]} band ${index + 1} of ${counts[stack]}: ${formLabel(form)}`;

  // Tile heights exactly as in the colour editor, so the two editors line up.
  const outerStackMm = Math.max(1, dims.outer.topZ - dims.outer.stackBottomZ);
  const pxPerMm = clamp(360 / outerStackMm, 0.12, 0.24);
  const tileHeight = (stack: Stack, index: number): number => {
    const s = dims[stack];
    const mm = index === counts[stack] - 1 ? s.height : s.pitch;
    return Math.max(1, mm * pxPerMm);
  };

  const pickBrush = (form: FormId) => {
    setFormBrush(form);
    setSaid(`Form brush: ${formLabel(form)}.`);
  };

  const fill = (stack: Stack) => {
    const n = counts[stack];
    if (n === 0) return;
    setForms(stack, Array<FormId>(n).fill(brush));
    setSaid(`${STACK_LABEL[stack]}: all ${n} bands ${brushLabel}.`);
  };

  const alternate = (stack: Stack) => {
    const n = counts[stack];
    if (n === 0) return;
    setForms(stack, alternateForms(brush, n));
    setSaid(
      brush === DEFAULT_FORM
        ? `${STACK_LABEL[stack]}: all ${n} bands ${brushLabel}.`
        : `${STACK_LABEL[stack]}: ${brushLabel} and ${formLabel(DEFAULT_FORM)} alternating over ${n} bands.`,
    );
  };

  const moveTo = (c: Cursor) => {
    setCursor(c);
    tiles.current.get(keyOf(c))?.focus();
  };

  const onTileKeyDown = (e: KeyboardEvent<HTMLButtonElement>, stack: Stack, index: number) => {
    const top = counts[stack] - 1;
    const other: Stack = stack === 'outer' ? 'inner' : 'outer';
    switch (e.key) {
      case 'ArrowUp':
        moveTo({ stack, index: Math.min(top, index + 1) });
        break;
      case 'ArrowDown':
        moveTo({ stack, index: Math.max(0, index - 1) });
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const target: Stack = e.key === 'ArrowLeft' ? 'outer' : 'inner';
        if (target === stack || counts[other] === 0) break;
        moveTo({ stack: target, index: Math.min(index, counts[target] - 1) });
        break;
      }
      case 'Home':
        moveTo({ stack, index: 0 });
        break;
      case 'End':
        moveTo({ stack, index: top });
        break;
      default: {
        const form = /^[1-8]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey ? FORM_IDS[Number(e.key) - 1] : undefined;
        if (form) {
          pickBrush(form);
          break;
        }
        return;
      }
    }
    e.preventDefault();
  };

  const onTileClick = (e: MouseEvent<HTMLButtonElement>, stack: Stack, index: number) => {
    paintForm(stack, index);
    setCursor({ stack, index });
    // detail 0 = activated from the keyboard: confirm what happened.
    if (e.detail === 0) setSaid(`${labelFor(stack, index, brush)}.`);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = tileAt(e.target as Element);
    if (!t) return;
    stroke.current = { ...t, pointerId: e.pointerId };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable (synthetic event) */
    }
    paintForm(t.stack, t.index);
    setCursor(t);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const st = stroke.current;
    if (!st || st.pointerId !== e.pointerId || typeof document.elementFromPoint !== 'function') return;
    const t = tileAt(document.elementFromPoint(e.clientX, e.clientY));
    if (!t || t.stack !== st.stack || t.index === st.index) return;
    // Paint every band between the last painted one and this one (fast drags skip tiles).
    const step = t.index > st.index ? 1 : -1;
    for (let i = st.index + step; ; i += step) {
      paintForm(st.stack, i);
      if (i === t.index) break;
    }
    st.index = t.index;
    setCursor(t);
  };

  const endStroke = (e: PointerEvent<HTMLDivElement>) => {
    if (stroke.current?.pointerId !== e.pointerId) return;
    stroke.current = null;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  if (empty) {
    return (
      <div className={cx(styles.editor, styles.empty)}>
        <p>No bands yet. Set a rod length the stacks can fit.</p>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <div className={panel.control}>
        <span id={pickerLabelId} className={panel.controlLabel}>
          Form brush
        </span>
        <SegmentedControl
          labelledBy={pickerLabelId}
          describedBy={pickerHintId}
          options={BRUSH_OPTIONS}
          value={brush}
          onChange={pickBrush}
          size="sm"
          block
          className={cx(styles.picker)}
        />
        <p id={pickerHintId} className={panel.hint}>
          <strong className={styles.brushName}>{brushLabel}</strong> {FORMS[brush].hint}
        </p>
      </div>

      <p id={helpId} className="visually-hidden">
        Arrow keys move between bands, left and right switch stacks, Enter gives the band the brush form, number keys 1 to 8 pick a
        brush form.
      </p>
      <div className={styles.grid} role="group" aria-label={`Segment forms, brush ${brushLabel}`} aria-describedby={helpId}>
        {COLUMNS.map((stack, c) => (
          <span key={stack} className={cx('micro', styles.head)} style={{ gridColumn: c + 2 }} aria-hidden="true">
            {STACK_LABEL[stack]} · {counts[stack]}
          </span>
        ))}
        <div className={styles.numbers} aria-hidden="true">
          {forms.outer.map((_, i) => (
            <span key={i} className={styles.number} style={{ height: `${tileHeight('outer', i)}px` }}>
              {pad2(i + 1)}
            </span>
          ))}
        </div>
        {COLUMNS.map((stack, c) => (
          <div
            key={stack}
            className={styles.column}
            style={{ gridColumn: c + 2 }}
            role="group"
            aria-label={`${STACK_LABEL[stack]} stack forms, ${counts[stack]} bands, bottom to top`}
            data-form-column={stack}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onLostPointerCapture={endStroke}
          >
            {forms[stack].map((form, i) => {
              const isCursor = cur.stack === stack && cur.index === i;
              const label = labelFor(stack, i, form);
              return (
                <button
                  key={i}
                  ref={(el) => {
                    const k = keyOf({ stack, index: i });
                    if (el) tiles.current.set(k, el);
                    else tiles.current.delete(k);
                  }}
                  type="button"
                  className={cx(styles.tile, isCursor && styles.cursor)}
                  style={{ '--_c': hexOf(stack, i), height: `${tileHeight(stack, i)}px` } as CSSProperties}
                  aria-label={label}
                  title={label}
                  tabIndex={isCursor ? 0 : -1}
                  data-form-stack={stack}
                  data-form-index={i}
                  data-form={form}
                  onClick={(e) => onTileClick(e, stack, i)}
                  onKeyDown={(e) => onTileKeyDown(e, stack, i)}
                  onFocus={() => {
                    if (!isCursor) setCursor({ stack, index: i });
                  }}
                >
                  <FormGlyph form={form} size={20} className={styles.glyph} />
                  <FormGlyph form={brush} size={20} className={styles.preview} />
                </button>
              );
            })}
          </div>
        ))}
        {COLUMNS.map((stack, c) => (
          <div key={stack} className={styles.actions} style={{ gridColumn: c + 2 }}>
            <Button
              size="sm"
              variant="secondary"
              className={styles.action}
              disabled={counts[stack] === 0}
              aria-label={`Fill ${STACK_LABEL[stack].toLowerCase()} stack with ${brushLabel}`}
              onClick={() => fill(stack)}
            >
              Fill
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className={styles.action}
              disabled={counts[stack] === 0}
              aria-label={`Alternate ${STACK_LABEL[stack].toLowerCase()} stack: ${brushLabel} and ${formLabel(DEFAULT_FORM)}`}
              onClick={() => alternate(stack)}
            >
              Alternate
            </Button>
          </div>
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
