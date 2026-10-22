import type { ReactElement, ReactNode } from 'react';
import styles from './ConfiguratorLayout.module.css';

export interface ConfiguratorLayoutProps {
  preview: ReactNode;
  panel: ReactNode;
  /** Sticky bottom bar for narrow screens (hidden at >= 960 px). */
  miniBar?: ReactNode;
}

/**
 * >= 960 px: preview (sticky, full viewport height) left, controls column right.
 * Narrower: preview on top (full-bleed on phones), controls below, mini-bar at the bottom.
 */
export function ConfiguratorLayout({ preview, panel, miniBar }: ConfiguratorLayoutProps): ReactElement {
  return (
    <div className={styles.layout}>
      <div className={styles.preview}>{preview}</div>
      <div className={styles.panel}>{panel}</div>
      {miniBar}
    </div>
  );
}
