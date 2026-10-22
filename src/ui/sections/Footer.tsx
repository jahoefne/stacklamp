import type { ReactElement } from 'react';
import styles from './Footer.module.css';

export const REPO_URL = 'https://github.com/jahoefne/stacklamp';

/** Inverse footer: licence, source, safety line. */
export function Footer(): ReactElement {
  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.inner}`}>
        <p className={styles.line}>
          <span className={styles.wordmark}>stacklamp</span>
          <span aria-hidden="true"> · </span>
          <span>MIT licence</span>
          <span aria-hidden="true"> · </span>
          <a href={REPO_URL} rel="noopener" target="_blank" className={styles.link}>
            Source on GitHub
          </a>
          <span aria-hidden="true"> · </span>
          <span>Made for 0.4–0.8 mm nozzles and PETG</span>
        </p>
        <p className={styles.safety}>Low-voltage LED strips only; mind PETG's ~80 °C softening point.</p>
      </div>
    </footer>
  );
}
