/**
 * Public prop/API types of the preview. No three.js imports here: this file is
 * reachable from the main entry through the barrel, three stays in the lazy chunk.
 */
import type { CoreKind, DerivedDims, PartMesh, PetgColour } from '../geometry';

export type ViewMode = 'assembled' | 'inner' | 'exploded';
export type PreviewStatus = 'idle' | 'building' | 'error';
/** 'auto' adapts to the device (bloom on fast GPUs), 'on' forces bloom, 'off' disables it. */
export type GlowMode = 'auto' | 'on' | 'off';
export type QualityTier = 'high' | 'low';

/** Fitted colour ids per band, index 0 = bottom. */
export interface PreviewBands {
  inner: string[];
  outer: string[];
}

export interface PreviewCanvasProps {
  /** Meshes from GeometryClient.buildParts(params, 'preview'); null until the first build lands. */
  parts: PartMesh[] | null;
  /** deriveDims() of the params the parts were built from (placements, counts, rod). */
  layoutDims: DerivedDims | null;
  /** Colour ids fitted to layoutDims.inner/outer.count. Colour edits never rebuild geometry. */
  bands: PreviewBands;
  palette: PetgColour[];
  viewMode: ViewMode;
  status: PreviewStatus;
  glow: GlowMode;
  /** Called with the tier the 'auto' mode settled on (once at start, again when it drops to 'low'). */
  onGlowAuto?(tier: QualityTier): void;
  /** WebGL context lost; the canvas re-creates itself when the browser restores it. */
  onContextLost?(): void;
  ariaLabel: string;
  /** Increment to animate the camera back to the default framing (wire to the toolbar's reset button). */
  resetViewSignal?: number;
  /** 'led-tube' renders the core as a glowing tube instead of an aluminium rod with a strip. */
  coreKind?: CoreKind;
  className?: string;
}

export interface PreviewToolbarProps {
  viewMode: ViewMode;
  onViewMode(mode: ViewMode): void;
  status: PreviewStatus;
  onResetView(): void;
  glow: GlowMode;
  onGlow(glow: GlowMode): void;
  /** Tier the 'auto' glow settled on, shown as a hint ("Glow auto · low"). */
  autoTier?: QualityTier | null;
  className?: string;
}

export interface PreviewFallbackProps {
  layoutDims: DerivedDims | null;
  bands: PreviewBands;
  palette: PetgColour[];
  viewMode?: ViewMode;
  ariaLabel?: string;
  /** Why the schematic is shown; controls the small caption. */
  reason?: 'no-webgl' | 'error' | 'loading';
  className?: string;
}
