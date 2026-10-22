/**
 * The app store (zustand 5 vanilla + subscribeWithSelector; no persist, no immer).
 * `lampStore` is the app singleton (created with defaults, no side effects);
 * `createLampStore()` makes isolated stores for tests. Persistence, the engine and the
 * preview scheduler are wired by `bootstrapLamp()` (bootstrap.ts).
 */
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { CORE_PRESETS, PRINTER_PRESETS, defaultParams, getParam, setParam as setParamValue } from '../geometry';
import type {
  CoreKind,
  EnumParamPath,
  ExportStage,
  HeightMode,
  LampParams,
  NumericParamPath,
  PartMesh,
  PetgColour,
  PrinterId,
} from '../geometry';
import { fitBands, paintBand as paintBandPure, replaceColour } from './bands';
import { decodeConfig, encodeConfig } from './codec';
import { STACKS, defaultConfig, defaultUiPrefs, fixUiColourRefs } from './config';
import type { GeneratorKind, GeneratorSpec, LampConfig, Stack, UiPrefs } from './config';
import { freshSeed, generateBands, mirrorBands, normalizeSpec, specsForTarget, uniqueColours } from './generators';
import { MAX_COLOURS, defaultPalette, nextCustomId, normalizeHex, sanitizeColourName } from './palette';
import { ENUM_PATHS, PARAM_SPECS, PARAM_SPEC_BY_PATH, roundToPrecision } from './paramSpec';
import type { EnumValue } from './paramSpec';
import { getEnumParam, withEnumParam } from './paths';
import { cleanPresetName, findPreset, upsertPreset, writeSavedPresets } from './presets';
import type { SavedPreset } from './presets';
import { selectCounts, selectDims } from './selectors';

export interface EngineState {
  status: 'loading' | 'ready' | 'error';
  error?: string | undefined;
}

export interface PreviewState {
  status: 'idle' | 'building' | 'error';
  /** Last good parts (kept on error). */
  parts: PartMesh[] | null;
  /** The params the parts were built FROM (updated without a rebuild when only non-geometry params change). */
  params: LampParams | null;
  buildMs?: number | undefined;
  error?: string | undefined;
}

export type ExportJob =
  | { phase: 'idle' }
  | { phase: 'running'; stage: ExportStage; done: number; total: number }
  | { phase: 'done'; fileName: string }
  | { phase: 'error'; message: string };

export interface Notice {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

/** Where a config came from (for loadConfig). */
export type ConfigSource = 'default' | 'link' | 'storage' | 'preset' | 'reset';

export interface LampActions {
  /** Set a numeric param: rounded to its precision, clamped to PARAM_META. Honours ui.linkSegmentHeights; editing a bed size switches the printer preset to 'custom'. */
  setParam(path: NumericParamPath, value: number): void;
  /** Set an enum param. 'core.kind' and 'printer.preset' delegate to applyCorePreset / applyPrinterPreset. */
  setEnum<P extends EnumParamPath>(path: P, value: EnumValue<P>): void;
  /** Core kind + the preset's diameter; the LED tube also zeroes the strip build-up and inner slits (the rod restores their defaults). */
  applyCorePreset(kind: CoreKind): void;
  /** Printer preset + its bed size ('custom' keeps the current bed). */
  applyPrinterPreset(id: PrinterId): void;
  setHeightMode(mode: HeightMode): void;
  /** Paint band `index` (0 = bottom) of `stack` with `colourId` (default: ui.brush). Clears that stack's generator. */
  paintBand(stack: Stack, index: number, colourId?: string): void;
  /** Run a generator over ui.mix on ui.genTarget, fitted to the current N. Random gets a fresh seed ('both': outer = seed + 1). */
  applyGenerator(kind: GeneratorKind): void;
  /** On ui.genTarget: toggles `mirrored` on generator-driven stacks; reflects painted stacks about the middle. */
  mirror(): void;
  setBrush(id: string): void;
  /** Add/remove a colour from ui.mix (kept in palette order). */
  toggleMix(id: string): void;
  /** Add a palette colour (max 16). Returns the new id, or null when full. */
  addColour(colour?: { name?: string; hex?: string }): string | null;
  updateColour(id: string, patch: { name?: string; hex?: string }): void;
  /** Remove a colour; bands, generators, brush and mix that used it switch to `replacement` (default: first other colour). */
  removeColour(id: string, replacement?: string): void;
  /** Back to DEFAULT_PALETTE; bands using removed custom colours become palette[0]. */
  resetPalette(): void;
  /** Merge UI prefs. Turning linkSegmentHeights on sets innerHeight = outerHeight. */
  setUi(patch: Partial<UiPrefs>): void;
  /** Replace the config (from a link, storage, preset…). Fixes brush/mix; unlinks heights when they differ. */
  loadConfig(config: LampConfig, source: ConfigSource): void;
  /** Default lamp + default colour tools (keeps view mode, glow, export format, tuning panel, saved presets). */
  resetAll(): void;
  /** Save the current config under `name` (replaces a preset of the same name). False when the name is empty. */
  savePreset(name: string): boolean;
  deletePreset(name: string): void;
  /** Load a built-in preset (by id or name) or a saved one (by name). False when not found. */
  loadPreset(idOrName: string): boolean;
  notify(kind: Notice['kind'], text: string): void;
  /** Clear the notice (only if it still is `id`, when given). */
  dismissNotice(id?: number): void;
  /** Internal (services). */
  setEngine(engine: EngineState): void;
  /** Internal (preview scheduler). Shallow-merges into `preview`. */
  setPreview(patch: Partial<PreviewState>): void;
  /** Internal (exporter). */
  setExportJob(job: ExportJob): void;
}

export interface LampState {
  config: LampConfig;
  ui: UiPrefs;
  saved: SavedPreset[];
  engine: EngineState;
  preview: PreviewState;
  exportJob: ExportJob;
  notice: Notice | null;
  actions: LampActions;
}

export interface LampStoreInit {
  config?: LampConfig;
  ui?: UiPrefs;
  saved?: SavedPreset[];
  engine?: EngineState;
  /** Random source for generator seeds (tests). */
  random?: () => number;
  /** Write saved presets to localStorage (default true; a no-op outside the browser). */
  persistPresets?: boolean;
}

export type LampData = Omit<LampState, 'actions'>;

export function initialLampData(init: LampStoreInit = {}): LampData {
  const config = init.config ?? defaultConfig();
  return {
    config,
    ui: fixUiColourRefs(init.ui ?? defaultUiPrefs(), config.palette),
    saved: init.saved ?? [],
    engine: init.engine ?? { status: 'loading' },
    preview: { status: 'idle', parts: null, params: null },
    exportJob: { phase: 'idle' },
    notice: null,
  };
}

function sameParams(a: LampParams, b: LampParams): boolean {
  if (a === b) return true;
  return (
    PARAM_SPECS.every((s) => getParam(a, s.path) === getParam(b, s.path)) &&
    ENUM_PATHS.every((p) => getEnumParam(a, p) === getEnumParam(b, p))
  );
}

const HEIGHT_PAIR: Partial<Record<NumericParamPath, NumericParamPath>> = {
  'segments.innerHeight': 'segments.outerHeight',
  'segments.outerHeight': 'segments.innerHeight',
};

let noticeSeq = 0;

export function createLampStore(init: LampStoreInit = {}) {
  const random = init.random ?? Math.random;
  const persistPresets = init.persistPresets ?? true;
  const store = createStore<LampState>()(
    subscribeWithSelector((set, get) => {
      const setConfig = (next: LampConfig) => {
        if (next !== get().config) set({ config: next });
      };
      const setParams = (p: LampParams) => {
        const c = get().config;
        if (!sameParams(c.params, p)) set({ config: { ...c, params: p } });
      };
      const notify = (kind: Notice['kind'], text: string) => set({ notice: { id: ++noticeSeq, kind, text } });
      const storeSaved = (saved: SavedPreset[]) => {
        set({ saved });
        if (persistPresets) writeSavedPresets(saved);
      };
      const loadConfig = (config: LampConfig, _source: ConfigSource) => {
        const { ui } = get();
        let nextUi = fixUiColourRefs(ui, config.palette);
        if (nextUi.linkSegmentHeights && config.params.segments.innerHeight !== config.params.segments.outerHeight)
          nextUi = { ...nextUi, linkSegmentHeights: false };
        set({ config, ui: nextUi });
      };

      const actions: LampActions = {
        setParam(path, value) {
          const spec = PARAM_SPEC_BY_PATH.get(path);
          if (!spec || !Number.isFinite(value)) return;
          const { config, ui } = get();
          let p = setParamValue(config.params, path, roundToPrecision(value, spec.precision));
          const other = HEIGHT_PAIR[path];
          if (other && ui.linkSegmentHeights) p = setParamValue(p, other, getParam(p, path));
          if (path.startsWith('printer.bed') && p.printer.preset !== 'custom') {
            const [x, y, z] = PRINTER_PRESETS[p.printer.preset].bed;
            if (p.printer.bedX !== x || p.printer.bedY !== y || p.printer.bedZ !== z)
              p = { ...p, printer: { ...p.printer, preset: 'custom' } };
          }
          setParams(p);
        },
        setEnum(path, value) {
          if (path === 'core.kind') return actions.applyCorePreset(value as CoreKind);
          if (path === 'printer.preset') return actions.applyPrinterPreset(value as PrinterId);
          setParams(withEnumParam(get().config.params, path, value));
        },
        applyCorePreset(kind) {
          const preset = CORE_PRESETS[kind];
          if (!preset) return;
          const p = get().config.params;
          const d = defaultParams();
          // An LED tube carries no strip, and its boss leaves no room for the inner air slits
          // (they would be dropped with a warning), so both go to 0 like the built-in LED-tube
          // preset. Back on the rod, zeros return to the defaults.
          const tube = kind === 'led-tube';
          const stripBuildUp = tube ? 0 : p.core.stripBuildUp === 0 ? d.core.stripBuildUp : p.core.stripBuildUp;
          const innerSlits = tube ? 0 : p.cover.innerSlits === 0 ? d.cover.innerSlits : p.cover.innerSlits;
          setParams({
            ...p,
            core: { ...p.core, kind, diameter: preset.diameter, stripBuildUp },
            cover: { ...p.cover, innerSlits },
          });
        },
        applyPrinterPreset(id) {
          const preset = PRINTER_PRESETS[id];
          if (!preset) return;
          const p = get().config.params;
          if (id === 'custom') return setParams({ ...p, printer: { ...p.printer, preset: 'custom' } });
          const [bedX, bedY, bedZ] = preset.bed;
          setParams({ ...p, printer: { preset: id, bedX, bedY, bedZ } });
        },
        setHeightMode(mode) {
          setParams(withEnumParam(get().config.params, 'segments.heightMode', mode));
        },
        paintBand(stack, index, colourId) {
          const s = get();
          const n = selectDims(s)[stack].count;
          setConfig(paintBandPure(s.config, stack, index, colourId ?? s.ui.brush, n));
        },
        applyGenerator(kind) {
          const s = get();
          const { config, ui } = s;
          const known = new Set(config.palette.map((c) => c.id));
          const colours = ui.mix.filter((id) => known.has(id));
          if (colours.length === 0) {
            notify('error', 'Pick at least one colour for the mix first.');
            return;
          }
          const dims = selectDims(s);
          const specs = specsForTarget(kind, colours, ui.genTarget, freshSeed(random));
          const bands = { ...config.bands };
          const gen = { ...config.gen };
          for (const stack of STACKS) {
            const spec = specs[stack];
            if (!spec) continue;
            gen[stack] = spec;
            bands[stack] = generateBands(spec, dims[stack].count);
          }
          setConfig({ ...config, bands, gen });
        },
        mirror() {
          const s = get();
          const { config, ui } = s;
          const dims = selectDims(s);
          const targets: readonly Stack[] = ui.genTarget === 'both' ? STACKS : [ui.genTarget];
          const genTargets = targets.filter((t) => config.gen[t]);
          const mirrored = !(genTargets.length > 0 && genTargets.every((t) => config.gen[t]!.mirrored));
          const bands = { ...config.bands };
          const gen = { ...config.gen };
          let changed = false;
          for (const stack of targets) {
            const n = dims[stack].count;
            const g = config.gen[stack];
            if (g) {
              const spec = normalizeSpec({ ...g, mirrored });
              gen[stack] = spec;
              bands[stack] = generateBands(spec, n);
              changed = true;
            } else {
              const stored = config.bands[stack];
              const fitted = fitBands(stored, n, config.palette, null);
              const m = mirrorBands(fitted, n);
              if (m.some((id, i) => id !== fitted[i])) {
                bands[stack] = [...m, ...stored.slice(n)];
                changed = true;
              }
            }
          }
          if (changed) setConfig({ ...config, bands, gen });
        },
        setBrush(id) {
          const { config, ui } = get();
          if (ui.brush !== id && config.palette.some((c) => c.id === id)) set({ ui: { ...ui, brush: id } });
        },
        toggleMix(id) {
          const { config, ui } = get();
          if (!config.palette.some((c) => c.id === id)) return;
          const inMix = new Set(ui.mix);
          if (inMix.has(id)) inMix.delete(id);
          else inMix.add(id);
          set({ ui: { ...ui, mix: config.palette.map((c) => c.id).filter((x) => inMix.has(x)) } });
        },
        addColour(colour) {
          const { config } = get();
          if (config.palette.length >= MAX_COLOURS) {
            notify('error', `The palette holds at most ${MAX_COLOURS} colours.`);
            return null;
          }
          const id = nextCustomId(config.palette);
          const entry: PetgColour = {
            id,
            name: sanitizeColourName(colour?.name ?? '', `Custom ${id.slice(1)}`),
            hex: normalizeHex(colour?.hex ?? '') ?? '#ffffff',
          };
          setConfig({ ...config, palette: [...config.palette, entry] });
          return id;
        },
        updateColour(id, patch) {
          const { config } = get();
          const i = config.palette.findIndex((c) => c.id === id);
          if (i < 0) return;
          const cur = config.palette[i]!;
          const name = patch.name !== undefined ? sanitizeColourName(patch.name, cur.name) : cur.name;
          const hex = patch.hex !== undefined ? (normalizeHex(patch.hex) ?? cur.hex) : cur.hex;
          if (name === cur.name && hex === cur.hex) return;
          const palette = [...config.palette];
          palette[i] = { ...cur, name, hex };
          setConfig({ ...config, palette });
        },
        removeColour(id, replacement) {
          const { config, ui } = get();
          if (!config.palette.some((c) => c.id === id)) return;
          if (config.palette.length <= 1) {
            notify('error', 'The palette needs at least one colour.');
            return;
          }
          const palette = config.palette.filter((c) => c.id !== id);
          const repl =
            replacement !== undefined && replacement !== id && palette.some((c) => c.id === replacement)
              ? replacement
              : palette[0]!.id;
          const gen = { ...config.gen };
          for (const stack of STACKS) {
            const g = config.gen[stack];
            if (g) gen[stack] = normalizeSpec({ ...g, colours: uniqueColours(replaceColour(g.colours, id, repl)) });
          }
          set({
            config: {
              ...config,
              palette,
              bands: { inner: replaceColour(config.bands.inner, id, repl), outer: replaceColour(config.bands.outer, id, repl) },
              gen,
            },
            ui: fixUiColourRefs({ ...ui, brush: ui.brush === id ? repl : ui.brush, mix: ui.mix.filter((x) => x !== id) }, palette),
          });
        },
        resetPalette() {
          const { config, ui } = get();
          const palette = defaultPalette();
          const known = new Set(palette.map((c) => c.id));
          const fallback = palette[0]!.id;
          const fix = (ids: readonly string[]) => ids.map((x) => (known.has(x) ? x : fallback));
          const gen = { ...config.gen };
          for (const stack of STACKS) {
            const g: GeneratorSpec | null = config.gen[stack];
            if (g) gen[stack] = normalizeSpec({ ...g, colours: uniqueColours(fix(g.colours)) });
          }
          set({
            config: { ...config, palette, bands: { inner: fix(config.bands.inner), outer: fix(config.bands.outer) }, gen },
            ui: fixUiColourRefs(ui, palette),
          });
        },
        setUi(patch) {
          const { ui, config } = get();
          const next = fixUiColourRefs({ ...ui, ...patch }, config.palette);
          if ((Object.keys(next) as (keyof UiPrefs)[]).every((k) => next[k] === ui[k])) return;
          set({ ui: next });
          if (next.linkSegmentHeights && !ui.linkSegmentHeights) {
            const p = get().config.params;
            setParams(setParamValue(p, 'segments.innerHeight', p.segments.outerHeight));
          }
        },
        loadConfig,
        resetAll() {
          const { ui } = get();
          const d = defaultUiPrefs();
          loadConfig(defaultConfig(), 'reset');
          set({ ui: { ...d, viewMode: ui.viewMode, glow: ui.glow, exportFormat: ui.exportFormat, tuningOpen: ui.tuningOpen } });
          notify('info', 'Reset to the default lamp.');
        },
        savePreset(name) {
          const clean = cleanPresetName(name);
          if (!clean) {
            notify('error', 'Give the preset a name.');
            return false;
          }
          const s = get();
          const code = encodeConfig(s.config, selectCounts(s));
          storeSaved(upsertPreset(s.saved, { name: clean, code, savedAt: new Date().toISOString() }));
          notify('info', `Saved preset “${clean}”.`);
          return true;
        },
        deletePreset(name) {
          const clean = cleanPresetName(name);
          const { saved } = get();
          if (saved.some((p) => p.name === clean)) storeSaved(saved.filter((p) => p.name !== clean));
        },
        loadPreset(idOrName) {
          const found = findPreset(idOrName, get().saved);
          const decoded = found ? decodeConfig(found.code) : null;
          if (!found || !decoded) {
            notify('error', `Preset “${idOrName}” could not be loaded.`);
            return false;
          }
          loadConfig(decoded.config, 'preset');
          notify('info', [`Loaded “${found.name}”.`, ...decoded.issues].join(' '));
          return true;
        },
        notify,
        dismissNotice(id) {
          const n = get().notice;
          if (n && (id === undefined || n.id === id)) set({ notice: null });
        },
        setEngine(engine) {
          set({ engine });
        },
        setPreview(patch) {
          set({ preview: { ...get().preview, ...patch } });
        },
        setExportJob(job) {
          set({ exportJob: job });
        },
      };

      return { ...initialLampData(init), actions };
    }),
  );
  // A finished (or failed) export describes the previous lamp: clear it when the config changes.
  store.subscribe(
    (s) => s.config,
    () => {
      const { exportJob, actions } = store.getState();
      if (exportJob.phase === 'done' || exportJob.phase === 'error') actions.setExportJob({ phase: 'idle' });
    },
  );
  return store;
}

export type LampStore = ReturnType<typeof createLampStore>;

/** The app singleton. Starts with the default lamp; bootstrapLamp() loads the hash/storage state into it. */
export const lampStore: LampStore = createLampStore();

/** Reset the singleton's data (keeps its actions). For tests and hot reload. */
export function resetLampStore(init: LampStoreInit = {}, store: LampStore = lampStore): void {
  store.setState(initialLampData(init));
}
