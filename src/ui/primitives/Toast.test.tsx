// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetLampStore } from '../../state';
import { ACTION_MS, ToastProvider, useToast } from './Toast';

function Trigger({ onUndo }: { onUndo: () => void }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show({ text: 'Reset to the default lamp.', action: { label: 'Undo', onAction: onUndo } })}>
      Reset
    </button>
  );
}

beforeEach(() => resetLampStore({ persistPresets: false }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('returns focus to the button that opened it after Undo', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    const reset = screen.getByRole('button', { name: 'Reset' });
    await user.click(reset);
    expect(screen.getByText('Reset to the default lamp.')).toBeTruthy();
    const undo = screen.getByRole('button', { name: 'Undo' });
    await user.click(undo);
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Reset to the default lamp.')).toBeNull();
    expect(document.activeElement).toBe(reset);
  });

  it('returns focus to the opener when closed from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger onUndo={() => {}} />
      </ToastProvider>,
    );
    const reset = screen.getByRole('button', { name: 'Reset' });
    await user.click(reset);
    const close = screen.getByRole('button', { name: 'Close message' });
    close.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(document.activeElement).toBe(reset);
  });

  it('keeps a toast with an action for 10 s, paused while focused', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger onUndo={() => {}} />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Reset' }).click());
    act(() => {
      screen.getByRole('button', { name: 'Undo' }).focus();
    });
    act(() => vi.advanceTimersByTime(ACTION_MS + 1000));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    act(() => {
      screen.getByRole('button', { name: 'Undo' }).blur();
    });
    act(() => vi.advanceTimersByTime(ACTION_MS - 100));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
