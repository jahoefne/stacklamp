// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lampStore, resetLampStore, selectDims, selectFittedBands } from '../../state';
import { ColourBandEditor } from './ColourBandEditor';

beforeEach(() => resetLampStore({ persistPresets: false }));
afterEach(() => {
  cleanup();
  resetLampStore({ persistPresets: false });
});

const fitted = () => selectFittedBands(lampStore.getState());
const tile = (stack: 'outer' | 'inner', index: number) => {
  const n = selectDims(lampStore.getState())[stack].count;
  return screen.getByRole('button', { name: new RegExp(`^${stack === 'outer' ? 'Outer' : 'Inner'} band ${index + 1} of ${n}:`) });
};

describe('ColourBandEditor', () => {
  it('draws one labelled tile per band in each stack, bottom band first', () => {
    render(<ColourBandEditor />);
    const d = selectDims(lampStore.getState());
    const outer = screen.getAllByRole('button', { name: /^Outer band/ });
    const inner = screen.getAllByRole('button', { name: /^Inner band/ });
    expect(outer).toHaveLength(d.outer.count);
    expect(inner).toHaveLength(d.inner.count);
    // Colour is never the only signal: names are in the label and the tooltip.
    expect(outer[0]!.getAttribute('aria-label')).toBe(`Outer band 1 of ${d.outer.count}: Amber`);
    expect(outer[0]!.getAttribute('title')).toBe(outer[0]!.getAttribute('aria-label'));
    // One tab stop for the whole editor.
    const all = [...outer, ...inner];
    expect(all.filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });

  it('paints a band with the brush on click', async () => {
    const user = userEvent.setup();
    render(<ColourBandEditor />);
    act(() => lampStore.getState().actions.setBrush('blu'));
    await user.click(tile('outer', 2));
    expect(fitted().outer[2]).toBe('blu');
    expect(tile('outer', 2).getAttribute('aria-label')).toMatch(/: Blue$/);
    // Painting clears the stack's generator but keeps the other bands.
    expect(fitted().outer[0]).toBe('amb');
  });

  it('moves with the arrow keys and paints with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<ColourBandEditor />);
    act(() => lampStore.getState().actions.setBrush('tea'));
    tile('outer', 0).focus();

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(tile('outer', 2));
    expect(tile('outer', 2).tabIndex).toBe(0);
    await user.keyboard('{Enter}');
    expect(fitted().outer[2]).toBe('tea');

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tile('inner', 2));
    await user.keyboard(' ');
    expect(fitted().inner[2]).toBe('tea');

    await user.keyboard('{ArrowDown}{ArrowLeft}');
    expect(document.activeElement).toBe(tile('outer', 1));

    await user.keyboard('{End}');
    const top = selectDims(lampStore.getState()).outer.count - 1;
    expect(document.activeElement).toBe(tile('outer', top));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tile('outer', 0));
  });

  it('picks the brush with the number keys', async () => {
    const user = userEvent.setup();
    render(<ColourBandEditor />);
    tile('inner', 0).focus();
    await user.keyboard('5');
    expect(lampStore.getState().ui.brush).toBe('red');
    await user.keyboard('{Enter}');
    expect(fitted().inner[0]).toBe('red');
    expect(screen.getByText(/Inner band 1 of \d+: Red\./)).toBeTruthy();
  });
});
