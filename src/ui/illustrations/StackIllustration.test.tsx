// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STACK_DIMS, StackIllustration } from './StackIllustration';
import { ICON_NAMES, Icon } from './icons';

afterEach(cleanup);

const OUTER = ['#FFA41B', '#FF6A1F', '#F2363F', '#9E5FFF', '#3D7BFF'];
const INNER = ['#FFF4DC', '#FFF4DC', '#00B3A6', '#FFF4DC', '#FFF4DC', '#33C24D'];

const fills = (root: Element, part: string) =>
  [...root.querySelectorAll(`[data-part="${part}"] rect`)].map((r) => r.getAttribute('fill'));

describe('StackIllustration hero', () => {
  it('renders an accessible drawing with one band per colour', () => {
    render(<StackIllustration variant="hero" outerColours={OUTER} innerColours={INNER} title="A stack of coloured rings" />);
    const svg = screen.getByRole('img', { name: 'A stack of coloured rings' });
    expect(svg.getAttribute('data-variant')).toBe('hero');
    const outer = fills(svg, 'outer');
    for (const c of OUTER) expect(outer).toContain(c);
    expect(outer.filter((f) => OUTER.includes(f ?? '')).length).toBe(OUTER.length);
    expect(fills(svg, 'halo').length).toBe(OUTER.length);
    expect(fills(svg, 'inner').filter((f) => INNER.includes(f ?? '')).length).toBe(INNER.length);
  });

  it('falls back to the default plan and sanitises colours', () => {
    const { container, rerender } = render(<StackIllustration variant="hero" outerColours={[]} innerColours={[]} title="Lamp" />);
    expect(fills(container, 'halo').length).toBe(11);
    rerender(<StackIllustration variant="hero" outerColours={['red; fill: url(x)', '#ABC']} innerColours={['nope']} title="Lamp" />);
    const outer = fills(container, 'outer');
    expect(outer).toContain('#ABC');
    expect(outer.some((f) => f?.includes('url'))).toBe(false);
  });

  it('animates only on request, guarded by prefers-reduced-motion', () => {
    const { container, rerender } = render(<StackIllustration variant="hero" outerColours={OUTER} innerColours={INNER} title="Lamp" />);
    expect(container.querySelector('style')).toBeNull();
    rerender(<StackIllustration variant="hero" outerColours={OUTER} innerColours={INNER} title="Lamp" animate />);
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('prefers-reduced-motion: no-preference');
    expect(css).toContain('@keyframes');
  });
});

describe('StackIllustration schematic', () => {
  it('renders to scale with defaults when dims are absent', () => {
    render(<StackIllustration variant="schematic" outerColours={[]} innerColours={[]} title="Lamp elevation" />);
    const svg = screen.getByRole('img', { name: 'Lamp elevation' });
    expect(svg.getAttribute('data-variant')).toBe('schematic');
    expect(svg.querySelector('desc')?.textContent).toContain(`${DEFAULT_STACK_DIMS.totalHeight} mm tall`);
    expect(svg.textContent).toContain('Ø 200');
    expect(svg.textContent).toContain('Ø 240');
    expect(svg.textContent).toContain('1500 mm');
    expect(svg.textContent).toContain('Inner Ø 60');
    expect(svg.textContent).toContain('11 × 154.5 mm');
    // 11 segments at the default rod length
    expect(svg.querySelectorAll('[data-part="outer-exterior"] > g').length).toBe(11);
    // the viewBox height covers the lamp plus label margins
    const [, , , h] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(h).toBeGreaterThan(DEFAULT_STACK_DIMS.totalHeight);
  });

  it('draws the given bands and labels the given dims', () => {
    const dims = { totalHeight: 760, outerOD: 180, innerOD: 50, baseD: 220, innerSegH: 160, outerSegH: 162, rodLength: 720 };
    const { container } = render(
      <StackIllustration variant="schematic" outerColours={OUTER} innerColours={INNER} dims={dims} title="Lamp" />,
    );
    const outer = [...container.querySelectorAll('[data-part="outer-exterior"] > g > rect:first-child')].map((r) =>
      r.getAttribute('fill'),
    );
    expect(outer).toEqual(OUTER);
    const inner = [...container.querySelectorAll('[data-part="inner-exterior"] > g > rect:first-child')].map((r) =>
      r.getAttribute('fill'),
    );
    expect(inner).toEqual(INNER);
    expect(container.textContent).toContain('760 mm');
    expect(container.textContent).toContain('Ø 180');
    expect(container.textContent).toContain('Inner Ø 50');
    expect(container.querySelector('[data-callout="outer"]')?.textContent).toMatch(/^Outer5 × \d/);
    expect(container.querySelector('[data-callout="inner"]')?.textContent).toMatch(/6 × \d/);
    // every band has a positive, finite height
    for (const r of container.querySelectorAll('[data-part="outer-exterior"] rect')) {
      const hh = Number(r.getAttribute('height'));
      expect(Number.isFinite(hh) && hh > 0).toBe(true);
    }
  });

  it('survives nonsense dims', () => {
    const dims = { totalHeight: Number.NaN, outerOD: -5, innerOD: 0, baseD: 10, innerSegH: 2, outerSegH: 1e9, rodLength: 0 };
    const { container } = render(
      <StackIllustration variant="schematic" outerColours={OUTER} innerColours={INNER} dims={dims} title="Lamp" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe('Icon', () => {
  it.each(ICON_NAMES)('renders %s', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 20');
    expect(svg.children.length).toBeGreaterThan(0);
  });

  it('is named when titled and honours size', () => {
    render(<Icon name="download" title="Download ZIP" size={24} />);
    const svg = screen.getByRole('img', { name: 'Download ZIP' });
    expect(svg.getAttribute('width')).toBe('24');
  });
});
