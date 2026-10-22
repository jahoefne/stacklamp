// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lampStore, resetLampStore, selectBlockers } from '../../state';
import { DownloadPanel, blockedText } from './DownloadPanel';

beforeEach(() => resetLampStore({ persistPresets: false }));
afterEach(() => {
  cleanup();
  resetLampStore({ persistPresets: false });
});

const button = () => screen.getByRole('button', { name: /download zip/i }) as HTMLButtonElement;
const actions = () => lampStore.getState().actions;

describe('DownloadPanel', () => {
  it('is disabled while the engine loads and says why', () => {
    render(<DownloadPanel />);
    expect(lampStore.getState().engine.status).toBe('loading');
    expect(button().disabled).toBe(true);
    expect(screen.getByText('The geometry engine is still loading.')).toBeTruthy();
    const reasonId = button().getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)?.textContent).toContain('still loading');
  });

  it('enables once the engine is ready and nothing blocks', () => {
    render(<DownloadPanel />);
    act(() => actions().setEngine({ status: 'ready' }));
    expect(selectBlockers(lampStore.getState())).toEqual([]);
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-describedby')).toBeNull();
  });

  it('lists the error blockers and stays disabled', () => {
    render(<DownloadPanel />);
    act(() => {
      actions().setEngine({ status: 'ready' });
      // A 180 mm bed cannot take the default 240 mm base or the 200 mm outer segments.
      actions().applyPrinterPreset('bambu-a1-mini');
    });
    const blockers = selectBlockers(lampStore.getState());
    expect(blockers.length).toBeGreaterThan(0);
    expect(button().disabled).toBe(true);
    const lead = blockers.length === 1 ? 'Fix 1 error above to download.' : `Fix ${blockers.length} errors above to download.`;
    expect(screen.getByText(lead)).toBeTruthy();
    for (const b of blockers) expect(screen.getByText(b)).toBeTruthy();
  });

  it('shows the stage text on the button while an export runs', () => {
    render(<DownloadPanel />);
    act(() => {
      actions().setEngine({ status: 'ready' });
      actions().setExportJob({ phase: 'running', stage: 'outer-segment', done: 2, total: 7 });
    });
    const busy = screen.getByTestId('download-zip') as HTMLButtonElement;
    expect(busy.textContent).toContain('Building print meshes… 3 of 7');
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.disabled).toBe(true);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('29');
    act(() => actions().setExportJob({ phase: 'running', stage: 'zip', done: 6, total: 7 }));
    expect(screen.getByTestId('download-zip').textContent).toContain('Zipping…');
  });

  it('words the reason by engine state', () => {
    expect(blockedText('loading', [])).toBe('The geometry engine is still loading.');
    expect(blockedText('error', [])).toBe("The geometry engine didn't start.");
    expect(blockedText('ready', ['a'])).toBe('Fix 1 error above to download.');
    expect(blockedText('ready', ['a', 'b'])).toBe('Fix 2 errors above to download.');
  });
});
