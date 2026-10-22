/**
 * Public barrel of the geometry engine. The app imports ONLY from here.
 * Phase 0: backed by the pure-JS stub. The engine agent swaps the three
 * implementation imports below to the real modules when they land.
 */
export * from './types';
export { CORE_PRESETS, PRINTER_PRESETS, PARAM_META, PARAM_META_BY_PATH, defaultParams, getParam, setParam } from './params';
export { deriveDims, partsKey, computeBom, PETG_DENSITY_G_CM3 } from './stub';
export { createStubClient as createGeometryClient } from './stub';
