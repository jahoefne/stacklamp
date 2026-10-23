/**
 * Public API of the app state (src/state). UI and preview code import ONLY from here.
 * See README.md in this folder for a tour.
 */

// Store
export { lampStore, createLampStore, resetLampStore, initialLampData } from './store';
export type {
  LampState,
  LampActions,
  LampStore,
  LampStoreInit,
  LampData,
  EngineState,
  PreviewState,
  ExportJob,
  Notice,
  ConfigSource,
} from './store';

// Hooks
export { useLamp, useLampActions, useDims, useParam, useFieldMessages } from './hooks';
export type { ParamBinding } from './hooks';

// Selectors
export {
  selectActions,
  selectConfig,
  selectParams,
  selectPalette,
  selectDims,
  selectPreviewDims,
  selectMessages,
  selectCounts,
  selectFittedBands,
  selectFittedForms,
  selectStackBands,
  selectColourPlan,
  selectUsage,
  selectBom,
  selectPreviewStale,
  selectBlockers,
  selectCanDownload,
  selectCode,
  selectShareUrl,
  selectFieldMessages,
  dimsFor,
  partsKeyFor,
} from './selectors';
export type { ColourUsage } from './selectors';

// Config model
export {
  CONFIG_VERSION,
  STACKS,
  GENERATOR_KINDS,
  defaultConfig,
  defaultUiPrefs,
  defaultGen,
  normalizeUi,
  fixUiColourRefs,
} from './config';
export type { Stack, GeneratorKind, GeneratorSpec, Bands, Generators, LampConfig, UiPrefs, ViewMode, GenTarget, GlowMode } from './config';

// Palette, bands, generators
export {
  DEFAULT_PALETTE,
  DEFAULT_COLOUR_IDS,
  MAX_COLOURS,
  MAX_NAME_LENGTH,
  defaultPalette,
  sanitizeColourName,
  normalizeHex,
  nextCustomId,
  isDefaultPalette,
  findColour,
} from './palette';
export { fitBands, paintBand, replaceColour, bandsEqual } from './bands';
export { generateBands, mirrorBands, mulberry32, freshSeed, normalizeSpec, specEquals, specsForTarget } from './generators';

// Params + URL codec
export {
  PARAM_SPECS,
  PARAM_SPEC_BY_PATH,
  PARAM_SPEC_BY_KEY,
  NUMERIC_URL_KEYS,
  ENUM_SPECS,
  ENUM_PATHS,
  CODEC_KEYS,
  ALL_URL_KEYS,
  formatNumber,
  roundToPrecision,
} from './paramSpec';
export type { ParamSpec, EnumSpec, EnumValue } from './paramSpec';
export { getEnumParam, withEnumParam, enumValues, isEnumValue } from './paths';
export { encodeConfig, encodeConfigAuto, decodeConfig, countsFor, referenceParams, migrations } from './codec';
export type { BandCounts, DecodeResult } from './codec';

// Persistence + presets
export { loadInitial, startPersistence, shareUrl } from './persistence';
export type { InitialState, InitialSource } from './persistence';
export { STORAGE_KEYS } from './storage';
export { BUILTIN_PRESETS, loadSavedPresets, findPreset, cleanPresetName } from './presets';
export type { BuiltinPreset, SavedPreset } from './presets';

// Services + wiring
export { bootstrapLamp, download, cancelDownload } from './bootstrap';
export type { BootstrapOptions, BootstrapResult } from './bootstrap';
export { getGeometryClient, peekGeometryClient, engineStats } from './services/engine';
export { createPreviewScheduler } from './services/previewScheduler';
export type { StopPreviewScheduler, PreviewSchedulerStats } from './services/previewScheduler';
export { downloadZip, buildExportRequest, appVersion } from './services/exporter';
export type { DownloadOptions } from './services/exporter';
export { installDebugHook } from './debug';
export type { StacklampDebugHook } from './debug';
