# Geometry contract

`types.ts` is frozen. The engine (B) and the app (C1/C2/C3) compile against it; changes go through the orchestrator and are logged below.

## Semantics
- Units mm, z-up, lamp axis = z, floor at z = 0.
- Every `PartMesh` is in its **print frame**: centred on the origin, bed at z = 0, as it should be sliced. `DerivedDims.placements[id]` holds one column-major 4×4 per copy mapping print frame → world (assembled lamp). The cover is printed plate-down and flipped by its placement. `fit-test` has no placements.
- Band index 0 = bottom segment. `ColourPlan.inner/outer` are already fitted to `inner.count` / `outer.count`.
- `deriveDims(params)` is synchronous, pure TypeScript, < 1 ms, **never throws**: invalid combinations become `messages` with severity `error` and `ok = false`. It runs on the main thread on every edit; the worker re-derives from `params` itself.
- `defaultParams()` returns a fresh object. `PARAM_META` lists every `NumericParamPath` exactly once with label/unit/range/step/precision/group/advanced.
- `partsKey(params)` is a string that changes only when a mesh would change (printer preset alone does not).
- `computeBom(parts, dims, plan)` is pure (density 1.27 g/cm³, 1.75 mm filament).
- `createGeometryClient()` spawns the worker; `buildParts(p, 'preview')` coalesces newest-wins (a superseded call rejects with an error whose `name` is `'SupersededError'`, which the UI ignores); `exportZip` runs FIFO; downloads always use export quality.
- ZIP entries: `base.3mf`, `inner-segment.3mf`, `outer-segment.3mf`, `top-cover.3mf`, optional `fit-test.3mf` (or `.stl` for all when format is `stl`), `PRINT-PLAN.md`, `ASSEMBLY.md`, `config.json`. Nothing else.
- `config.json` contains `{ app: 'stacklamp', schema: 1, generated, shareUrl, params, derived: {…key numbers} }` and round-trips through `parseConfig`.
- Performance budgets: preview build of all parts ≤ 500 ms, export-quality base ≤ 2 s (M-series laptop). Preview revolves use 128 circular segments; export ≥ 192.
- `src/geometry` and `src/export` must not touch DOM or Node globals (they run in the worker, in Node tests and in a future CLI). Only `src/worker/geometry.worker.ts` imports the wasm URL.

## Changelog
- 2026-10-22 v1 frozen by the orchestrator.
