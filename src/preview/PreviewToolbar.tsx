/**
 * View controls on the stage (DESIGN §10 "PreviewToolbar"): the view switch top-left, the
 * glow toggle and reset view top-right, as an overlay inset 12 px inside the dark stage.
 * The gaps between the controls let pointer events through to the canvas. No three.js
 * here: safe for the main chunk.
 */
import type { ReactElement } from 'react';
import { IconButton } from '../ui/primitives/IconButton';
import { SegmentedControl, type SegmentOption } from '../ui/primitives/SegmentedControl';
import { cx } from '../ui/primitives/format';
import styles from './preview.module.css';
import type { PreviewToolbarProps, ViewMode } from './types';

const MODES: readonly SegmentOption<ViewMode>[] = [
  { value: 'assembled', label: 'Assembled', title: 'The lamp as it stands' },
  { value: 'inner', label: 'Inner', title: 'Hide the outer tubes to see the inner stack' },
  { value: 'exploded', label: 'Exploded', title: 'Pull the parts apart' },
];

export function PreviewToolbar({
  viewMode,
  onViewMode,
  status,
  onResetView,
  glow,
  onGlow,
  autoTier,
  fallback = false,
  className,
}: PreviewToolbarProps): ReactElement {
  // The toggle is binary: off, or auto (bloom where the device is fast enough). A forced
  // 'on' from a link or storage counts as on and turns off from here like auto does.
  const glowOn = glow !== 'off';
  const detail = glowOn && glow === 'auto' && autoTier === 'low' ? ' · bloom off on this device for speed' : '';
  return (
    <div className={cx(styles.toolbar, className)} role="toolbar" aria-label="Preview">
      <SegmentedControl label="View" tone="stage" options={MODES} value={viewMode} onChange={onViewMode} />
      <div className={styles.tools}>
        <IconButton
          icon="eye"
          tone="stage"
          label="Glow"
          title={`Glow ${glowOn ? 'on' : 'off'}${detail}`}
          pressed={glowOn}
          disabled={fallback}
          onClick={() => onGlow(glowOn ? 'off' : 'auto')}
        />
        <IconButton
          icon="resetView"
          tone="stage"
          label="Reset view"
          title="Back to the default camera"
          disabled={fallback}
          onClick={onResetView}
        />
      </div>
      {/* The status pill shows the visual state; announce only failures. */}
      <span className={styles.srOnly} aria-live="polite">
        {status === 'error' ? 'The preview could not be updated.' : ''}
      </span>
    </div>
  );
}

export default PreviewToolbar;
