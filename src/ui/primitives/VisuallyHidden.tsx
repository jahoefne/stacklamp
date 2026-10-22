import type { HTMLAttributes, ReactElement } from 'react';
import { cx } from './format';

/** Text for screen readers only (uses the global `.visually-hidden` utility). */
export function VisuallyHidden({ className, ...rest }: HTMLAttributes<HTMLSpanElement>): ReactElement {
  return <span className={cx('visually-hidden', className)} {...rest} />;
}
