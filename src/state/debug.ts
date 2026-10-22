/** `window.__stacklamp` for the QA agent and manual debugging. */
import type { GeometryClient } from '../geometry';
import { engineStats, peekGeometryClient } from './services/engine';
import type { LampState, LampStore } from './store';

export interface StacklampDebugHook {
  getState: () => LampState;
  /** Number of buildParts calls made by the app's client. */
  readonly buildCount: number;
  /** Number of exportZip calls. */
  readonly exportCount: number;
  /** The app's GeometryClient (null until bootstrapped). */
  readonly engine: GeometryClient | null;
  store: LampStore;
}

declare global {
  interface Window {
    __stacklamp?: StacklampDebugHook;
  }
}

export function installDebugHook(store: LampStore): () => void {
  if (typeof window === 'undefined') return () => {};
  const hook: StacklampDebugHook = {
    getState: store.getState,
    get buildCount() {
      return engineStats.buildParts;
    },
    get exportCount() {
      return engineStats.exportZip;
    },
    get engine() {
      return peekGeometryClient();
    },
    store,
  };
  window.__stacklamp = hook;
  return () => {
    if (window.__stacklamp === hook) delete window.__stacklamp;
  };
}
