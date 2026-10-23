// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../geometry';
import { lampStore, resetLampStore } from '../../state';
import { PrinterTuning, TUNING_PATHS } from './PrinterTuning';
import { TubesSection } from './TubesSection';
import { WarningsList } from './WarningsList';

// Lets a test hand WarningsList a message the engine does not produce for the defaults.
const injected = vi.hoisted(() => ({ messages: null as Message[] | null }));
vi.mock('../../state', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../state')>();
  return {
    ...mod,
    selectMessages: (s: Parameters<typeof mod.selectMessages>[0]) => injected.messages ?? mod.selectMessages(s),
  };
});

beforeEach(() => {
  injected.messages = null;
  resetLampStore({ persistPresets: false });
});
afterEach(() => {
  cleanup();
  injected.messages = null;
  resetLampStore({ persistPresets: false });
});

describe('TubesSection: segment forms', () => {
  it('keeps the Tubes heading and adds the form diameters and the form editor', () => {
    render(<TubesSection />);
    expect(screen.getByRole('heading', { level: 2, name: 'Tubes' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Segment forms' })).toBeTruthy();
    const outer = screen.getByRole('textbox', { name: /^Outer form diameter/ });
    const inner = screen.getByRole('textbox', { name: /^Inner form diameter/ });
    expect(outer.id).toBe('field-tubes.outerFormOD');
    expect(inner.id).toBe('field-tubes.innerFormOD');
    expect((outer as HTMLInputElement).value).toBe(String(lampStore.getState().config.params.tubes.outerFormOD));
    expect(screen.getByText(/Widest point of bulging outer forms; waists narrow by the same amount/)).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Form brush' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Outer band \d+ of \d+: Straight$/ }).length).toBeGreaterThan(0);
  });

  it('writes the form diameter to the params', async () => {
    const user = userEvent.setup();
    render(<TubesSection />);
    const inner = screen.getByRole('textbox', { name: /^Inner form diameter/ });
    await user.clear(inner);
    await user.type(inner, '100{Enter}');
    expect(lampStore.getState().config.params.tubes.innerFormOD).toBe(100);
  });

  it('leaves the form diameters out of the tuning list, keeps the max overhang there in degrees', () => {
    expect(TUNING_PATHS).not.toContain('tubes.innerFormOD');
    expect(TUNING_PATHS).not.toContain('tubes.outerFormOD');
    expect(TUNING_PATHS).toContain('segments.maxOverhang');
    act(() => lampStore.getState().actions.setUi({ tuningOpen: true }));
    render(<PrinterTuning />);
    expect(screen.queryByRole('textbox', { name: /form diameter/i })).toBeNull();
    const overhang = screen.getByRole('textbox', { name: /^Max form overhang/ });
    expect(overhang.id).toBe('field-segments.maxOverhang');
    expect(screen.getByText('(degrees)', { exact: false })).toBeTruthy();
  });

  it('jumps from a form message to the inner form diameter field', async () => {
    const user = userEvent.setup();
    injected.messages = [{ code: 'form-too-wide', severity: 'error', text: 'The inner forms touch the outer stack.', path: 'tubes.innerFormOD' }];
    render(
      <>
        <TubesSection />
        <WarningsList />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Go to inner form diameter' }));
    expect(document.activeElement?.id).toBe('field-tubes.innerFormOD');
  });
});
