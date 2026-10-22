import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { selectFittedBands, selectPalette, useDims, useLamp, useLampActions } from '../../state';
import type { LampState, Stack } from '../../state';
import { clamp, cx, pad2 } from '../primitives/format';
import styles from './ColourBandEditor.module.css';
import { colourIndex } from './derived';

interface Cursor {
  stack: Stack;
  index: number;
}

interface Stroke extends Cursor {
  pointerId: number;
}

const STACK_LABEL: Record<Stack, string> = { outer: 'Outer', inner: 'Inner' };
/** Columns left → right, like the design's "Outer | Inner". */
const COLUMNS: readonly Stack[] = ['outer', 'inner'];

const selectBrush = (s: LampState): string => s.ui.brush;

const keyOf = (c: Cursor): string => `${c.stack}:${c.index}`;

function tileAt(el: Element | null): Cursor | null {
  const tile = el?.closest<HTMLElement>('[data-band-stack]');
  if (!tile) return null;
  const stack = tile.dataset.bandStack;
  const index = Number(tile.dataset.bandIndex);
  if ((stack !== 'inner' && stack !== 'outer') || !Number.isInteger(index)) return null;
  return { stack, index };
}

/**
 * The two stacks as columns of tiles, drawn like the lamp (band 1 at the bottom, tile
 * height ∝ visible segment height). Click or drag paints with the brush; one tab stop with
 * arrow-key navigation, Enter/Space paints, 1–9 pick the brush.
 */
export function ColourBandEditor(): ReactElement {
  const bands = useLamp(selectFittedBands);
  const palette = useLamp(selectPalette);
  const brush = useLamp(selectBrush);
  const dims = useDims();
  const { paintBand, setBrush } = useLampActions();
  const [cursor, setCursor] = useState<Cursor>({ stack: 'outer', index: 0 });
  const [said, setSaid] = useState('');
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const stroke = useRef<Stroke | null>(null);
  const byId = useMemo(() => colourIndex(palette), [palette]);

  const counts: Record<Stack, number> = { outer: bands.outer.length, inner: bands.inner.length };
  const empty = counts.outer === 0 && counts.inner === 0;
  // Keep the cursor on an existing tile when N shrinks.
  const curStack: Stack = counts[cursor.stack] > 0 ? cursor.stack : counts.outer > 0 ? 'outer' : 'inner';
  const cur: Cursor = { stack: curStack, index: clamp(cursor.index, 0, Math.max(0, counts[curStack] - 1)) };

  const nameOf = (id: string | undefined): string => (id ? (byId.get(id)?.name ?? id) : '');
  const hexOf = (id: string | undefined): string => (id ? byId.get(id)?.hex : undefined) ?? palette[0]?.hex ?? '';
  const brushName = nameOf(brush);
  const labelFor = (stack: Stack, index: number, colourId: string | undefined): string =>
    `${STACK_LABEL[stack]} band ${index + 1} of ${counts[stack]}: ${nameOf(colourId)}`;

  // Tile heights: pitch for every band, the full segment for the top one; one scale for both columns.
  const outerStackMm = Math.max(1, dims.outer.topZ - dims.outer.stackBottomZ);
  const pxPerMm = clamp(360 / outerStackMm, 0.12, 0.24);
  const tileHeight = (stack: Stack, index: number): number => {
    const s = dims[stack];
    const mm = index === counts[stack] - 1 ? s.height : s.pitch;
    return Math.max(1, mm * pxPerMm);
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
        if (/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
          const c = palette[Number(e.key) - 1];
          if (c) {
            setBrush(c.id);
            setSaid(`Brush: ${c.name}.`);
          }
          break;
        }
        return;
      }
    }
    e.preventDefault();
  };

  const onTileClick = (e: MouseEvent<HTMLButtonElement>, stack: Stack, index: number) => {
    paintBand(stack, index);
    setCursor({ stack, index });
    // detail 0 = activated from the keyboard: confirm what happened.
    if (e.detail === 0) setSaid(`${labelFor(stack, index, brush)}.`);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = tileAt(e.target as Element);
    if (!t) return;
    stroke.current = { ...t, pointerId: e.pointerId };
    const el = e.currentTarget;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable (synthetic event) */
    }
    paintBand(t.stack, t.index);
    setCursor(t);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const st = stroke.current;
    if (!st || st.pointerId !== e.pointerId || typeof document.elementFromPoint !== 'function') return;
    const t = tileAt(document.elementFromPoint(e.clientX, e.clientY));
    if (!t || t.stack !== st.stack || t.index === st.index) return;
    // Fill every band between the last painted one and this one (fast drags skip tiles).
    const step = t.index > st.index ? 1 : -1;
    for (let i = st.index + step; ; i += step) {
      paintBand(st.stack, i);
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
    <div className={styles.editor} style={{ '--_brush': hexOf(brush) } as CSSProperties}>
      <p id="band-editor-help" className="visually-hidden">
        Arrow keys move between bands, left and right switch stacks, Enter paints with the brush, number keys 1 to 9 pick a brush colour.
      </p>
      <div className={styles.grid} role="group" aria-label={`Colour bands, brush ${brushName}`} aria-describedby="band-editor-help">
        {COLUMNS.map((stack, c) => (
          <span key={stack} className={cx('micro', styles.head)} style={{ gridColumn: c + 2 }} aria-hidden="true">
            {STACK_LABEL[stack]} · {counts[stack]}
          </span>
        ))}
        <div className={styles.numbers} aria-hidden="true">
          {bands.outer.map((_, i) => (
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
            aria-label={`${STACK_LABEL[stack]} stack, ${counts[stack]} bands, bottom to top`}
            data-stack-column={stack}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onLostPointerCapture={endStroke}
          >
            {bands[stack].map((id, i) => {
              const isCursor = cur.stack === stack && cur.index === i;
              const label = labelFor(stack, i, id);
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
                  style={{ '--_c': hexOf(id), height: `${tileHeight(stack, i)}px` } as CSSProperties}
                  aria-label={label}
                  title={label}
                  tabIndex={isCursor ? 0 : -1}
                  data-band-stack={stack}
                  data-band-index={i}
                  data-colour={id}
                  onClick={(e) => onTileClick(e, stack, i)}
                  onKeyDown={(e) => onTileKeyDown(e, stack, i)}
                  onFocus={() => {
                    if (!isCursor) setCursor({ stack, index: i });
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
