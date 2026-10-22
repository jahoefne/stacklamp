import type { ReactElement, ReactNode } from 'react';
import { cx, pad2 } from '../primitives/format';
import styles from './panel.module.css';

export interface PanelSectionProps {
  /** id of the <section>; the heading gets `${id}-title`. */
  id: string;
  title: ReactNode;
  /** Section number (01…); omit for unnumbered sections (checks). */
  number?: number;
  /** Which --block-n colours the number square (1…6). */
  block?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Extra content on the right of the heading row. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A panel section: 2 px ink rule, number square in a Bauhaus block colour, Jost title. */
export function PanelSection({ id, title, number, block, aside, children, className }: PanelSectionProps): ReactElement {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className={cx(styles.section, className)} tabIndex={-1}>
      <div className={styles.head}>
        {number !== undefined ? (
          <span className={styles.number} data-block={block ?? number} aria-hidden="true">
            {pad2(number)}
          </span>
        ) : null}
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
