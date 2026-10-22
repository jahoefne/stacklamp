// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapLamp } from './bootstrap';
import { useDims, useFieldMessages, useLamp, useLampActions, useParam } from './hooks';
import { selectBom, selectColourPlan, selectFittedBands, selectUsage } from './selectors';
import { createLampStore, lampStore, resetLampStore } from './store';

afterEach(() => resetLampStore({ persistPresets: false }));

describe('hooks', () => {
  it('render memoised selectors without update loops', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return {
        bands: useLamp(selectFittedBands),
        plan: useLamp(selectColourPlan),
        usage: useLamp(selectUsage),
        bom: useLamp(selectBom),
        dims: useDims(),
      };
    });
    expect(result.current.bands.outer.length).toBe(result.current.dims.outer.count);
    const before = renders;
    act(() => lampStore.getState().actions.setUi({ glow: 'off' }));
    expect(renders).toBe(before);
    act(() => lampStore.getState().actions.paintBand('outer', 0, 'grn'));
    expect(renders).toBe(before + 1);
    expect(result.current.bands.outer[0]).toBe('grn');
  });
  it('useParam binds value, spec and setter; useFieldMessages follows dims', () => {
    const { result } = renderHook(() => ({ rod: useParam('core.length'), msgs: useFieldMessages('tubes.innerOD'), actions: useLampActions() }));
    expect(result.current.rod.value).toBe(1500);
    expect(result.current.rod.spec).toMatchObject({ key: 'rl', unit: 'mm', min: 600, max: 2000 });
    act(() => result.current.rod.set(1234));
    expect(result.current.rod.value).toBe(1234);
    expect(result.current.msgs).toEqual([]);
    act(() => {
      result.current.actions.setParam('tubes.innerOD', 30);
      result.current.actions.setParam('core.diameter', 40);
    });
    expect(result.current.msgs.length).toBeGreaterThan(0);
  });
});

describe('bootstrapLamp', () => {
  it('loads the hash into the store, starts persistence and installs the debug hook', () => {
    history.replaceState(null, '', '#v=1&rl=1100');
    const store = createLampStore({ persistPresets: false });
    const boot = bootstrapLamp({ store, preview: false });
    expect(boot.source).toBe('link');
    expect(store.getState().config.params.core.length).toBe(1100);
    expect(window.__stacklamp?.getState().config.params.core.length).toBe(1100);
    expect(window.__stacklamp?.buildCount).toBeTypeOf('number');
    expect(bootstrapLamp({ store })).toBe(boot);
    boot.teardown();
    expect(window.__stacklamp).toBeUndefined();
  });
});
