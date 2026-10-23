// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FORM_IDS, FORMS } from '../../geometry';
import { lampStore, resetLampStore, selectDims, selectFittedBands } from '../../state';
import { FormBandEditor, alternateForms } from './FormBandEditor';

beforeEach(() => resetLampStore({ persistPresets: false }));
afterEach(() => {
  cleanup();
  resetLampStore({ persistPresets: false });
});

const fitted = (stack: 'outer' | 'inner') => selectDims(lampStore.getState())[stack].forms;
const count = (stack: 'outer' | 'inner') => selectDims(lampStore.getState())[stack].count;
const tile = (stack: 'outer' | 'inner', index: number) =>
  screen.getByRole('button', { name: new RegExp(`^${stack === 'outer' ? 'Outer' : 'Inner'} band ${index + 1} of ${count(stack)}:`) });
const actions = () => lampStore.getState().actions;

describe('FormBandEditor', () => {
  it('draws one labelled tile per band in each stack, bottom band first, tinted with its colour', () => {
    const { container } = render(<FormBandEditor />);
    const outer = screen.getAllByRole('button', { name: /^Outer band/ });
    const inner = screen.getAllByRole('button', { name: /^Inner band/ });
    expect(outer).toHaveLength(count('outer'));
    expect(inner).toHaveLength(count('inner'));
    // The default lamp is all straight; the form is in the label, the tooltip and the glyph.
    expect(outer[0]!.getAttribute('aria-label')).toBe(`Outer band 1 of ${count('outer')}: Straight`);
    expect(outer[0]!.getAttribute('title')).toBe(outer[0]!.getAttribute('aria-label'));
    expect(outer[0]!.dataset.form).toBe('straight');
    expect(outer[0]!.querySelector('[data-form-glyph]')?.getAttribute('data-form-glyph')).toBe('straight');
    // DOM order is bottom → top (the column is drawn reversed).
    expect(outer.map((t) => t.dataset.formIndex)).toEqual(outer.map((_, i) => String(i)));
    // Tiles carry their band colour, so the form editor lines up with the colour editor.
    const bands = selectFittedBands(lampStore.getState());
    const amber = lampStore.getState().config.palette.find((c) => c.id === bands.outer[0])!.hex;
    expect(outer[0]!.style.getPropertyValue('--_c')).toBe(amber);
    // One tab stop for all tiles.
    expect([...outer, ...inner].filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(container.querySelectorAll('[data-form-column]')).toHaveLength(2);
  });

  it('offers every form as a brush and binds it to ui.formBrush', async () => {
    const user = userEvent.setup();
    render(<FormBandEditor />);
    const picker = screen.getByRole('radiogroup', { name: 'Form brush' });
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(FORM_IDS.map((id) => FORMS[id].label));
    expect(screen.getByRole('radio', { name: 'Ball' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Twist' }).getAttribute('title')).toBe(`Twist. ${FORMS.twist.hint}`);
    expect(picker.getAttribute('aria-describedby')).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Waist' }));
    expect(lampStore.getState().ui.formBrush).toBe('waist');
    expect(screen.getByRole('radio', { name: 'Waist' }).getAttribute('aria-checked')).toBe('true');
    expect(document.getElementById(picker.getAttribute('aria-describedby')!)?.textContent).toBe(`Waist ${FORMS.waist.hint}`);
  });

  it('paints a band with the brush on click', async () => {
    const user = userEvent.setup();
    render(<FormBandEditor />);
    act(() => actions().setFormBrush('drop'));
    await user.click(tile('outer', 2));
    expect(fitted('outer')[2]).toBe('drop');
    expect(tile('outer', 2).getAttribute('aria-label')).toMatch(/: Drop$/);
    expect(tile('outer', 2).dataset.form).toBe('drop');
    // The other bands stay straight.
    expect(fitted('outer').filter((f) => f !== 'straight')).toEqual(['drop']);
    expect(fitted('inner').every((f) => f === 'straight')).toBe(true);
  });

  it('moves with the arrow keys and paints with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<FormBandEditor />);
    act(() => actions().setFormBrush('barrel'));
    tile('outer', 0).focus();

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(tile('outer', 2));
    expect(tile('outer', 2).tabIndex).toBe(0);
    await user.keyboard('{Enter}');
    expect(fitted('outer')[2]).toBe('barrel');
    expect(screen.getByText(`Outer band 3 of ${count('outer')}: Barrel.`)).toBeTruthy();

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tile('inner', 2));
    await user.keyboard(' ');
    expect(fitted('inner')[2]).toBe('barrel');

    await user.keyboard('{ArrowDown}{ArrowLeft}');
    expect(document.activeElement).toBe(tile('outer', 1));

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tile('outer', count('outer') - 1));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tile('outer', 0));
  });

  it('picks the brush with the number keys 1 to 8', async () => {
    const user = userEvent.setup();
    render(<FormBandEditor />);
    tile('inner', 0).focus();
    await user.keyboard('6');
    expect(lampStore.getState().ui.formBrush).toBe(FORM_IDS[5]);
    expect(screen.getByText(`Form brush: ${FORMS[FORM_IDS[5]!].label}.`)).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(fitted('inner')[0]).toBe(FORM_IDS[5]);
    // 9 is not a form: the brush stays.
    await user.keyboard('9');
    expect(lampStore.getState().ui.formBrush).toBe(FORM_IDS[5]);
  });

  it('fills a stack with the brush', async () => {
    const user = userEvent.setup();
    render(<FormBandEditor />);
    act(() => actions().setFormBrush('flute'));
    await user.click(screen.getByRole('button', { name: 'Fill outer stack with Fluted' }));
    expect(fitted('outer').every((f) => f === 'flute')).toBe(true);
    expect(lampStore.getState().config.params.forms.outer).toHaveLength(count('outer'));
    expect(fitted('inner').every((f) => f === 'straight')).toBe(true);
    expect(screen.getByText(`Outer: all ${count('outer')} bands Fluted.`)).toBeTruthy();
  });

  it('alternates the brush with straight, starting at the bottom band', async () => {
    const user = userEvent.setup();
    render(<FormBandEditor />);
    await user.click(screen.getByRole('button', { name: 'Alternate inner stack: Ball and Straight' }));
    const n = count('inner');
    expect(fitted('inner')).toEqual(alternateForms('ball', n));
    expect(fitted('inner').slice(0, 3)).toEqual(['ball', 'straight', 'ball']);
    expect(fitted('outer').every((f) => f === 'straight')).toBe(true);
  });
});
