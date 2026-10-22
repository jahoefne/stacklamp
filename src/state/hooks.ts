/** React hooks over the singleton store. Selectors must return stable values (see selectors.ts). */
import { useCallback } from 'react';
import { useStore } from 'zustand';
import { getParam } from '../geometry';
import type { DerivedDims, Message, NumericParamPath } from '../geometry';
import { PARAM_SPEC_BY_PATH } from './paramSpec';
import type { ParamSpec } from './paramSpec';
import { selectActions, selectDims, selectFieldMessages } from './selectors';
import { lampStore } from './store';
import type { LampActions, LampState } from './store';

/** Subscribe to a slice of the store. */
export function useLamp<T>(selector: (s: LampState) => T): T {
  return useStore(lampStore, selector);
}

/** All actions (a stable object). */
export function useLampActions(): LampActions {
  return useStore(lampStore, selectActions);
}

/** Derived dims of the current params. */
export function useDims(): DerivedDims {
  return useStore(lampStore, selectDims);
}

export interface ParamBinding {
  value: number;
  spec: ParamSpec;
  set: (value: number) => void;
}

/** Value, spec (label, unit, range, step, precision, URL key) and setter of one numeric param. */
export function useParam(path: NumericParamPath): ParamBinding {
  const value = useStore(
    lampStore,
    useCallback((s: LampState) => getParam(s.config.params, path), [path]),
  );
  const { setParam } = useLampActions();
  const set = useCallback((v: number) => setParam(path, v), [setParam, path]);
  return { value, spec: PARAM_SPEC_BY_PATH.get(path)!, set };
}

/** Messages about one param path (for describedby / inline hints). */
export function useFieldMessages(path: string): readonly Message[] {
  return useStore(
    lampStore,
    useCallback((s: LampState) => selectFieldMessages(s, path), [path]),
  );
}
