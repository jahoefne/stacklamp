import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { cx } from './format';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Tooltip / longer description. */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group (use this or labelledBy). */
  label?: string;
  labelledBy?: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange(value: T): void;
  size?: 'md' | 'sm';
  /** 'stage' sits on the dark preview (stage-line border, stage-ink text). */
  tone?: 'paper' | 'stage';
  /** Stretch the segments to fill the row. */
  block?: boolean;
  id?: string;
  className?: string;
  describedBy?: string;
}

/**
 * A radiogroup of square segments (Bauhaus inversion for the selected one). One tab stop
 * (roving tabindex); arrow keys move and select, Home/End jump to the ends.
 */
export function SegmentedControl<T extends string>({
  label,
  labelledBy,
  options,
  value,
  onChange,
  size = 'md',
  tone = 'paper',
  block = false,
  id,
  className,
  describedBy,
}: SegmentedControlProps<T>): ReactElement {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = options.findIndex((o) => o.value === value);
  // The tab stop is the selected option, or the first enabled one when nothing is selected.
  const tabStop = selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : (enabled[0] ?? -1);

  const move = (from: number, delta: number | 'first' | 'last') => {
    if (enabled.length === 0) return;
    let target: number;
    if (delta === 'first') target = enabled[0]!;
    else if (delta === 'last') target = enabled[enabled.length - 1]!;
    else {
      const pos = enabled.indexOf(from);
      const start = pos >= 0 ? pos : 0;
      target = enabled[(start + delta + enabled.length) % enabled.length]!;
    }
    const opt = options[target];
    if (!opt) return;
    refs.current[target]?.focus();
    if (opt.value !== value) onChange(opt.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(index, -1);
        break;
      case 'Home':
        e.preventDefault();
        move(index, 'first');
        break;
      case 'End':
        e.preventDefault();
        move(index, 'last');
        break;
      default:
    }
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cx(styles.group, styles[size], tone === 'stage' && styles.stage, block && styles.block, className)}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={o.disabled}
            title={o.title}
            tabIndex={i === tabStop ? 0 : -1}
            className={styles.segment}
            data-value={o.value}
            onClick={() => {
              if (!checked) onChange(o.value);
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
