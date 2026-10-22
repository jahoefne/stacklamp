// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultDims } from './fixtures.test-utils';
import type { PreviewCanvasProps } from './types';

vi.mock('./webgl', () => ({ isWebGLAvailable: () => false, isWebGLForcedOff: () => true, resetWebGLProbe: () => {} }));

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

describe('PreviewCanvas without WebGL', () => {
  it('renders the schematic fallback instead of a canvas', async () => {
    const { default: PreviewCanvas } = await import('./PreviewCanvas');
    const { container } = render(<PreviewCanvas {...props()} />);
    expect(screen.getByTestId('preview-fallback')).toBeTruthy();
    expect(screen.getByText(/cannot show the 3D preview/i)).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: /glow: auto/i }));
    expect(onGlow).toHaveBeenCalledWith('on');
  });
});
