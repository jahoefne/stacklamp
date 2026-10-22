/**
 * 2D stand-in for the 3D preview (no WebGL, `?nowebgl`, or the 3D chunk failed).
 * Uses the design system's StackIllustration schematic when it is present (looked up
 * through import.meta.glob so this file never breaks the build if it moves), else a
 * plain to-scale elevation. No three.js here: this stays in the main chunk.
 */
import { useEffect, useRef, type ComponentType, type ReactElement } from 'react';
import type { DerivedDims, PetgColour } from '../geometry';
import styles from './preview.module.css';
import type { PreviewBands, PreviewFallbackProps } from './types';

interface SchematicDims {
  totalHeight: number;
  outerOD: number;
  innerOD: number;
  baseD: number;
  innerSegH: number;
  outerSegH: number;
  rodLength: number;
}
interface SchematicProps {
  variant: 'schematic';
  innerColours: string[];
  outerColours: string[];
  dims?: SchematicDims;
  title: string;
  className?: string;
}
type IllustrationModule = { StackIllustration?: ComponentType<SchematicProps>; default?: ComponentType<SchematicProps> };

const found = import.meta.glob<IllustrationModule>('../ui/illustrations/StackIllustration.tsx', { eager: true });
const illustrationModule = Object.values(found)[0];
const Schematic: ComponentType<SchematicProps> | null =
  illustrationModule?.StackIllustration ?? illustrationModule?.default ?? null;

const CAPTIONS: Record<NonNullable<PreviewFallbackProps['reason']>, string> = {
  'no-webgl': 'No 3D preview in this browser. Here is a to-scale drawing instead.',
  error: 'The 3D preview stopped working. Here is a to-scale drawing instead.',
  loading: 'Loading the 3D preview…',
};

export function hexesFor(ids: readonly string[], palette: readonly PetgColour[]): string[] {
  return ids.map((id) => palette.find((c) => c.id === id)?.hex ?? palette[0]?.hex ?? '#fff4e0');
}

export function schematicDims(d: DerivedDims): SchematicDims {
  return {
    totalHeight: d.totalHeight,
    outerOD: d.outer.D,
    innerOD: d.inner.D,
    baseD: d.fit.base?.size[0] ?? 240,
    innerSegH: d.inner.height,
    outerSegH: d.outer.height,
    rodLength: d.rod.topZ - d.rod.bottomZ,
  };
}

export function PreviewFallback({
  layoutDims,
  bands,
  palette,
  ariaLabel,
  reason = 'no-webgl',
  onShown,
  className,
}: PreviewFallbackProps): ReactElement {
  const title = ariaLabel ?? 'Schematic drawing of the lamp';
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;
  useEffect(() => {
    if (reason !== 'loading') onShownRef.current?.(reason);
  }, [reason]);
  const inner = hexesFor(bands.inner, palette);
  const outer = hexesFor(bands.outer, palette);
  return (
    <div className={[styles.fallback, className].filter(Boolean).join(' ')} data-testid="preview-fallback">
      <div className={styles.fallbackArt}>
        {Schematic ? (
          <Schematic
            variant="schematic"
            innerColours={inner}
            outerColours={outer}
            {...(layoutDims ? { dims: schematicDims(layoutDims) } : {})}
            title={title}
            className={styles.fallbackSvg ?? ''}
          />
        ) : (
          <Elevation dims={layoutDims} bands={bands} palette={palette} title={title} />
        )}
      </div>
      <p className={styles.fallbackCaption}>{CAPTIONS[reason]}</p>
    </div>
  );
}

/** Minimal to-scale elevation (only used when the design illustration is unavailable). */
function Elevation({
  dims,
  bands,
  palette,
  title,
}: {
  dims: DerivedDims | null;
  bands: PreviewBands;
  palette: readonly PetgColour[];
  title: string;
}): ReactElement {
  const H = dims?.totalHeight ?? 1533.5;
  const baseD = dims?.fit.base?.size[0] ?? 240;
  const W = Math.max(baseD, dims?.cover.od ?? 205) + 40;
  const y = (z: number) => H - z;
  const inner = hexesFor(bands.inner, palette);
  const outer = hexesFor(bands.outer, palette);
  const seg = (s: DerivedDims['inner'], k: number) => s.stackBottomZ + k * s.pitch;
  return (
    <svg className={styles.fallbackSvg} viewBox={`${-W / 2} -10 ${W} ${H + 20}`} role="img" aria-label={title}>
      <title>{title}</title>
      <line x1={-W / 2} x2={W / 2} y1={H} y2={H} stroke="currentColor" strokeWidth={2} />
      {dims && (
        <>
          <rect x={-baseD / 2} y={y(dims.base.topZ)} width={baseD} height={dims.base.topZ} fill="currentColor" opacity={0.35} />
          <rect
            x={-dims.rod.diameter / 2}
            y={y(dims.rod.topZ)}
            width={dims.rod.diameter}
            height={dims.rod.topZ - dims.rod.bottomZ}
            fill="currentColor"
            opacity={0.5}
          />
          {inner.slice(0, dims.inner.count).map((hex, k) => (
            <rect
              key={`i${k}`}
              x={-dims.inner.D / 2}
              y={y(seg(dims.inner, k) + dims.inner.height)}
              width={dims.inner.D}
              height={dims.inner.height}
              fill={hex}
              opacity={0.85}
            />
          ))}
          {outer.slice(0, dims.outer.count).map((hex, k) => (
            <rect
              key={`o${k}`}
              x={-dims.outer.D / 2}
              y={y(seg(dims.outer, k) + dims.outer.height)}
              width={dims.outer.D}
              height={dims.outer.height}
              fill={hex}
              opacity={0.45}
              stroke="currentColor"
              strokeOpacity={0.4}
            />
          ))}
          <rect x={-dims.cover.od / 2} y={y(dims.totalHeight)} width={dims.cover.od} height={3} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export default PreviewFallback;
