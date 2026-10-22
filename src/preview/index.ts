/**
 * Preview barrel. Safe to import from the main entry: nothing here pulls in three.js.
 * `PreviewCanvas` is the lazy wrapper (WebGL check → lazy 3D chunk → schematic on failure).
 * To lazy-load the raw canvas yourself: `lazy(() => import('./preview/PreviewCanvas'))`.
 */
export { LazyPreviewCanvas as PreviewCanvas } from './LazyPreviewCanvas';
export { PreviewToolbar } from './PreviewToolbar';
export { PreviewFallback } from './PreviewFallback';
export { isWebGLAvailable } from './webgl';
export type {
  GlowMode,
  PreviewBands,
  PreviewCanvasProps,
  PreviewFallbackProps,
  PreviewStatus,
  PreviewToolbarProps,
  QualityTier,
  ViewMode,
} from './types';
