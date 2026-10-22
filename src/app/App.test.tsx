// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewCanvasProps } from '../preview';
import { lampStore, resetLampStore, selectDims } from '../state';
import { App } from './App';

// No WebGL in jsdom: replace the canvas with a stand-in that exposes its props.
vi.mock('../preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../preview')>();
  return {
    ...actual,
    PreviewCanvas: (p: PreviewCanvasProps) => (
      <div
        role="img"
        aria-label={p.ariaLabel}
        data-testid="preview-canvas"
        data-outer={p.bands.outer.join(',')}
        data-view={p.viewMode}
        data-status={p.status}
      />
    ),
  };
});

beforeEach(() => resetLampStore({ persistPresets: false }));
afterEach(() => {
  cleanup();
  resetLampStore({ persistPresets: false });
});

describe('App', () => {
  it('renders the page: landmarks, one h1, the sections and the download', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Light,stacked.');
    expect(screen.getByRole('link', { name: 'Skip to configurator' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Configure your lamp' })).toBeTruthy();

    for (const title of ['Configure your lamp', 'Light core', 'Tubes', 'Colours', 'Base & printer', 'Printer tuning', 'Checks', 'Download'])
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy();

    expect(screen.getByRole('textbox', { name: /rod length/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /download zip/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /source on github/i }).getAttribute('href')).toBe('https://github.com/jahoefne/stacklamp');
    expect(screen.getByText(/Low-voltage LED strips only/)).toBeTruthy();
  });

  it('wires the store into the preview and the height summary', async () => {
    const user = userEvent.setup();
    render(<App />);
    const summary = screen.getByTestId('height-summary');
    const n0 = lampStore.getState().config.params.core.length;
    expect(n0).toBe(1500);
    expect(summary.textContent).toMatch(/Outer \d+ × [\d.]+ mm · Inner \d+ × [\d.]+ mm · Lamp [\d,]+ mm tall/);

    const rod = screen.getByRole('textbox', { name: /rod length/i });
    await user.clear(rod);
    await user.type(rod, '1000{Enter}');
    expect(lampStore.getState().config.params.core.length).toBe(1000);
    const d = selectDims(lampStore.getState());
    expect(summary.textContent).toContain(`Outer ${d.outer.count} ×`);
    expect(summary.textContent).toContain(`Inner ${d.inner.count} ×`);

    // The view toggle writes the store; the canvas follows.
    await user.click(screen.getByRole('radio', { name: 'Exploded' }));
    expect(lampStore.getState().ui.viewMode).toBe('exploded');
    expect(screen.getByTestId('preview-canvas').getAttribute('data-view')).toBe('exploded');
  });

  it('shows the store notice as a toast', () => {
    render(<App />);
    act(() => lampStore.getState().actions.notify('info', 'Hello from the store.'));
    const text = screen.getByText('Hello from the store.');
    expect(text.closest('[role="status"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close message' })).toBeTruthy();
  });
});
