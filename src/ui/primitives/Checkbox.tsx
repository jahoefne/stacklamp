import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import { cx } from './format';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> {
  checked: boolean;
  onChange(checked: boolean): void;
  label: ReactNode;
  /** Help line under the label. */
  hint?: ReactNode;
  className?: string;
}

/** 22 px square box, ink when checked; the whole 44 px row is the target. */
export function Checkbox({ checked, onChange, label, hint, className, id, ...rest }: CheckboxProps): ReactElement {
  const hintId = id && hint ? `${id}-hint` : undefined;
  return (
    <div className={cx(styles.wrap, className)}>
      <label className={styles.row}>
        <input
          {...rest}
          id={id}
          type="checkbox"
          className={styles.box}
          checked={checked}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={styles.label}>{label}</span>
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
