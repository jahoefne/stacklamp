// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl, type SegmentOption } from './SegmentedControl';

afterEach(() => cleanup());

type Mode = 'assembled' | 'inner' | 'exploded' | 'xray';
const OPTIONS: SegmentOption<Mode>[] = [
  { value: 'assembled', label: 'Assembled' },
  { value: 'inner', label: 'Inner' },
  { value: 'xray', label: 'X-ray', disabled: true },
  { value: 'exploded', label: 'Exploded' },
];

function Harness({ onChange = () => {} }: { onChange?: (m: Mode) => void }) {
  const [value, setValue] = useState<Mode>('assembled');
  return (
    <>
      <button type="button">before</button>
      <SegmentedControl
        label="View"
        options={OPTIONS}
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
      />
      <button type="button">after</button>
    </>
  );
}

describe('SegmentedControl', () => {
  it('is a labelled radiogroup with one tab stop on the selected option', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'View' });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it('tabs in and out through a single stop', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'before' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Assembled' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'after' }));
  });

  it('moves and selects with the arrow keys, skipping disabled options and wrapping', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole('radio', { name: 'Assembled' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('inner');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Inner' }));
    expect(screen.getByRole('radio', { name: 'Inner' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Inner' }).tabIndex).toBe(0);

    await user.keyboard('{ArrowRight}'); // skips the disabled X-ray
    expect(onChange).toHaveBeenLastCalledWith('exploded');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Exploded' }));

    await user.keyboard('{ArrowRight}'); // wraps
    expect(onChange).toHaveBeenLastCalledWith('assembled');

    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('exploded');

    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('assembled');
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('exploded');
  });

  it('selects on click and ignores disabled options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Inner' }));
    expect(onChange).toHaveBeenLastCalledWith('inner');
    await user.click(screen.getByRole('radio', { name: 'X-ray' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
