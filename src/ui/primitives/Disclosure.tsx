import { useId, type ReactElement, type ReactNode } from 'react';
import { UiIcon as Icon } from './UiIcon';
import styles from './Disclosure.module.css';
import { cx } from './format';

export interface DisclosureProps {
  summary: ReactNode;
  open: boolean;
  onToggle(open: boolean): void;
  children: ReactNode;
  /** Optional note at the top of the open panel. */
  description?: ReactNode;
  id?: string;
  className?: string;
}

/** Native details/summary with the design's 44 px row and rotating chevron. Controlled. */
export function Disclosure({ summary, open, onToggle, children, description, id, className }: DisclosureProps): ReactElement {
  const auto = useId();
  const panelId = `${id ?? auto}-panel`;
  return (
    <details
      id={id}
      className={cx(styles.details, className)}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next !== open) onToggle(next);
      }}
    >
      <summary className={styles.summary} aria-controls={panelId}>
        <span className={styles.summaryText}>{summary}</span>
        <Icon name="chevron" size={20} className={styles.chevron} />
      </summary>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div id={panelId} className={styles.panel}>
        {children}
      </div>
    </details>
  );
}
