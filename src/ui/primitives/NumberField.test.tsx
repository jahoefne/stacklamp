// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

afterEach(() => cleanup());

interface HarnessProps {
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  onChange?: (v: number) => void;
}

function Harness({ initial = 1500, min = 600, max = 2000, step = 10, precision = 0, onChange = () => {} }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <NumberField
      id="rod"
      label="Rod length"
      unit="mm"
      value={value}
      min={min}
      max={max}
      step={step}
      precision={precision}
      slider
      onChange={(v) => {
        onChange(v);
        setValue(v);
      }}
    />
  );
}

const input = () => screen.getByRole('textbox', { name: /rod length/i }) as HTMLInputElement;

describe('NumberField', () => {
  it('is a decimal text input labelled with its unit, showing the value', () => {
    render(<Harness />);
    const el = input();
    expect(el.type).toBe('text');
    expect(el.inputMode).toBe('decimal');
    expect(el.value).toBe('1500');
    expect(screen.getByText('mm')).toBeTruthy();
    expect(screen.getByRole('slider', { name: /rod length/i })).toBeTruthy();
  });

  it('applies a valid in-range draft immediately while typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.clear(input());
    await user.type(input(), '1200');
    // "1", "12", "120" are below 600 and never applied; "1200" is.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(1200);
    expect(input().getAttribute('aria-invalid')).toBeNull();
  });

  it('flags an out-of-range draft with the allowed range, then clamps on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.clear(input());
    await user.type(input(), '50');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Out of range: 600 to 2000 mm.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    // The error is wired to the input.
    const describedBy = input().getAttribute('aria-describedby') ?? '';
    expect(describedBy).toContain('rod-error');

    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(600);
    expect(input().value).toBe('600');
    expect(input().getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByText('Min 600 mm, set to 600.')).toBeTruthy();
  });

  it('clamps above the maximum on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.clear(input());
    await user.type(input(), '9999{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(2000);
    expect(input().value).toBe('2000');
  });

  it('accepts a comma as the decimal separator', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={1} min={0.4} max={2} step={0.05} precision={2} onChange={onChange} />);
    await user.clear(input());
    await user.type(input(), '0,8');
    expect(onChange).toHaveBeenLastCalledWith(0.8);
    await user.tab();
    expect(input().value).toBe('0.8');
  });

  it('steps with the arrow keys, × 10 with Shift, and stops at the limits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={1990} onChange={onChange} />);
    await user.click(input());
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith(1980);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(onChange).toHaveBeenLastCalledWith(1880);
    await user.keyboard('{Shift>}{ArrowUp}{ArrowUp}{/Shift}');
    expect(onChange).toHaveBeenLastCalledWith(2000);
    expect(input().value).toBe('2000');
  });

  it('reverts to the value it had on focus with Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(input());
    await user.clear(input());
    await user.type(input(), '1200');
    expect(onChange).toHaveBeenLastCalledWith(1200);
    await user.keyboard('{Escape}');
    expect(onChange).toHaveBeenLastCalledWith(1500);
    expect(input().value).toBe('1500');
  });

  it('drops an unparsable draft on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.clear(input());
    await user.type(input(), 'abc');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    await user.tab();
    expect(input().value).toBe('1500');
    expect(onChange).not.toHaveBeenCalled();
  });
});
