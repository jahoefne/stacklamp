# stacklamp

**A floor lamp you print yourself.** A metal core wrapped in an LED strip stands in a printed base; around it, two stacks of identical translucent PETG tube segments. Print each band in a different colour and the lamp glows in colour zones along its height.

**Configure and download: https://jahoefne.github.io/stacklamp/**

Everything runs in your browser: the geometry is generated with [Manifold](https://github.com/elalish/manifold) (WASM), previewed with three.js, and written out as 3MF or STL. No backend, no account; your lamp lives in the URL, so a link is a saved design.

## What you get

One ZIP with:

| File | What it is | Print |
|---|---|---|
| `base.3mf` | Round base with a hidden pocket for a dumbbell plate (weight) and a boss through the plate's bore, a collar with three screw holes for the rod, hidden air intakes and an internal cable channel | normal mode, 4 walls, 20 % infill, tree supports on build plate only (for the pocket ceiling) |
| `outer-segment.3mf` | One outer tube segment (print N copies in your colour order) | spiral vase, one line as wide as the segment wall (0.8 mm on the default 0.6 mm nozzle), 0 top/bottom layers |
| `inner-segment.3mf` | One inner tube segment (print N copies) | same |
| `top-cover.3mf` | Slitted cover; captures the inner tube and the rod end | normal mode, printed plate down, no supports |
| `plate-clamp.3mf` | Small disc that clamps the dumbbell plate onto the base's boss with one wood screw | normal mode, 100 % infill, no supports |
| `fit-test.3mf` (optional) | Two short rings to check the joint clearance before printing 22 segments | spiral vase |
| `PRINT-PLAN.md` | How many of each segment in which colour, slicer settings, material estimate | |
| `ASSEMBLY.md` | Hardware list, assembly steps, safety notes | |
| `config.json` | The full configuration, including a share URL | |

Slicers ignore colours stored in 3MF files; the print plan carries the colour counts.

## How the lamp works

- **Core.** A 20 mm aluminium tube (default 1500 mm) sits 50 mm deep in the base collar, fixed with three M4 set screws or hot glue. An LED strip is wrapped around it. Alternatively a single-ended LED tube (Ø 28 mm) replaces the rod.
- **Segments.** Each segment has a straight 20 mm socket at the bottom that slides over the segment below and seats on an internal shoulder, so the stack height is exact and no glue is needed (glue is optional). The top rim has a small lead-in. Printed socket-down in vase mode, the outer contour only moves inward going up, so there are no overhangs. Pick your nozzle (0.4, 0.6 or 0.8 mm) under *Base & printer*: the wall width, the layer heights and the slicer settings in the print plan follow it.
- **Height fit.** You enter the rod length; the app picks the number of segments and nudges the segment height (within ±10 % of your target) so the stack and the cover meet the rod end exactly. Or lock the segment height and the app tells you where to cut the rod.
- **Base.** A 240 mm puck with an underside pocket for a Ø 155 × 25 mm plate (30 mm bore) that keeps the lamp from tipping. A Ø 27 mm boss hangs from the pocket ceiling through the plate's bore; a printed Ø 50 mm clamp under the plate, pulled onto the boss by one 4 × 25 mm wood screw, holds the plate in when the lamp is lifted and sits 1 mm inside the pocket so the base still stands on its rim. Two spigot rings seat the bottom segments exactly like another segment would. The LED feed wire drops through a hole beside the collar into a teardrop tunnel that exits at the side.
- **Cover.** Slides over the top outer segment, captures the inner tube, and holds the rod end in a boss on its underside. Radial slits let the heat out; hidden intakes under the base rings let air in.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173/stacklamp/
npm test             # vitest: engine (Node + WASM), state, preview, UI
npm run build        # tsc -b && vite build
npm run size         # gzip budget for dist/assets
npm run gen:samples  # writes sample ZIPs for several configurations to out/
npm run slice        # headless Bambu Studio slice of everything in out/ (macOS, Bambu Studio installed)
```

### Architecture

```
src/geometry   parameters, height solver, revolved profiles, Manifold builders, derived dimensions (pure TS + WASM)
src/export     binary STL, minimal 3MF, PRINT-PLAN / ASSEMBLY / config.json, ZIP bundle (fflate)
src/worker     geometry worker (the only place the WASM is loaded), handler with a mesh cache, coalescing client
src/state      zustand store, URL-hash codec, localStorage mirror, presets, colour generators, services
src/preview    three.js scene: additive glow bands, dark stage, view modes, WebGL fallback
src/ui         design tokens (DESIGN.md), primitives, configurator sections, illustrations
src/app        page shell and wiring
tests/unit     engine tests (golden solver values, interference checks, manifoldness, export round-trips)
tests/acceptance  sample generation for the slice check
```

`src/geometry/types.ts` is the contract between the engine and the app; `src/geometry/contract.md` explains it. The app imports geometry only through `src/geometry/index.ts`.

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Safety

LED strips: use a low-voltage (12 V / 24 V) power supply only. The LED-tube option is mains-powered: have the wiring done by a qualified person. PETG softens around 80 °C; keep the cover slits clear. Put the dumbbell plate in and clamp it; a 1.5 m lamp without the weight tips over.

## Licence

MIT, see `LICENSE`. The design system is described in `DESIGN.md`.
