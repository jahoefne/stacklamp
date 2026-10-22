import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { IconName } from '../illustrations/icons';
import { UiIcon as Icon } from './UiIcon';
import { cx } from './format';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  icon: IconName;
  /** Accessible name (aria-label) and tooltip (title). */
  label: string;
  /** 'row' is borderless until hovered (palette rows); 'stage' sits on the dark preview. */
  tone?: 'paper' | 'row' | 'stage';
  size?: 'md' | 'sm';
  /** For toggles: sets aria-pressed. */
  pressed?: boolean;
}

/** Round icon-only button. Always labelled. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, tone = 'paper', size = 'md', pressed, className, type = 'button', title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      className={cx(styles.iconButton, styles[tone], styles[size], className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : 20} />
    </button>
  );
});
