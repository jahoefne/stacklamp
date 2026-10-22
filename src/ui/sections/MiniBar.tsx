import { useEffect, useRef, useState, type ReactElement } from 'react';
import { download, selectCanDownload, useDims, useLamp } from '../../state';
import type { LampState } from '../../state';
import { cx, fmt } from '../primitives/format';
import { scrollAndFocus } from './derived';
import styles from './MiniBar.module.css';

const selectRunning = (s: LampState): boolean => s.exportJob.phase === 'running';

/**
 * Phone/tablet bar stuck to the bottom of the configurator: band counts, height and a
 * Download button. The first press scrolls to the Download ZIP button (format and blockers
 * around it); once the panel has been seen it downloads directly. Hidden while the panel
 * is on screen.
 */
export function MiniBar({ targetId = 'download' }: { targetId?: string }): ReactElement {
  const d = useDims();
  const canDownload = useLamp(selectCanDownload);
  const running = useLamp(selectRunning);
  const [panelVisible, setPanelVisible] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) seen.current = true;
        setPanelVisible(visible);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  const onDownload = () => {
    if (seen.current && canDownload) {
      void download();
      return;
    }
    seen.current = true;
    const panel = document.getElementById(targetId);
    const button = panel?.querySelector<HTMLButtonElement>('[data-testid="download-zip"]') ?? null;
    // The panel is taller than a phone screen: bring the button itself into view (with the
    // tables above it and the blockers under it), and focus it when it can be pressed.
    scrollAndFocus(button ?? panel, button && !button.disabled ? button : panel, 'center');
  };

  return (
    <div className={cx(styles.bar, panelVisible && styles.hidden)} aria-hidden={panelVisible || undefined}>
      <p className={styles.summary}>
        <span className={styles.big}>{fmt(d.totalHeight, 1)} mm</span>
        <span className={styles.small}>
          {d.outer.count} + {d.inner.count} rings
        </span>
      </p>
      <button type="button" className={styles.button} onClick={onDownload} tabIndex={panelVisible ? -1 : 0} aria-busy={running || undefined}>
        {running ? 'Building…' : 'Download'}
      </button>
    </div>
  );
}
