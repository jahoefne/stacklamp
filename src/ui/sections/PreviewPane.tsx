import { useCallback, useState, type ReactElement } from 'react';
import type { CoreKind, DerivedDims, PartMesh } from '../../geometry';
import { PreviewCanvas, PreviewToolbar, isWebGLAvailable } from '../../preview';
import type { GlowMode, PreviewStatus, QualityTier, ViewMode } from '../../preview';
import { selectPalette, selectPreviewDims, selectPreviewStale, useLamp, useLampActions } from '../../state';
import type { LampState } from '../../state';
import { StatusPill, type PillState } from '../primitives/StatusPill';
import { cx } from '../primitives/format';
import { previewLabel, selectPreviewBands } from './derived';
import styles from './PreviewPane.module.css';

const selectParts = (s: LampState): PartMesh[] | null => s.preview.parts;
const selectStatus = (s: LampState): PreviewStatus => s.preview.status;
const selectView = (s: LampState): ViewMode => s.ui.viewMode;
const selectGlow = (s: LampState): GlowMode => s.ui.glow;
const selectCore = (s: LampState): CoreKind => (s.preview.params ?? s.config.params).core.kind;
const selectEngine = (s: LampState): LampState['engine']['status'] => s.engine.status;

function pill(engine: LampState['engine']['status'], status: PreviewStatus, stale: boolean, dims: DerivedDims | null): [PillState, string] {
  if (engine === 'loading') return ['loading', 'Starting engine…'];
  if (engine === 'error' || (status === 'error' && !dims)) return ['error', "Can't build"];
  if (status === 'error') return ['stale', 'Preview out of date'];
  if (status === 'building' || stale || !dims) return ['updating', 'Updating…'];
  return ['ready', `Ready · ${dims.outer.count} + ${dims.inner.count} rings`];
}

const ENGINE_TEXT: Record<LampState['engine']['status'], string> = {
  loading: 'Starting the geometry engine.',
  ready: 'Geometry engine ready.',
  error: "The geometry engine didn't start.",
};

const isCoarse = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** The dark stage with its toolbar and status: store → PreviewCanvas wiring. */
export function PreviewPane(): ReactElement {
  const parts = useLamp(selectParts);
  const status = useLamp(selectStatus);
  const layoutDims = useLamp(selectPreviewDims);
  const bands = useLamp(selectPreviewBands);
  const palette = useLamp(selectPalette);
  const viewMode = useLamp(selectView);
  const glow = useLamp(selectGlow);
  const coreKind = useLamp(selectCore);
  const stale = useLamp(selectPreviewStale);
  const engine = useLamp(selectEngine);
  const { setUi } = useLampActions();
  const [autoTier, setAutoTier] = useState<QualityTier | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [coarse] = useState(isCoarse);
  const [webgl] = useState(isWebGLAvailable);

  const onViewMode = useCallback((m: ViewMode) => setUi({ viewMode: m }), [setUi]);
  const onGlow = useCallback((g: GlowMode) => setUi({ glow: g }), [setUi]);
  const onResetView = useCallback(() => setResetSignal((n) => n + 1), []);

  const [pillState, pillText] = pill(engine, status, stale, layoutDims);
  const label = previewLabel(layoutDims, bands, palette);

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <PreviewToolbar
          viewMode={viewMode}
          onViewMode={onViewMode}
          status={status}
          onResetView={onResetView}
          glow={glow}
          onGlow={onGlow}
          autoTier={autoTier}
        />
        <span className="visually-hidden" role="status">
          {ENGINE_TEXT[engine]}
        </span>
      </div>
      <div className={styles.stage}>
        <PreviewCanvas
          parts={parts}
          layoutDims={layoutDims}
          bands={bands}
          palette={palette}
          viewMode={viewMode}
          status={status}
          glow={glow}
          onGlowAuto={setAutoTier}
          ariaLabel={label}
          resetViewSignal={resetSignal}
          coreKind={coreKind}
          className={styles.canvas ?? ''}
        />
        <div className={cx(styles.overlay, !webgl && styles.overlayTop)}>
          <StatusPill state={pillState} tone="stage" live={false}>
            {pillText}
          </StatusPill>
          {webgl && !coarse ? (
            <p className={styles.hint} aria-hidden="true">
              Drag to orbit · scroll to zoom
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
