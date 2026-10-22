/**
 * View controls for the preview: view mode, reset view, glow. Plain buttons styled
 * with design tokens (with fallbacks); no three.js, safe for the main chunk.
 */
import type { ReactElement } from 'react';
import styles from './preview.module.css';
import type { GlowMode, PreviewToolbarProps, ViewMode } from './types';

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'assembled', label: 'Assembled', hint: 'The lamp as it stands' },
  { id: 'inner', label: 'Inner', hint: 'Hide the outer tubes to see the inner stack' },
  { id: 'exploded', label: 'Exploded', hint: 'Pull the parts apart' },
];

const GLOW_NEXT: Record<GlowMode, GlowMode> = { auto: 'on', on: 'off', off: 'auto' };
const GLOW_LABEL: Record<GlowMode, string> = { auto: 'Auto', on: 'On', off: 'Off' };

export function PreviewToolbar({
  viewMode,
  onViewMode,
  status,
  onResetView,
  glow,
  onGlow,
  autoTier,
  className,
}: PreviewToolbarProps): ReactElement {
  const glowDetail = glow === 'auto' && autoTier ? ` (${autoTier === 'high' ? 'bloom on' : 'bloom off for speed'})` : '';
  return (
    <div className={[styles.toolbar, className].filter(Boolean).join(' ')} role="toolbar" aria-label="Preview">
      <div className={styles.segmented} role="radiogroup" aria-label="View">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={viewMode === m.id}
            title={m.hint}
            className={styles.segment}
            data-active={viewMode === m.id || undefined}
            onClick={() => onViewMode(m.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const i = MODES.findIndex((x) => x.id === viewMode);
              const next = MODES[(i + (e.key === 'ArrowRight' ? 1 : MODES.length - 1)) % MODES.length]!;
              onViewMode(next.id);
              const group = e.currentTarget.parentElement;
              group?.querySelector<HTMLButtonElement>(`[data-mode="${next.id}"]`)?.focus();
            }}
            data-mode={m.id}
            tabIndex={viewMode === m.id ? 0 : -1}
          >
            {m.label}
          </button>
        ))}
      </div>
      <button type="button" className={styles.toolButton} onClick={onResetView} title="Back to the default camera">
        Reset view
      </button>
      <button
        type="button"
        className={styles.toolButton}
        onClick={() => onGlow(GLOW_NEXT[glow])}
        aria-label={`Glow: ${GLOW_LABEL[glow]}${glowDetail}. Switch to ${GLOW_LABEL[GLOW_NEXT[glow]]}.`}
        title="Bloom halo around the light: auto adapts to your device"
        data-glow={glow}
      >
        Glow <span className={styles.toolValue}>{GLOW_LABEL[glow]}</span>
      </button>
      {/* The canvas shows the visual "Updating…" badge; announce only failures. */}
      <span className={styles.srOnly} aria-live="polite">
        {status === 'error' ? 'The preview could not be updated.' : ''}
      </span>
    </div>
  );
}

export default PreviewToolbar;
