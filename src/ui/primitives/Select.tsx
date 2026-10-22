import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import { UiIcon as Icon } from './UiIcon';
import { cx } from './format';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> {
  /** Flat options, or groups ({ label, options }). Children win when given. */
  options?: readonly (SelectOption | { label: string; options: readonly SelectOption[] })[];
  children?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  size?: 'md' | 'sm';
}

/** Native select in the square input box with a chevron cell. Pair with <Field> for a label. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, children, block = false, size = 'md', className, disabled, ...rest },
  ref,
) {
  return (
    <span className={cx(styles.box, block && styles.block, styles[size], disabled && styles.disabled, className)}>
      <select ref={ref} className={styles.select} disabled={disabled} {...rest}>
        {children ??
          options?.map((o) =>
            'options' in o ? (
              <optgroup key={o.label} label={o.label}>
                {o.options.map((x) => (
                  <option key={x.value} value={x.value} disabled={x.disabled}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ),
          )}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        <Icon name="chevron" size={18} />
      </span>
    </span>
  );
});
