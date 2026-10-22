/**
 * React shell around LampScene. Default export, meant for React.lazy (three.js lives
 * in this chunk). Never imports the store: everything arrives through props.
 */
import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LampScene } from './LampScene';
import { PreviewFallback } from './PreviewFallback';
import styles from './preview.module.css';
import type { PreviewCanvasProps } from './types';
import { isWebGLAvailable } from './webgl';

const isCoarsePointer = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

export default function PreviewCanvas(props: PreviewCanvasProps): ReactElement {
  const { parts, layoutDims, bands, palette, viewMode, glow, ariaLabel, resetViewSignal, coreKind, onFallback, className } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LampScene | null>(null);
  const latest = useRef(props);
  const [webgl] = useState(isWebGLAvailable);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [coarse] = useState(isCoarsePointer);
  const [touchActive, setTouchActive] = useState(false);
  const touchActiveRef = useRef(touchActive);
  const touchButtonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    latest.current = props;
    touchActiveRef.current = touchActive;
  });

  // Create the scene (again after a context restore); dispose on unmount. StrictMode's
  // double mount creates, disposes and re-creates: each scene owns its own canvas.
  useEffect(() => {
    if (!webgl || failed) return;
    const host = hostRef.current;
    if (!host) return;
    const p = latest.current;
    let scene: LampScene;
    try {
      scene = new LampScene(host, {
        glow: p.glow,
        ariaLabel: p.ariaLabel,
        interactive: !coarse || touchActiveRef.current,
        coreKind: p.coreKind,
        onGlowAuto: (tier) => latest.current.onGlowAuto?.(tier),
        onContextLost: () => latest.current.onContextLost?.(),
        onContextRestored: () => setGeneration((g) => g + 1),
      });
    } catch (err) {
      console.warn('[stacklamp] 3D preview unavailable, showing the schematic instead.', err);
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.setViewMode(p.viewMode, true);
    scene.setColours(p.bands, p.palette);
    if (p.parts && p.layoutDims) scene.setParts(p.parts, p.layoutDims);
    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
  }, [webgl, failed, generation, coarse]);

  // Prop → scene. The setters are idempotent, so the extra calls on mount are free.
  useEffect(() => {
    sceneRef.current?.setViewMode(viewMode);
  }, [viewMode]);
  useEffect(() => {
    if (parts && layoutDims) sceneRef.current?.setParts(parts, layoutDims);
  }, [parts, layoutDims]);
  useEffect(() => {
    sceneRef.current?.setColours(bands, palette);
  }, [bands, palette]);
  useEffect(() => {
    sceneRef.current?.setGlow(glow);
  }, [glow]);
  useEffect(() => {
    sceneRef.current?.setAriaLabel(ariaLabel);
  }, [ariaLabel]);
  useEffect(() => {
    if (coreKind) sceneRef.current?.setCoreKind(coreKind);
  }, [coreKind]);
  useEffect(() => {
    sceneRef.current?.setInteractive(!coarse || touchActive);
  }, [coarse, touchActive]);

  const lastReset = useRef(resetViewSignal);
  useEffect(() => {
    if (resetViewSignal === lastReset.current) return;
    lastReset.current = resetViewSignal;
    sceneRef.current?.resetView();
  }, [resetViewSignal]);

  // "Tap to rotate" and "Done" replace each other: keep keyboard focus on the one shown.
  const touchSeen = useRef(false);
  useEffect(() => {
    if (!touchSeen.current) {
      touchSeen.current = true;
      return;
    }
    touchButtonRef.current?.focus();
  }, [touchActive]);

  if (!webgl || failed) {
    return (
      <PreviewFallback
        layoutDims={layoutDims}
        bands={bands}
        palette={palette}
        viewMode={viewMode}
        ariaLabel={ariaLabel}
        reason={webgl ? 'error' : 'no-webgl'}
        {...(onFallback ? { onShown: onFallback } : {})}
        {...(className ? { className } : {})}
      />
    );
  }

  return (
    <div className={[styles.stage, className].filter(Boolean).join(' ')} data-testid="preview-stage">
      <div ref={hostRef} className={styles.canvasHost} />
      {/* Touch: the page scrolls over the preview until "Tap to rotate" hands the canvas the gestures. */}
      {coarse && !touchActive && (
        <div className={styles.scrim}>
          <button ref={touchButtonRef} type="button" className={styles.touchButton} onClick={() => setTouchActive(true)}>
            Tap to rotate
          </button>
        </div>
      )}
      {coarse && touchActive && (
        <div className={styles.overlayBottom}>
          <button ref={touchButtonRef} type="button" className={styles.touchButton} data-active="" onClick={() => setTouchActive(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
