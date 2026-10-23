# src/state — app state for the UI

Import everything from `src/state` (the `index.ts` barrel). Geometry types (`LampParams`,
`DerivedDims`, `Message`, `PartMesh`, `Bom`, …) come from `src/geometry`.

## Wiring (main.tsx)

```ts
import { bootstrapLamp } from './state';
bootstrapLamp();            // BEFORE createRoot().render: loads #hash → localStorage → defaults,
                            // starts URL/localStorage sync, the engine and the preview scheduler,
                            // installs window.__stacklamp. Idempotent; returns { source, issues, client, teardown }.
```

## Reading state

`useLamp(selector)` subscribes to the singleton `lampStore`. Pass a selector from the list
below (or an inline one that returns a primitive or an existing reference). Every exported
selector is memoised and returns the same reference until its inputs change, as zustand 5
requires.

| Selector | Returns |
|---|---|
| `selectDims` / `useDims()` | `DerivedDims` of the current params (N, heights, messages, fit…) |
| `selectMessages` | all `Message`s; `useFieldMessages(path)` gives those with `m.path === path` |
| `selectCounts` | `{ nInner, nOuter }` |
| `selectFittedBands` | `{ inner, outer }` colour ids fitted to N, index 0 = bottom |
| `selectColourPlan` | `ColourPlan` (palette + fitted bands), what the export uses |
| `selectUsage` | `Record<colourId, { inner, outer, total }>` (every palette id) |
| `selectBom` | `Bom` for the parts in the preview, or `null` before the first build |
| `selectPreviewDims` | dims of `preview.params` (the parts' params) |
| `selectPreviewStale` | true while the shown parts do not match the current geometry |
| `selectBlockers` | `readonly string[]`: why the download is blocked (engine loading or error, then error messages) |
| `selectCanDownload` | no blockers and no export running |
| `selectCode` / `selectShareUrl` | `v=1&…` / full share URL for the copy-link button |

Raw slices: `s.config` (`params`, `palette`, `bands`, `gen`), `s.ui` (`UiPrefs`), `s.saved`,
`s.engine.status` (`loading | ready | error`), `s.preview` (`status idle | building | error`,
`parts`, `params`, `buildMs`, `error`), `s.exportJob` (`idle | running {stage, done, total} |
done {fileName} | error {message}`), `s.notice` (`{ id, kind: info|error, text }`, for the Toast).

`useParam(path)` → `{ value, spec, set }`. `spec` is `PARAM_META` plus the URL `key`
(label, unit, min/max/step/precision, group, advanced, hint). `segments.maxDeviation` is a
**fraction** (0.10 = 10 %) even though its unit is `'%'`. Show it × 100.

## Changing state

`const a = useLampActions()` (a stable object):

- Params: `setParam(path, v)` (rounds to precision, clamps; linked segment heights; editing a
  bed size switches the printer to `custom`), `setEnum(path, v)`, `applyCorePreset(kind)`,
  `applyPrinterPreset(id)`, `applyNozzle(id)` (`'0.4' | '0.6' | '0.8'`; also sets
  `segments.wall` to the nozzle's vase line width from `NOZZLES`), `setHeightMode(mode)`.
- Colours: `paintBand(stack, index, colourId = ui.brush)` (clears that stack's generator; a
  repeated paint of the same colour does nothing, so drag-paint can call it freely),
  `applyGenerator('alternate' | 'gradient' | 'random')` (uses `ui.mix` on `ui.genTarget`),
  `mirror()` (toggles `mirrored` on generator stacks, reflects painted stacks),
  `setBrush(id)`, `toggleMix(id)`, `addColour({name?, hex?})` → id or null (max 16),
  `updateColour(id, {name?, hex?})`, `removeColour(id, replacement?)`, `resetPalette()`.
- UI: `setUi(patch)` for `viewMode`, `exportFormat`, `includeFitTest`, `linkSegmentHeights`
  (turning it on sets inner = outer), `genTarget`, `tuningOpen`, `glow`.
- Lamp: `resetAll()`, `savePreset(name)` → bool, `deletePreset(name)`, `loadPreset(idOrName)`
  → bool (built-ins: `BUILTIN_PRESETS`, saved: `s.saved`), `loadConfig(config, source)`.
- Notices: `notify(kind, text)`, `dismissNotice(id?)`.

Download: `download()` (export + save the ZIP, progress in `s.exportJob`), `cancelDownload()`.
A finished or failed `exportJob` resets to `idle` when the config changes.

## Colour model

- `config.bands[stack]` is the stored list and may be longer or shorter than N. Never render
  it directly; use `selectFittedBands`. Bands past N survive N changes.
- `config.gen[stack]` (a `GeneratorSpec`) makes a stack regenerate for any N. Painting clears it.
- The palette (`DEFAULT_PALETTE`, ids `clr smk amb org red vio blu tea grn`) is user-editable;
  custom ids are `c1, c2, …`. `ui.mix` is kept in palette order.

## URL format

`#v=1&<key>=<value>…` with only non-default values, so the default lamp is `#v=1`. Numeric keys:
`NUMERIC_URL_KEYS` (paramSpec.ts), e.g. `rl` rod length, `oo` outer OD, `ih`/`oh` segment
heights. Enums: `cp hm wr pp nz`. Colours: `pal`, `bi`/`bo` (bands), `gi`/`go` (generators).
Forms: `fi`/`fo`, one `FORMS[id].code` per band fitted to N (`fo=bwbwb`), only when the stack is
not all straight; the form diameters and maximum overhang are the numeric keys `ifd`/`ofd`/`mo`. Keys
are never renamed. `decodeConfig` never throws, and its `issues` explain anything it clamped or
ignored. On load and on a pasted link they appear as an info notice.

## Debug

`window.__stacklamp = { getState, buildCount, exportCount, engine, store }`. `buildCount`
counts worker `buildParts` calls, so colour edits must not raise it.
