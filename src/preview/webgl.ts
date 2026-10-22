/**
 * WebGL2 capability check (no three.js import: used on the main entry to decide
 * whether to load the 3D chunk at all). `?nowebgl` in the URL forces the fallback for QA.
 */
let cached: boolean | null = null;

export function isWebGLForcedOff(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  return new URLSearchParams(search).has('nowebgl');
}

export function isWebGLAvailable(): boolean {
  if (isWebGLForcedOff()) return false;
  if (cached !== null) return cached;
  cached = probe();
  return cached;
}

function probe(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    // Release the probe context right away; browsers cap live contexts (~16).
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Test hook: forget the cached probe result. */
export function resetWebGLProbe(): void {
  cached = null;
}
