/**
 * Main-chunk wrapper: decides WebGL vs schematic before downloading three.js, lazy-loads
 * PreviewCanvas, and falls back to the schematic if the chunk fails to load.
 */
import { Component, lazy, type ReactElement, type ReactNode, Suspense, useState } from 'react';
import { PreviewFallback } from './PreviewFallback';
import styles from './preview.module.css';
import type { PreviewCanvasProps } from './types';
import { isWebGLAvailable } from './webgl';

const LazyCanvas = lazy(() => import('./PreviewCanvas'));

class ChunkBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    console.warn('[stacklamp] 3D preview failed to load, showing the schematic instead.', error);
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function LazyPreviewCanvas(props: PreviewCanvasProps): ReactElement {
  const [webgl] = useState(isWebGLAvailable);
  const fallback = (reason: 'no-webgl' | 'error') => (
    <PreviewFallback
      layoutDims={props.layoutDims}
      bands={props.bands}
      palette={props.palette}
      viewMode={props.viewMode}
      ariaLabel={props.ariaLabel}
      reason={reason}
      {...(props.className ? { className: props.className } : {})}
    />
  );
  if (!webgl) return fallback('no-webgl');
  return (
    <ChunkBoundary fallback={fallback('error')}>
      <Suspense
        fallback={<div className={[styles.stage, props.className].filter(Boolean).join(' ')} aria-busy="true" role="img" aria-label={props.ariaLabel} />}
      >
        <LazyCanvas {...props} />
      </Suspense>
    </ChunkBoundary>
  );
}

export default LazyPreviewCanvas;
