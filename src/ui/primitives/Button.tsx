import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { IconName } from '../illustrations/icons';
import { UiIcon as Icon } from './UiIcon';
import styles from './Button.module.css';
import { cx } from './format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'wide';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Decorative icon left of the label. */
  icon?: IconName;
  /** Running state: sets aria-busy; the label should carry the progress text. */
  busy?: boolean;
  children?: ReactNode;
}

/** Square, ink-outlined action with a solid offset shadow that sinks when pressed. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, busy = false, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.button, styles[variant], styles[size], busy && styles.busy, className)}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 18 : 20} className={styles.icon} /> : null}
      {children !== undefined && children !== null ? <span className={styles.label}>{children}</span> : null}
    </button>
  );
});
