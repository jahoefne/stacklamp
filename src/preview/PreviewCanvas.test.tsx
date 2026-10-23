// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Mesh, Object3D, Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DerivedDims, PartMesh } from '../geometry';
import { BALL_BANDS, defaultDims, fixtureParts, formFixture } from './fixtures.test-utils';
import { meshKey } from './meshes';
import type { PreviewCanvasProps } from './types';

/** No WebGL by default; the scene tests switch it on and render through a stub renderer. */
const gl = vi.hoisted(() => ({ available: false, scenes: [] as unknown[] }));

vi.mock('./webgl', () => ({ isWebGLAvailable: () => gl.available, isWebGLForcedOff: () => !gl.available, resetWebGLProbe: () => {} }));

// jsdom has no WebGL: a renderer that records the scenes it is asked to draw, and an
// environment generator that skips the GPU. Everything else is real three.js.
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();
  class StubRenderer {
    readonly domElement: HTMLCanvasElement;
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    info = { autoReset: true, render: { calls: 0, triangles: 0 }, memory: { geometries: 0 }, programs: [], reset: () => {} };
    private pixelRatio = 1;
    constructor(opts: { canvas: HTMLCanvasElement }) {
      this.domElement = opts.canvas;
    }
    setPixelRatio(r: number) {
      this.pixelRatio = r;
    }
    getPixelRatio() {
      return this.pixelRatio;
    }
    setSize() {}
    render(scene: unknown) {
      gl.scenes.push(scene);
    }
    dispose() {}
    forceContextLoss() {}
  }
  class StubPMREM {
    fromScene() {
      return { texture: new three.Texture() };
    }
    dispose() {}
  }
  return { ...three, WebGLRenderer: StubRenderer, PMREMGenerator: StubPMREM };
});

const palette = [
  { id: 'clr', name: 'Clear', hex: '#fff4dc' },
  { id: 'amb', name: 'Amber', hex: '#ffa41b' },
  { id: 'red', name: 'Red', hex: '#f2363f' },
];

function props(over: Partial<PreviewCanvasProps> = {}): PreviewCanvasProps {
  const dims = defaultDims();
  return {
    parts: null,
    layoutDims: dims,
    bands: {
      inner: Array.from({ length: dims.inner.count }, () => 'clr'),
      outer: Array.from({ length: dims.outer.count }, (_, k) => (k < 5 ? 'amb' : 'red')),
    },
    palette,
    viewMode: 'assembled',
    status: 'idle',
    glow: 'auto',
    ariaLabel: 'Lamp, 1.53 m tall, 11 outer bands',
    ...over,
  };
}

afterEach(() => cleanup());

/** Geometry key of every copy's meshes of a part in a drawn scene, by band (group `id#k`). */
function copyKeys(scene: Scene, id: string): string[] {
  const groups: Object3D[] = [];
  scene.traverse((o) => {
    if (o.name.startsWith(`${id}#`)) groups.push(o);
  });
  groups.sort((a, b) => Number(a.name.split('#')[1]) - Number(b.name.split('#')[1]));
  return groups.map((group) => {
    const names = new Set(group.children.map((c) => (c as Mesh).geometry.name));
    // sheen and glow share one geometry
    expect(names.size).toBe(1);
    return [...names][0]!;
  });
}

describe('PreviewCanvas with WebGL (stub renderer)', () => {
  beforeEach(() => {
    gl.available = true;
    gl.scenes.length = 0;
  });
  afterEach(() => {
    gl.available = false;
  });

  const drawn = async (): Promise<Scene> => {
    const before = gl.scenes.length;
    await vi.waitFor(() => expect(gl.scenes.length).toBeGreaterThan(before));
    return gl.scenes.at(-1) as Scene;
  };
  const sceneProps = (parts: PartMesh[], dims: DerivedDims) => props({ parts, layoutDims: dims, glow: 'off' });
  const debug = () => (globalThis as { __stacklampScene?: { debugInfo(): Record<string, unknown> } }).__stacklampScene!.debugInfo();

  it('draws one geometry per inner form and gives band k the mesh of forms[k]', async () => {
    const { default: PreviewCanvas } = await import('./PreviewCanvas');
    const { dims, parts } = formFixture();
    render(<PreviewCanvas {...sceneProps(parts, dims)} />);
    expect(screen.getByTestId('preview-stage')).toBeTruthy();
    const scene = await drawn();

    const inner = copyKeys(scene, 'inner-segment');
    expect(inner).toHaveLength(dims.inner.count);
    expect(inner).toEqual(dims.inner.forms.map((f) => meshKey('inner-segment', f)));
    expect(new Set(inner)).toEqual(new Set(['inner-segment|ball', 'inner-segment|straight']));
    expect(inner.flatMap((key, k) => (key === 'inner-segment|ball' ? [k] : []))).toEqual(BALL_BANDS);
    expect(copyKeys(scene, 'outer-segment')).toEqual(Array(dims.outer.count).fill('outer-segment|straight'));
    expect(copyKeys(scene, 'base')).toEqual(['base']);

    const info = debug();
    expect(info.copies).toMatchObject({ 'inner-segment': dims.inner.count, 'outer-segment': dims.outer.count });
    expect(info.partGeometries).toMatchObject({ 'inner-segment': 2, 'outer-segment': 1, base: 1 });
  });

  it('shows the straight mesh on a band whose form is still being built, then swaps it in', async () => {
    const { default: PreviewCanvas } = await import('./PreviewCanvas');
    const { dims, parts } = formFixture();
    // The dims already ask for ball bands, the parts are the previous (all straight) build.
    const stale = fixtureParts(defaultDims());
    const { rerender } = render(<PreviewCanvas {...sceneProps(stale, dims)} />);
    let scene = await drawn();
    expect(copyKeys(scene, 'inner-segment')).toEqual(Array(dims.inner.count).fill('inner-segment|straight'));

    const straight = (scene.getObjectByName('inner-segment#0')!.children[0] as Mesh).geometry;
    let released = false;
    straight.addEventListener('dispose', () => (released = true));
    rerender(<PreviewCanvas {...sceneProps(parts, dims)} />);
    scene = await drawn();
    expect(copyKeys(scene, 'inner-segment')).toEqual(dims.inner.forms.map((f) => meshKey('inner-segment', f)));
    // The stale straight geometry was replaced by the new build's and released.
    expect(released).toBe(true);
  });
});

describe('PreviewCanvas without WebGL', () => {
  it('renders the schematic fallback instead of a canvas', async () => {
    const { default: PreviewCanvas } = await import('./PreviewCanvas');
    const { container } = render(<PreviewCanvas {...props()} />);
    expect(screen.getByTestId('preview-fallback')).toBeTruthy();
    expect(screen.getByText('No 3D preview in this browser. Here is a to-scale drawing instead.')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
    // The schematic carries the accessible name and the band colours.
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.innerHTML.toLowerCase()).toContain('#f2363f');
    expect(container.textContent).toContain('Lamp, 1.53 m tall');
  });

  it('the barrel export (lazy wrapper) falls back without loading the 3D chunk', async () => {
    const { PreviewCanvas } = await import('./index');
    const { container } = render(<PreviewCanvas {...props({ layoutDims: null })} />);
    expect(screen.getByTestId('preview-fallback')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('tells the parent that the schematic stands in', async () => {
    const { PreviewCanvas } = await import('./index');
    const onFallback = vi.fn();
    render(<PreviewCanvas {...props({ onFallback })} />);
    expect(onFallback).toHaveBeenCalledWith('no-webgl');
    expect(onFallback).toHaveBeenCalledOnce();
  });
});

describe('PreviewToolbar', () => {
  it('switches view modes, resets and cycles the glow', async () => {
    const { PreviewToolbar } = await import('./index');
    const onViewMode = vi.fn();
    const onResetView = vi.fn();
    const onGlow = vi.fn();
    render(
      <PreviewToolbar viewMode="assembled" onViewMode={onViewMode} status="idle" onResetView={onResetView} glow="auto" onGlow={onGlow} />,
    );
    const exploded = screen.getByRole('radio', { name: 'Exploded' });
    expect(screen.getByRole('radio', { name: 'Assembled' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(exploded);
    expect(onViewMode).toHaveBeenCalledWith('exploded');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Assembled' }), { key: 'ArrowRight' });
    expect(onViewMode).toHaveBeenLastCalledWith('inner');
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(onResetView).toHaveBeenCalledOnce();
    // Glow is a pressed toggle: auto (or on) → off → auto.
    const glowButton = screen.getByRole('button', { name: 'Glow' });
    expect(glowButton.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(glowButton);
    expect(onGlow).toHaveBeenCalledWith('off');
  });

  it('turns the glow back to auto from off', async () => {
    const { PreviewToolbar } = await import('./index');
    const onGlow = vi.fn();
    render(<PreviewToolbar viewMode="inner" onViewMode={() => {}} status="idle" onResetView={() => {}} glow="off" onGlow={onGlow} />);
    const glowButton = screen.getByRole('button', { name: 'Glow' });
    expect(glowButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(glowButton);
    expect(onGlow).toHaveBeenCalledWith('auto');
  });

  it('disables glow and reset view (not the view switch) while the schematic is shown', async () => {
    const { PreviewToolbar } = await import('./index');
    render(
      <PreviewToolbar viewMode="assembled" onViewMode={() => {}} status="idle" onResetView={() => {}} glow="auto" onGlow={() => {}} fallback />,
    );
    expect((screen.getByRole('button', { name: 'Glow' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Reset view' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'Exploded' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
