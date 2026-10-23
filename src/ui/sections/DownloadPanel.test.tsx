// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartMesh } from '../../geometry';
import { lampStore, resetLampStore, selectBlockers, selectDims } from '../../state';
import { fakeParts } from '../../state/test/fakes';
import { DownloadPanel, blockedText } from './DownloadPanel';

// No worker in jsdom: the download only flips the job to 'running'.
vi.mock('../../state', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../state')>();
  return {
    ...mod,
    download: vi.fn(async () => {
      mod.lampStore.getState().actions.setExportJob({ phase: 'running', stage: 'base', done: 0, total: 7 });
      return true;
    }),
  };
});

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

  it('keeps keyboard focus on Cancel while the export runs and returns it to the button', () => {
    render(<DownloadPanel />);
    act(() => actions().setEngine({ status: 'ready' }));
    button().focus();
    act(() => button().click());
    expect(lampStore.getState().exportJob.phase).toBe('running');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    act(() => actions().setExportJob({ phase: 'done', fileName: 'stacklamp.zip' }));
    expect(document.activeElement).toBe(screen.getByTestId('download-zip'));
  });

  it('lists one parts row per file, with the form after the part name', () => {
    render(<DownloadPanel />);
    act(() => {
      actions().setForms('outer', ['ball', 'straight']);
      const s = lampStore.getState();
      const n = selectDims(s).outer.count;
      const balls = Math.ceil(n / 2);
      // The engine yields one outer-segment mesh per form in use.
      const parts = fakeParts(selectDims(s)).flatMap((m): PartMesh[] =>
        m.id === 'outer-segment' ? [{ ...m, copies: n - balls }, { ...m, form: 'ball', copies: balls }] : [m],
      );
      actions().setPreview({ parts, params: s.config.params, status: 'idle' });
    });
    const plain = document.querySelector('tr[data-file="outer-segment"]');
    const ball = document.querySelector('tr[data-file="outer-segment-ball"]');
    // (The fit icon's title comes first in the cell text.)
    expect(plain?.querySelector('th')?.textContent).toMatch(/printerOuter segment$/);
    expect(ball?.querySelector('th')?.textContent).toMatch(/printerOuter segment · Ball$/);
    expect(screen.getByRole('rowheader', { name: /Outer segment · Ball$/ })).toBeTruthy();
    expect(document.querySelector('tr[data-file="inner-segment"] th')?.textContent).toMatch(/printerInner segment$/);
  });

  it('words the reason by engine state', () => {
    expect(blockedText('loading', [])).toBe('The geometry engine is still loading.');
    expect(blockedText('error', [])).toBe("The geometry engine didn't start.");
    expect(blockedText('ready', ['a'])).toBe('Fix 1 error above to download.');
    expect(blockedText('ready', ['a', 'b'])).toBe('Fix 2 errors above to download.');
  });
});
