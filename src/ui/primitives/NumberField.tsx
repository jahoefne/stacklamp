import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Message } from '../../geometry';
import { Field } from './Field';
import { clamp, cx, formatPlain, parseDecimal, roundTo } from './format';
import styles from './NumberField.module.css';

export interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Decimals kept when committing (0 = integers). */
  precision: number;
  /** Shown in a chip after the input ("mm", "%", "×"). */
  unit?: string;
  /** Called with valid, in-range values while typing, and with the clamped value on commit. */
  onChange(value: number): void;
  hint?: ReactNode;
  messages?: readonly Message[];
  /** Adds a linked range slider under the label row. */
  slider?: boolean;
  disabled?: boolean;
  /** 'lg' is the big headline field (rod length). */
  size?: 'md' | 'lg';
  labelAside?: ReactNode;
  className?: string;
}

const UNIT_NAMES: Record<string, string> = { mm: 'millimetres', '%': 'percent', '°': 'degrees' };
/** How long the "set to …" note stays. */
const STATUS_MS = 4000;

/**
 * Text input for a bounded number (inputMode decimal, so phones show a number pad and
 * "0,8" works). Typing keeps a draft: a valid, in-range draft is applied at once; an
 * out-of-range one is flagged with the allowed range. Blur or Enter clamps and normalises,
 * Escape reverts to the value the field had when it got focus, ArrowUp/Down step
 * (Shift × 10, PageUp/PageDown × 10).
 */
export function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  precision,
  unit,
  onChange,
  hint,
  messages,
  slider = false,
  disabled = false,
  size = 'md',
  labelAside,
  className,
}: NumberFieldProps): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const focusValue = useRef(value);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  // "×" is a count marker, not a unit to read out ("0 to 6 ×").
  const unitText = unit && unit !== '×' ? ` ${unit}` : '';
  const showStatus = (text: string) => {
    setStatus(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), STATUS_MS);
  };

  const parsed = draft === null ? null : parseDecimal(draft);
  let error: string | null = null;
  if (draft !== null) {
    if (parsed === null) error = `Enter a number from ${formatPlain(min, precision)} to ${formatPlain(max, precision)}${unitText}.`;
    else if (parsed < min || parsed > max)
      error = `Out of range: ${formatPlain(min, precision)} to ${formatPlain(max, precision)}${unitText}.`;
  }

  const apply = (v: number) => {
    if (v !== value) onChange(v);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDraft(text);
    const n = parseDecimal(text);
    if (n !== null && n >= min && n <= max) apply(roundTo(n, precision));
  };

  /** Parse, clamp and apply the draft. Returns the value the field now holds. */
  const commit = (): number => {
    if (draft === null) return value;
    const n = parseDecimal(draft);
    setDraft(null);
    if (n === null) {
      apply(focusValue.current);
      return focusValue.current;
    }
    const rounded = roundTo(n, precision);
    const c = clamp(rounded, min, max);
    if (c !== rounded) {
      const limit = c === max ? 'Max' : 'Min';
      showStatus(`${limit} ${formatPlain(c, precision)}${unitText}, set to ${formatPlain(c, precision)}.`);
    }
    apply(c);
    return c;
  };

  const stepBy = (dir: 1 | -1, factor: number) => {
    const base = parsed !== null ? parsed : value;
    const next = clamp(roundTo(base + dir * step * factor, precision), min, max);
    setDraft(null);
    apply(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        focusValue.current = commit();
        break;
      case 'Escape':
        if (draft !== null || value !== focusValue.current) {
          e.preventDefault();
          setDraft(null);
          apply(focusValue.current);
        }
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
        break;
      case 'PageUp':
      case 'PageDown':
        e.preventDefault();
        stepBy(e.key === 'PageUp' ? 1 : -1, 10);
        break;
      default:
    }
  };

  const shown = draft ?? formatPlain(value, precision);
  const invalid = error !== null || (messages ?? []).some((m) => m.severity === 'error');
  const pct = max > min ? ((clamp(value, min, max) - min) / (max - min)) * 100 : 0;
  const labelNode = (
    <>
      {label}
      {unit && UNIT_NAMES[unit] ? <span className="visually-hidden"> ({UNIT_NAMES[unit]})</span> : null}
    </>
  );

  return (
    <Field
      id={id}
      label={labelNode}
      layout="row"
      hint={hint}
      error={error}
      messages={messages ?? []}
      status={status}
      labelAside={labelAside}
      className={cx(styles.numberField, styles[size], className)}
      below={
        slider ? (
          <input
            type="range"
            id={`${id}-range`}
            className={styles.slider}
            min={min}
            max={max}
            step={step}
            value={clamp(value, min, max)}
            disabled={disabled}
            aria-label={`${label} slider`}
            style={{ '--_p': `${pct}%` } as CSSProperties}
            onChange={(e) => {
              setDraft(null);
              apply(roundTo(Number(e.target.value), precision));
            }}
          />
        ) : undefined
      }
    >
      {(a11y) => (
        <span className={cx(styles.box, invalid && styles.invalid, disabled && styles.disabled)}>
          <input
            {...a11y}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className={styles.input}
            value={shown}
            disabled={disabled}
            onFocus={() => {
              focusValue.current = value;
            }}
            onChange={handleChange}
            onBlur={commit}
            onKeyDown={handleKeyDown}
          />
          {unit ? (
            <span className={styles.unit} aria-hidden="true">
              {unit}
            </span>
          ) : null}
        </span>
      )}
    </Field>
  );
}
