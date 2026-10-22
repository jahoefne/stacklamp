// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, lampStore, resetLampStore, selectCode } from '../../state';
import { ToastProvider } from '../primitives/Toast';
import { ShareBar } from './ShareBar';

beforeEach(() => resetLampStore({ persistPresets: false }));
afterEach(() => {
  cleanup();
  resetLampStore({ persistPresets: false });
});

const select = () => screen.getByRole('combobox', { name: 'Preset' }) as HTMLSelectElement;
const load = () => screen.getByRole('button', { name: 'Load' }) as HTMLButtonElement;
const actions = () => lampStore.getState().actions;
const CLASSIC = `b:${BUILTIN_PRESETS[0]!.id}`;
const A1 = `b:${BUILTIN_PRESETS[1]!.id}`;

describe('ShareBar preset select', () => {
  it('shows the matching preset, then "Custom" once the lamp is edited, and the preset again after a reset', () => {
    render(<ShareBar />);
    expect(select().value).toBe(CLASSIC);
    expect(load().disabled).toBe(false);

    act(() => actions().setParam('core.length', 1000));
    expect(select().value).toBe('custom');
    expect(screen.getByRole('option', { name: 'Custom' })).toBeTruthy();
    expect(load().disabled).toBe(true);
    expect(screen.getByText('Edited since loading. Save it as a preset to keep it.')).toBeTruthy();

    act(() => actions().resetAll());
    expect(select().value).toBe(CLASSIC);
    expect(screen.queryByRole('option', { name: 'Custom' })).toBeNull();
    expect(load().disabled).toBe(false);
  });

  it('keeps a picked preset until it is loaded, then tracks edits against it', async () => {
    const user = userEvent.setup();
    render(<ShareBar />);
    await user.selectOptions(select(), A1);
    expect(select().value).toBe(A1);
    await user.click(load());
    expect(lampStore.getState().config.params.printer.preset).toBe('bambu-a1-mini');
    expect(select().value).toBe(A1);
    act(() => actions().setParam('core.length', 1200));
    expect(select().value).toBe('custom');
  });

  it('starts on "Custom" when the lamp matches no preset', () => {
    act(() => actions().setParam('core.length', 1700));
    render(<ShareBar />);
    expect(select().value).toBe('custom');
  });

  it('follows a saved preset: selected after saving, "Custom" after an edit, gone when deleted', async () => {
    const user = userEvent.setup();
    render(<ShareBar />);
    act(() => actions().setParam('core.length', 900));
    await user.click(screen.getByRole('button', { name: 'Save preset' }));
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Short{Enter}');
    expect(select().value).toBe('s:Short');
    act(() => actions().setParam('core.length', 950));
    expect(select().value).toBe('custom');
    act(() => actions().setParam('core.length', 900));
    expect(select().value).toBe('s:Short');
    act(() => actions().deletePreset('Short'));
    expect(select().value).toBe('custom');
  });
});

describe('ShareBar reset undo', () => {
  it('offers an undo button next to Reset until the lamp is edited again', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ShareBar />
      </ToastProvider>,
    );
    act(() => actions().setParam('core.length', 1000));
    const edited = selectCode(lampStore.getState());
    const reset = screen.getByRole('button', { name: 'Reset' });
    await user.click(reset);
    expect(lampStore.getState().config.params.core.length).toBe(1500);
    const undo = screen.getByRole('button', { name: 'Undo reset' });
    await user.click(undo);
    expect(lampStore.getState().config.params.core.length).toBe(1000);
    expect(selectCode(lampStore.getState())).toBe(edited);
    expect(screen.queryByRole('button', { name: 'Undo reset' })).toBeNull();
    expect(document.activeElement).toBe(reset);

    await user.click(reset);
    expect(screen.getByRole('button', { name: 'Undo reset' })).toBeTruthy();
    act(() => actions().setParam('core.length', 800));
    expect(screen.queryByRole('button', { name: 'Undo reset' })).toBeNull();
  });
});
