import type { ReactElement, ReactNode } from 'react';
import { cx } from './format';
import styles from './StatusPill.module.css';

export type PillState = 'loading' | 'ready' | 'updating' | 'stale' | 'error';

export interface StatusPillProps {
  state: PillState;
  children: ReactNode;
  tone?: 'paper' | 'stage';
  /** Wrap in a polite live region (only text changes are announced). Default true. */
  live?: boolean;
  className?: string;
}

/** Engine / preview status: a pill with a status dot and tabular text. */
export function StatusPill({ state, children, tone = 'paper', live = true, className }: StatusPillProps): ReactElement {
  return (
    <span
      className={cx(styles.pill, styles[state], tone === 'stage' && styles.stage, className)}
      data-state={state}
      {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.text}>{children}</span>
    </span>
  );
}
