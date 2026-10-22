/**
 * Public barrel of the geometry engine. The app imports ONLY from here.
 * Backed by the real engine: pure-TS derivation on the main thread, Manifold
 * builds in the geometry worker (src/worker). `stub.ts` stays importable for
 * tests that want the old pure-JS stand-in.
 */
export * from './types';
export { CORE_PRESETS, PRINTER_PRESETS, PARAM_META, PARAM_META_BY_PATH, defaultParams, getParam, setParam } from './params';
export { deriveDims } from './derive';
export { partsKey } from './keys';
export { computeBom, PETG_DENSITY_G_CM3, FILAMENT_DIAMETER_MM } from './bom';
export { MESSAGE_CODES, type MessageCode } from './messages';
export { createGeometryClient, isBenignGeometryError } from '../worker/client';
export { parseConfig, type ConfigFile } from '../export/configJson';
