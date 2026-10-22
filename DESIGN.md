# stacklamp design

The design system for the stacklamp page: one light paper page with a dark 3D stage set into it.
Tokens live in [`src/ui/styles/tokens.css`](src/ui/styles/tokens.css), fonts in
[`src/ui/styles/fonts.css`](src/ui/styles/fonts.css), drawings and icons in
[`src/ui/illustrations/`](src/ui/illustrations). A living specimen of every token and component
state is at `design/specimen.html` (run `npx vite --port 5180`, open
`http://localhost:5180/stacklamp/design/specimen.html`; it is not part of the build).

---

## 1. Direction

### Three candidates

| | Direction | Idea | Verdict |
|---|---|---|---|
| A | **Studio Glass** | Warm paper, ink-black type and rules, and colour that arrives only as flat bands, the same bands the lamp is made of. Stained-glass "leading" lines, circles for colour, squares for everything else. Futura-lineage display type. | **Chosen** |
| B | Poster Bauhaus | Strict red/yellow/blue/black, triangles-circles-squares as decoration, ultra-wide display type. | Too generic and too cold. Fixed primaries fight the nine PETG colours, and the decoration has nothing to do with the product. |
| C | Catalogue '74 | Cream, brown and burnt orange, rounded soft display type, supergraphic stripes. | Nostalgia without the precision. Rounded type is weak for millimetre values, and brown looks muddy next to a glowing stage. |

### Studio Glass

The page works like the lamp. A calm, warm paper ground and ink-black geometry carry the structure.
Colour is kept for the things that are colour: the PETG bands, the palette, and a few flat Bauhaus
blocks that echo them (a stripe under the header, numbered section squares, the hero's halo).
Interactive things look like printed objects lifted off the page: square, 2 px ink outlines and a
solid offset shadow that sinks when pressed. Colour is always round (a swatch is the tube seen from
above) and a band is always a rectangle (the tube seen from the side). The 3D stage is the only dark
surface on the page, a gallery box where the lamp glows. Type pairs Jost (geometric, Futura lineage)
set black and tight for display with Space Grotesk for interface text and numbers, which are always
tabular because the page is full of millimetres.

**Keywords:** warm paper · stacked colour bands · ink-line geometry · glow in a dark box · precise numbers

| Do | Don't |
|---|---|
| Use colour as flat, opaque blocks and bands with hard edges. | Gradients on UI chrome, glassmorphism, blur, soft drop shadows. |
| Use 2 px ink lines for structure: rules, field borders, the stage box. | Grey hairline "cards" floating on grey. |
| Keep corners square. Round only colour (swatches), status pills, icon buttons, toggles. | Medium radii (6–16 px) anywhere. |
| Give actions a solid offset shadow, and sink it on press. | Hover glows, scale-ups on buttons. |
| Set display text in Jost Black, tight, short (two to five words). | Long display headlines, centred paragraphs. |
| Set every number tabular with its unit (`1500 mm`, `11 ×`, `≈ 98 g`). | Bare numbers, proportional figures in tables. |
| Let the PETG palette own the saturated colours inside the configurator. | Blocks (`--block-*`) inside the colour planner, where they would look like palette colours. |
| Keep the stage dark in every context, including the fallback. | A light 3D stage or a paper-coloured canvas. |

---

## 2. Colour tokens

All colours are custom properties in `tokens.css`. Only `tokens.css`, the illustrations, the favicon
and this file contain raw hex values. Tints are made with `color-mix(in srgb, var(--x) N%, transparent)`.

| Token | Hex | Use |
|---|---|---|
| `--color-paper` | `#F4EEE1` | page ground, field fill |
| `--color-paper-2` | `#E8DFCC` | insets, hover fill, table stripes, unit chips |
| `--color-ink` | `#1B1814` | text, rules, borders of interactive things, offset shadows |
| `--color-ink-2` | `#4F483F` | secondary text, hints, units, table heads |
| `--color-ink-3` | `#7B7166` | disabled text and icons only |
| `--color-line` | `#82776A` | hairlines and dividers (3:1, so also valid as a boundary) |
| `--color-inverse` / `--color-inverse-ink` | `#1B1814` / `#F4EEE1` | dark surfaces: toast, mobile mini-bar, footer |
| `--color-accent` / `--color-accent-ink` | `#B83217` / `#FFF8EC` | vermilion: primary action, active marks, progress |
| `--color-focus` | `#2E62F0` | focus outline, everywhere |
| `--color-danger` | `#A3153F` | crimson: errors (deliberately a different red from the accent) |
| `--color-warning` | `#855000` | dark amber: warnings as text/icon |
| `--color-ok` | `#1B6A40` | green: success |
| `--color-scrim` | ink at 55 % | overlay behind "Tap to rotate" |
| `--color-selection` | `#F2AE1C` | `::selection` background with ink text |
| `--block-1` … `--block-6` | `#F2AE1C` `#EE6A2A` `#C23224` `#6A47BE` `#2652C2` `#0E7570` | mustard, tangerine, signal red, violet, cobalt, teal: decorative flats |

Block usage: the 8 px **band rule** (six blocks side by side) under the header and between hero and
configurator; the 36 px **section number squares** in the panel (01 mustard, 02 tangerine, 03 red,
04 violet, 05 cobalt; 06 teal if a sixth section appears); hover fill of secondary buttons
and icon buttons (mustard); the toast's offset shadow (mustard, signal red for errors). Text on blocks:
ink on 1 and 2, paper on 3 to 6.

### Contrast (WCAG 2.2, computed from the token values)

| Foreground | Background | Ratio | Use |
|---|---|---|---|
| `--color-ink` | `--color-paper` | 15.30 | body text |
| `--color-ink` | `--color-paper-2` | 13.36 | text on insets |
| `--color-ink-2` | `--color-paper` | 7.79 | secondary text, units |
| `--color-ink-2` | `--color-paper-2` | 6.80 | hints on insets |
| `--color-line` | `--color-paper` | 3.79 | field/divider boundary (non-text 3:1) |
| `--color-line` | `--color-paper-2` | 3.31 | boundary on insets |
| `--color-inverse-ink` | `--color-inverse` | 15.30 | toast, mini-bar |
| `--color-accent-ink` | `--color-accent` | 5.67 | primary button label |
| `--color-accent` | `--color-paper` | 5.18 | accent text |
| `--color-accent` | `--color-paper-2` | 4.52 | accent text on insets |
| `--color-focus` | `--color-paper` | 4.41 | focus outline (needs 3:1) |
| `--color-focus` | `--color-paper-2` | 3.85 | focus outline |
| `--color-focus` | `--color-ink` | 3.47 | focus outline on ink surfaces |
| `--color-focus` | `--stage-bg` | 3.74 | focus outline on the stage |
| `--color-danger` | `--color-paper` | 6.64 | error text; paper on danger fill is the same 6.64 |
| `--color-warning` | `--color-paper` | 5.78 | warning text (5.04 on paper-2) |
| `--color-ok` | `--color-paper` | 5.71 | success text (4.98 on paper-2) |
| `--color-ink` | `--block-1` / `--block-2` | 9.14 / 5.67 | text on mustard / tangerine |
| `--color-paper` | `--block-3` … `--block-6` | 4.81 / 5.58 / 5.92 / 4.78 | text on red / violet / cobalt / teal |
| `--stage-ink` | `--stage-bg` | 16.50 | text and icons on the stage |
| `--color-ink-3` | `--color-paper` | 4.13 | disabled only (WCAG-exempt) |

`--stage-line` (`#4A433C`, 1.96:1 on the stage) is decorative: every control on the stage is also
identified by its label or icon in `--stage-ink`.

---

## 3. PETG palette

The default palette for the colour planner. Ids and order are fixed; names and hexes are editable
by the user. Each hex is tuned to read as a saturated swatch on paper and as emitted light on the
dark stage (luminance roughly tracks how much light the real filament lets through: Clear brightest,
Smoke dimmest). Every colour except Smoke reaches 4.5:1 with ink, so a label on a band tile uses
the "Label" column.

| # | id | Name | Hex | Token | Label on it | Ink / paper / stage contrast | Notes |
|---|---|---|---|---|---|---|---|
| 0 | `clr` | Clear | `#FFF4DC` | `--petg-clr` | ink | 16.19 / 1.06 / 17.46 | warm near-white, the brightest glow; needs its ink outline on paper |
| 1 | `smk` | Smoke | `#6B625A` | `--petg-smk` | paper | 2.96 / 5.16 / 3.20 | dims the light, reads as smoked glass |
| 2 | `amb` | Amber | `#FFA41B` | `--petg-amb` | ink | 8.91 / 1.72 / 9.61 | the house colour |
| 3 | `org` | Orange | `#FF6A1F` | `--petg-org` | ink | 6.18 / 2.48 / 6.66 | |
| 4 | `red` | Red | `#F2363F` | `--petg-red` | ink | 4.53 / 3.38 / 4.88 | leans crimson so it stays apart from Orange |
| 5 | `vio` | Violet | `#9E5FFF` | `--petg-vio` | ink | 4.66 / 3.28 / 5.03 | lifted so it still glows |
| 6 | `blu` | Blue | `#3D7BFF` | `--petg-blu` | ink | 4.61 / 3.32 / 4.97 | lifted so it still glows |
| 7 | `tea` | Teal | `#00B3A6` | `--petg-tea` | ink | 6.74 / 2.27 / 7.27 | |
| 8 | `grn` | Green | `#33C24D` | `--petg-grn` | ink | 7.55 / 2.03 / 8.14 | |

### Default colour plan ("Sunset")

- **Outer:** gradient Amber → Orange → Red, bottom to top, in equal blocks, with the remainder going to the lower stops
  (band `i` of `N` takes stop `floor(i · 3 / N)`). At the default 11 bands:
  `amb amb amb amb org org org org red red red`.
- **Inner:** all Clear (`clr` × N). The clear inner stack keeps the core bright white, and the
  outer stack does the colouring.
- Why: a warm, flame-like column (hot at the floor, deep at the top) that looks good in any room
  and shows the concept at a glance. It is also what the hero illustration and the favicon draw.

Good second presets for the preset menu: "Ice" (outer `blu`→`tea`, inner `clr`), "Bauhaus"
(outer alternate `red`/`amb`/`blu`, inner `clr`), "Night" (outer `smk`, inner `amb`).

---

## 4. Typography

Two OFL families, self-hosted, latin subset, variable weight (`src/ui/fonts/`, 48.9 KB total):

| Role | Family | Weights | Token |
|---|---|---|---|
| Display: hero, section titles, section numbers, big readouts | **Jost** (Futura lineage) | 100–900 (use 700/800/900) | `--font-display` |
| Body: UI, labels, tables, numbers | **Space Grotesk** | 300–700 (use 400/500/700) | `--font-body` |
| Code: share URL, file names, hex inputs | system mono stack | | `--font-mono` |

Both families have `tnum`. Every number the user reads or edits uses
`font-variant-numeric: tabular-nums` (inputs, tables, height summary, pills, progress text).

### Scale (fluid between 360 px and 1280 px viewport)

| Token | Size | Family / weight / line-height | Use |
|---|---|---|---|
| `--fs-display` | 44 → 104 px | Jost 900, `--lh-tight` 0.95, `--tracking-display` −0.02em | hero headline only |
| `--fs-2xl` | 28 → 44 px | Jost 900, 0.95–1.05 | page-level headings ("Configure your lamp") |
| `--fs-xl` | 22 → 28 px | Jost 700, `--lh-snug` 1.15 | panel section titles, big height readout |
| `--fs-lg` | 18 → 20 px | Space Grotesk 400/500, 1.4 | hero lines, lead text, wide button |
| `--fs-md` | 15 → 16 px | Space Grotesk 400, `--lh-body` 1.5 | body, inputs, buttons |
| `--fs-sm` | 13 → 14 px | Space Grotesk 500/700 | field labels (700), pills, table cells, warnings |
| `--fs-xs` | 12 → 13 px | Space Grotesk 400/700 | hints, units, micro labels |

**Micro label** (eyebrows, table heads, column heads "OUTER · 11"): `--fs-xs`, `--fw-bold`,
uppercase, `--tracking-label` 0.08em, `--color-ink-2`. Field labels are sentence case, never uppercase.
Display text is lowercase-friendly: the wordmark is `stacklamp` in Jost 800.

Glyph coverage: the latin subsets include `× Ø ° ± · – —` and `€`, so dimensions like
`Ø 200 · 11 × 154.5 mm` render in the brand fonts. `≈ → ≤ ≥` are not included and fall back to the
system font: use icons for arrows, write "max 246 mm" rather than "≤ 246 mm", and `≈` only in
mass estimates where the fallback glyph is fine.

---

## 5. Spacing

4 px base, `rem` values (16 px root).

| `--space-1` | `-2` | `-3` | `-4` | `-5` | `-6` | `-7` | `-8` | `-9` | `-10` |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96 | 128 |

Rhythm: inside a control 8–12; between a label and its control 4; between fields 16 (24 between field
groups); panel section padding 16 top / 24 bottom; between panel sections 0 (the 2 px rule separates
them); hero vertical padding 64 (mobile) / 96 (desktop); page side gutter `--layout-gutter` 16 → 32.

---

## 6. Layout

| Token | Value | |
|---|---|---|
| `--layout-max` | 1440 px | outer page width, centred |
| `--layout-gutter` | 16 → 32 px | side padding |
| `--panel-width` | `clamp(380px, 34vw, 460px)` | controls column at ≥ 960 px |
| `--preview-min-h` | `56svh` | mobile preview height |
| `--header-h` | 56 px | top bar |
| `--minibar-h` | 64 px | mobile sticky bottom bar |
| `--target-min` | 44 px | minimum target on coarse pointers (and default control height) |

Breakpoints (literal, custom properties do not work in media queries):

- `< 600`: phone. Single column, full-bleed preview (`--preview-min-h`), sticky mini-bar.
- `600–959`: tablet. Single column, preview 60svh with gutters, panel max 640 px centred, mini-bar stays.
- `≥ 960`: two columns: `grid-template-columns: minmax(0, 1fr) var(--panel-width); gap: var(--space-6)`.
  The preview is `position: sticky; top: var(--space-4); height: calc(100svh - 2 * var(--space-4)); min-height: 560px`.
  The mini-bar disappears (the download panel is in reach).
- `≥ 1280`: gaps grow to `--space-7`, the hero's display size reaches its maximum.

Hero grid: ≥ 960 `7fr 5fr` (copy left, illustration right, vertically centred); below, the
illustration sits under the copy at `min(100%, 360px)` wide.

### Desktop wireframe (≥ 960)

```
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  band rule 8px
 ▣ stacklamp                                          How it works   GitHub ↗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  2px ink rule
                                                      ┌───────────────────────┐
 A FLOOR LAMP YOU PRINT YOURSELF                      │      ▒▒▒▒██████▒▒▒▒    │
                                                      │   ▒▒▒▒▒▒██████▒▒▒▒▒▒   │
 Light,                                               │ ▒▒▒▒▒▒▒▒██████▒▒▒▒▒▒▒▒ │  StackIllustration
 stacked.                                             │ ▒▒▒▒▒▒▒▒██████▒▒▒▒▒▒▒▒ │  variant="hero"
                                                      │   ▒▒▒▒▒▒██████▒▒▒▒▒▒   │  animate
 ■ A metal core. A ribbon of light. Rings of …        │      ▒▒▒▒██████▒▒▒▒    │
 ● Stack printed tubes in any colour order …          │        ▄▄██████▄▄      │
 ▲ Set the height, pick the colours, download …       │  ─────────────────────  │
                                                      └───────────────────────┘
 [ Configure your lamp ]▖
  1.5 m tall by default · 4 printable parts · open source (MIT)

▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  band rule
 Configure your lamp                       (h2, Jost 900 --fs-2xl)  [Copy link] [Presets ▾]
┌──────────────────────────────────────────────────┐  ┌ --panel-width ─────────────────┐
│[Assembled|Inner|Exploded]             (◉) (⟳)   │  │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                  │  │[01] Light core                 │
│                                                  │  │ Core      [Rod + strip|LED tube]│
│              dark stage, sticky                  │  │ Rod length        [ 1500 |mm ] │
│              lamp glowing                         │  │ ─────────●──────────────────── │
│              (canvas role="img")                  │  │ 11 outer × 154.5 · 11 inner ×  │
│                                                  │  │ 154.3 · lamp 1533.5 mm         │
│                                                  │  │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                  │  │[02] Tubes                      │
│                                                  │  │ Outer Ø [200|mm]  Inner Ø [60] │
│             ░░░░ light pool ░░░░                 │  │ Height mode [Fit to rod|Keep]  │
│                                                  │  │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│(● Ready · 11 + 11 rings)   Drag to orbit · zoom  │  │[03] Colours                    │
└──────────────────────────────────────────────────┘  │ ◯ Clear   [#FFF4DC] ×11  (x)   │
   sticky top: 16, height 100svh − 32                 │ ◉ Amber   [#FFA41B] ×4   (x)   │
                                                      │ + Add colour                   │
                                                      │ ┌ Fill [Outer|Inner|Both] ────┐│
                                                      │ │[▤ Alternate][▦ Gradient]   ││
                                                      │ │[⚄ Random][◭ Mirror]        ││
                                                      │ └────────────────────────────┘│
                                                      │   OUTER · 11   INNER · 11      │
                                                      │11 ┌────────┐  ┌────────┐       │
                                                      │.. │ tiles  │  │ tiles  │       │
                                                      │01 └────────┘  └────────┘       │
                                                      │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
                                                      │[04] Base & printer             │
                                                      │ Printer [Bambu Lab … 256 ▾]    │
                                                      │ ▸ Printer tuning               │
                                                      │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
                                                      │ Warnings list (if any)         │
                                                      │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
                                                      │[05] Download                   │
                                                      │ Parts table / filament table   │
                                                      │ [3MF|STL]        ☐ Fit-test    │
                                                      │ [      Download ZIP       ]▖   │
                                                      └────────────────────────────────┘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 stacklamp · MIT · Source on GitHub · Print notes                    (inverse footer)
```

### Mobile wireframe (< 600, 375 px reference)

```
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  band rule
 ▣ stacklamp          GitHub ↗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 A FLOOR LAMP YOU PRINT YOURSELF
 Light,
 stacked.           (44 px)
 ■ A metal core. A ribbon …
 ● Stack printed tubes …
 ▲ Set the height, pick …
 [ Configure your lamp ]▖
 1.5 m · 4 parts · MIT
      ┌──────────────┐
      │ hero drawing │ 360 max, centred
      └──────────────┘
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
┌────────────────────────────┐ full bleed, 56svh
│[Assem.|Inner|Expl.]  (◉)(⟳)│
│                            │
│     ┌──────────────┐       │
│     │ Tap to rotate│       │ scrim until tapped
│     └──────────────┘       │
│(● Ready)                   │
└────────────────────────────┘
 [01] Light core
 Rod length      [1500|mm]
 ─────────●────────────────
 …sections stacked, 16 px gutters…
 [05] Download
 …
 (space for mini-bar)
┌────────────────────────────┐ sticky bottom, inverse,
│ 1533.5 mm · 22  [Download] │ mustard 4 px top edge
└────────────────────────────┘ z: --z-sticky
```

The mini-bar's Download button scrolls to and focuses the download panel the first time (so the
format choice and warnings are seen), and starts the export directly once the panel has been seen.
The bar hides when the download panel is in view (IntersectionObserver).

---

## 7. Shape and depth

- `--radius-0` (0): default for surfaces, buttons, fields, segmented controls, tiles, tables, toasts, the stage.
- `--radius-pill` (999 px): swatches (circles), status pills, icon buttons (circles), slider thumbs, the floor-pool ellipse.
- `--radius-sm` (2 px): tiny inline chips only (kbd hints). `--radius-md` (4 px): reserved, code/URL boxes. Never for primary surfaces.
- Borders are widths: `border: var(--border-bold) solid var(--color-ink)` (2 px) for anything
  interactive and for section rules; `var(--border-thin)` (1 px) in `--color-line` for table rows
  and dividers inside a component.
- Shadows are solid offsets in ink: `--shadow-block` (4/4) at rest, `--shadow-pop` (6/6) on hover,
  `--shadow-press` (1/1) when pressed. Only buttons and the toast have them. Fields, tiles and
  panels are flat.
- Focus: `outline: var(--focus-ring); outline-offset: var(--focus-offset)` (3 px focus blue, 2 px
  gap). An outline never fights the offset shadow and survives forced-colours mode. Inside dense
  grids (band tiles) use `outline-offset: -3px`.

---

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120 ms | hover, press, colour swaps, swatch scale |
| `--dur-base` | 200 ms | disclosure chevron, toast in, pill text change, progress width |
| `--dur-slow` | 400 ms | view-mode tween in the stage, hero reveal |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | everything that enters or responds |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | loops (busy dot, hero halo) and the camera tween |

Motion is short and mechanical: things move like printed parts (translate, never scale buttons,
never bounce). Allowed loops: the "Updating…" pill dot, the hero halo (opt-in `animate`), the
progress bar. No parallax, no auto-rotating lamp.

**Reduced motion:** `tokens.css` zeroes `--dur-fast/base/slow` under
`prefers-reduced-motion: reduce`, so every transition written with the tokens becomes instant.
Loops must be switched off explicitly (`animation: none` in the same media query, the hero
illustration does this itself). The stage reads `matchMedia('(prefers-reduced-motion: reduce)')`
and makes the view-mode change instant. `base.css` should add the global safety net:
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; } }`.

---

## 9. Layering

| Token | Value | |
|---|---|---|
| `--z-raised` | 1 | focused tile/segment above neighbours |
| `--z-sticky` | 20 | sticky preview, mobile mini-bar, stage toolbar |
| `--z-header` | 30 | header (if made sticky) |
| `--z-popover` | 40 | presets menu, tooltips |
| `--z-toast` | 50 | toasts |

---

## 10. Components

Sizes are minimums. Every interactive element has a visible label or `aria-label`, a
`:focus-visible` outline as in §7, and a 44 px target on coarse pointers. State names: **default,
hover, active** (pressed), **focus** (`:focus-visible`), **disabled**, **invalid**.
Tokens below drop the `--color-` prefix for brevity (`ink` = `var(--color-ink)`).

### Button (primary / secondary / ghost)

Height `--target-min` (44), padding 0 24, `--fs-md` 700 sentence case, optional 18 px icon left with
8 gap, border 2 px ink, radius 0. Sizes: `sm` 40 tall / 12 padding / `--fs-sm` (generator bar);
`wide` full width / 56 tall / `--fs-lg` (Download ZIP).

| State | Primary | Secondary | Ghost |
|---|---|---|---|
| default | bg accent, text accent-ink, `--shadow-block` | bg paper, text ink, `--shadow-block` | transparent, no border, no shadow, text ink |
| hover | translate(−2, −2), `--shadow-pop` | same lift, bg `--block-1` | bg paper-2, 2 px underline |
| active | translate(3, 3), `--shadow-press` | same | bg paper-2, 2 px ink border |
| focus | focus outline (shadow stays) | same | same |
| disabled | bg paper-2, text ink-3, dashed ink-3 border, no shadow, `cursor: not-allowed` | same | text ink-3 |
| busy | label becomes stage text ("Building base… 1 of 7"), `aria-busy="true"`, stays enabled as "Cancel" only if cancel exists | | |

One primary per view: "Download ZIP" (and the hero CTA, which only scrolls).

### IconButton

44 × 44 circle (36 inside dense rows on fine pointers), border 2 px ink, bg paper, 20 px icon in
ink. Always `aria-label`; toggles use `aria-pressed`.

| State | Paper variant | Stage variant |
|---|---|---|
| default | bg paper, icon ink | bg stage-bg, icon stage-ink, border stage-line |
| hover | bg `--block-1` | border stage-ink |
| active | bg `--block-2`, translate(1, 1) | translate(1, 1) |
| pressed (`aria-pressed=true`) | bg ink, icon paper | bg stage-ink, icon stage-bg |
| focus | focus outline | focus outline |
| disabled | dashed ink-3 border, icon ink-3, transparent | opacity 0.4 |

Row actions (palette row delete) use a borderless variant that shows its border on hover.

### SegmentedControl

`role="radiogroup"` of native radios. Outer border 2 px ink, segments separated by 2 px ink lines,
equal height 44 (40 inside), padding 0 16, `--fs-sm` 500. Arrow keys move and select.

| State | Look |
|---|---|
| default | bg paper, text ink |
| hover (unselected) | bg paper-2 |
| selected | bg ink, text paper, 700 (Bauhaus inversion, no colour) |
| focus | focus outline around the focused segment, `z-index: --z-raised` |
| disabled option | text ink-3, no hover, not selectable |
| stage variant | border stage-line, bg stage-bg, text stage-ink, selected bg stage-ink / text stage-bg |

### Field and NumberField

Field anatomy: label (`--fs-sm` 700, sentence case) → control → hint (`--fs-xs` ink-2) or error.
Label and control share one row in the panel when the control is a NumberField (label left, input
right, `justify-content: space-between`); a slider, when present, sits on the next row at full
width. Hint and error are wired with `aria-describedby`.

Input box: 44 tall, border 2 px ink, bg paper, radius 0, padding 0 12, `--fs-md`.
NumberField: `inputMode="decimal"`, right-aligned, tabular, 500 weight, width 7ch; unit chip glued
on the right (2 px ink left border, bg paper-2, ink-2, `--fs-sm`, padding 0 12). Typing keeps a
draft; Enter/blur parses, clamps and commits; ArrowUp/Down ±step, Shift ×10. If a value was
clamped, the hint briefly says so ("Max 2000 mm, set to 2000.") in a polite live region.
Slider: 24 tall hit area, 4 px track in line colour with the filled part in ink, 22 px circular thumb
(paper, 2 px ink border; hover fill `--block-1`; focus outline on the thumb).

| State | Box |
|---|---|
| default | border ink, bg paper |
| hover | bg paper-2 |
| focus (`:focus-within`) | focus outline, bg paper |
| invalid (`aria-invalid`) | border danger + 4 px inset danger bar on the left; message below in danger, `--fs-xs` 500, warning icon 16 px: say what is wrong and the allowed range |
| disabled | dashed ink-3 border, text ink-3, transparent bg, unit chip transparent |
| read-only (derived value) | no border, bg paper-2, ink-2 text |

### Select

Native `<select>` inside the input box (same states as Field), `appearance: none`, with a 40 px
chevron cell on the right (2 px ink left border, bg paper-2, chevron icon). Option labels are the
preset labels from the engine (`PRINTER_PRESETS[*].label`).

### Checkbox (fit-test, "same height")

22 px square, 2 px ink border, bg paper; checked = bg ink with a paper tick; label `--fs-sm`, whole
row is the target (44 tall). Focus outline on the box.

### Disclosure ("Printer tuning")

Full-width button row, 44 tall, 2 px ink top rule, label `--fs-md` 700, chevron icon right.
`aria-expanded` and `aria-controls`. Open: chevron rotates 180° (`--dur-base`, `--ease-out`), panel
content follows with 12 top / 24 bottom padding. Hover: bg paper-2. Focus: outline. Disabled: never.
Panel content is not animated in height (instant), only the chevron moves.

### Swatch

32 px circle (the tube seen from above), 2 px ink border, fill = the colour, plus a flat "glass"
facet: a white 38 % triangle over the top-left (`linear-gradient(135deg, rgb(255 255 255 / 0.38) 0 38%, transparent 38%)`).
Hit area 48 px via a transparent pseudo-element. Name in a tooltip and in `aria-label`
("Paint with Amber").

| State | Look |
|---|---|
| default | as above (Clear is visible thanks to the ink border) |
| hover | scale 1.1 (`--dur-fast`), the one place scale is allowed |
| selected brush (`aria-pressed=true`) | double ring: 3 px paper gap + 2 px ink ring (`box-shadow: 0 0 0 3px paper, 0 0 0 5px ink`) |
| in mix (multi-select for generators) | small ink dot badge bottom-right, 10 px |
| focus | focus outline, offset 6 px (outside the brush ring) |
| disabled | opacity 0.35 |

In tables and readouts use a 14 px dot (1 px ink border) before the colour name.

### Toast

Bottom centre, 16 above the viewport edge (mobile: above the mini-bar), max 420 wide, min 52 tall.
bg inverse, text inverse-ink `--fs-sm`, 2 px border, offset shadow 4/4 in `--block-1`
(errors: `--block-3`). Optional action as an outlined inverse button ("Undo", "Retry"), then a
36 px close button. Enter: translateY(8 px) + opacity 0 → 0 over `--dur-base`; exit: fade
`--dur-fast`. `role="status"` (polite) for info, `role="alert"` for errors. Auto-dismiss after 5 s,
paused on hover/focus; errors stay until dismissed. One toast at a time; a new one replaces the old.

### StatusPill

28 tall pill, 2 px border, padding 0 12, `--fs-sm` 500, 8 px status dot left, tabular text. Lives
in a polite live region (only text changes are announced).

| State | Dot | Look | Text example |
|---|---|---|---|
| engine loading | ink-3 | paper | "Starting engine…" |
| ready | ok | paper | "Ready · 11 + 11 rings" |
| updating | `--block-1`, pulsing (off under reduced motion) | paper | "Updating…" |
| stale (preview behind config) | `--block-2` | paper | "Preview out of date" |
| error | paper dot | bg danger, text paper, border danger | "Can't build" |
| stage variant | same dots | bg stage-bg, text stage-ink, border stage-line | |

### Colour band tiles (ColourBandEditor)

Two vertical columns side by side, **Outer | Inner**, bottom-aligned, band 0 at the bottom (exactly
like the lamp). Column heads above as micro labels ("OUTER · 11", "INNER · 11"). Band numbers
(01, 02, …, tabular, `--fs-xs` ink-2) in a narrow gutter left of the outer column, shown always on
desktop, on focus/hover only on phones.

- Tile height ∝ the visible height of the segment: the pitch `P` for every band and the full
  segment height `H` for the top band. Scale: `pxPerMm = clamp(0.12, 360 / outerStackHeight, 0.24)`,
  shared by both columns so their tops line up as in the lamp; minimum tile height 24 px (32 px on
  `pointer: coarse`). Columns are equal width (each `1fr`, ≥ 88 px).
- Column frame: 2 px ink border. Seams between tiles: 1 px ink. Fill: the band's PETG hex. No text
  inside tiles (names are in `aria-label`); if a label is ever needed use the palette's "Label" ink.
- Painting: pointerdown on a tile paints it with the brush and captures the pointer; moving across
  tiles in the same column paints each (`touch-action: none` on the column). Pointerup ends the
  stroke; one stroke = one undo step. Painting is local state only: no worker call.
- Keyboard: each column is one tab stop (`role="grid"` or a `listbox` per column with
  `aria-activedescendant`); ArrowUp/Down move the cursor (Up = higher band), Left/Right switch
  column, Enter/Space paint with the brush, 1–9 pick palette colour n as brush and paint,
  Home/End jump to bottom/top.

| State | Look |
|---|---|
| default | fill colour, ink seams |
| hover (pointer: fine) | brush preview: the top-left triangle of the tile shows the brush colour (`linear-gradient(135deg, brush 0 50%, transparent 50%)`) |
| active (painting) | tile takes the brush colour immediately; cursor `crosshair` |
| keyboard cursor | inset double ring: 3 px ink + 2 px paper inside the tile |
| focus (column focused) | focus outline on the cursor tile, `outline-offset: -3px` |
| disabled (engine error, no bands) | column at opacity 0.4 with "No bands yet" in ink-2 |
| refit (band count changed) | new tiles appear without animation; stored colours beyond N are kept (C1) and come back when N grows |

### PaletteEditor row

Grid: `[swatch 32] [name input 1fr] [hex input 7.5rem] [count] [delete]`, gap 8, row padding 8,
1 px line under each row, inputs 36 tall (44 on coarse pointers). The swatch is the brush
selector. Hex input: mono `--fs-sm`, uppercase, with a "#" chip on the left; a native
`<input type="color">` opens from an edit icon or the swatch's context action. Count: "×4"
tabular ink-2 (bands using this colour across both stacks).

| State | Look |
|---|---|
| default | transparent |
| hover | bg paper-2 |
| brush (active colour) | 4 px inset ink bar on the left + swatch ring |
| focus | per control |
| invalid hex | hex box invalid style; the swatch keeps the last valid colour |
| delete disabled | when it is the last colour; when in use, deleting reassigns its bands to the first palette colour and shows a toast with Undo |

"+ Add colour" is a ghost button under the list; max 16 colours (base-36 codec limit is higher, but
16 keeps the planner usable).

### GeneratorBar

Inset strip: bg paper-2, 2 px ink border, padding 12, wraps. Content: micro label "FILL", target
SegmentedControl `[Outer | Inner | Both]`, then four `sm` secondary buttons with icons:
Alternate (`alternate`), Gradient (`gradient`), Random (`random`), Mirror (`mirror`). Generators
use the palette colours selected in "mix" (or all used colours when none are selected). Random
re-rolls on each click (new seed). Each click is one undo step and announces the result politely
("Outer: gradient Amber → Red over 11 bands").

### WarningsList rows

Container: 2 px ink border, rows separated by 1 px line, row padding 12, grid
`[28 px severity block] [text 1fr] [fix link]`. Severity block: error = danger fill + paper
`close` icon and a 4 px inset danger bar on the row; warning = `--block-1` fill + ink `warning`
icon; info = paper-2 fill, 1 px ink border, `info` icon. Text: optional bold first line (the
problem), then one line on what to do. Fix link: underlined 700 `--fs-xs` button "Go to rod
length" that scrolls to and focuses the field (`path` from the message). Errors first, then
warnings, then info. Empty: one ok row ("Every part fits your printer.").

### DownloadPanel

- Section head "05 Download" (cobalt number square).
- **Parts table:** Part | Qty | Height | Mass. **Filament table:** colour dot + name | Outer | Inner |
  Total mass, with a footer row ("All", totals, "≈ 1.4 kg"). Tables: heads are micro labels with
  a 2 px ink bottom rule; rows `--fs-sm` with 1 px line; numbers right-aligned tabular; footer has a
  2 px ink top rule and 700 weight. Fit column (optional) shows `check` (ok colour) or `warning`
  (danger) with the bed size in the `title`.
- Row: format SegmentedControl `[3MF | STL]` left, "Fit-test ring" checkbox right.
- Primary `wide` button "Download ZIP" (download icon). Blocked by errors: disabled, and the text
  under it says why ("Fix 1 error above to download.").
- Progress: 10 px bar (2 px ink border, accent fill, width animated `--dur-base`) + polite stage
  text ("Building outer segment… 3 of 7", then "Packing ZIP…", then "Saved stacklamp-1500.zip · 4.2 MB").
- Note, `--fs-xs` ink-2: "Slicers ignore colours inside 3MF files. Load each segment file with the
  filament the print plan lists."

### PreviewToolbar (on the stage)

Overlay inside the stage, inset 12: top-left the view SegmentedControl (stage variant)
`[Assembled | Inner | Exploded]`; top-right IconButtons (stage variant): glow toggle (`eye`,
`aria-pressed`), reset view (`resetView`). Bottom-left the StatusPill (stage variant); bottom-right
the hint "Drag to orbit · scroll to zoom" (`--fs-xs`, stage-ink at 72 % opacity; on touch: "Drag
to orbit · pinch to zoom"). The toolbar never covers more than the top 64 px. On touch devices a
centred "Tap to rotate" button on a `--color-scrim` overlay sits on the canvas until tapped, so the
page scrolls normally over the preview.

### Panel section header

2 px ink top rule, 16 padding, 36 px square number (`--block-n`, Jost 900 `--fs-md`, ink on 1–2,
paper on 3–6) + title in Jost 700 `--fs-xl`. The colour squares make the panel itself a stack of
bands.

---

## 11. Copy

### Hero (final)

- Eyebrow (micro label): **A floor lamp you print yourself**
- Headline (Jost 900, `--fs-display`, two lines): **Light, stacked.**
- Three lines (`--fs-lg`, each with a small block bullet: mustard square, tangerine circle, red triangle):
  1. A metal core. A ribbon of light. Rings of translucent PETG.
  2. Stack printed tubes in any colour order to paint the light, zone by zone.
  3. Set the height, pick the colours, download print-ready files. Free, in your browser.
- CTA (primary, scrolls to the configurator and focuses rod length): **Configure your lamp**
- Meta (`--fs-sm` ink-2): 1.5 m tall by default · 4 printable parts · open source (MIT)
- Illustration title (alt): "A column of amber, orange and red rings around a light core, standing on a round base"

### Tone

Workshop-precise and warm. Second person, short sentences, sentence case, British spelling
(colour, centre). No exclamation marks, no "Oops", no emoji. Numbers always with units and a space
(`1500 mm`, `11 ×`, `≈ 98 g`, `Ø 200`). An error says what is wrong, the limit, and the way out.
Buttons are verbs. Say "rings" or "segments" consistently: "segment" in tables and the print plan,
"ring" in friendly summaries.

### Microcopy

| Where | Text |
|---|---|
| Section titles | 01 Light core · 02 Tubes · 03 Colours · 04 Base & printer · 05 Download |
| Core options | Rod + LED strip · Single-ended LED tube |
| Rod length hint | 600 to 2000 mm. The stacks are fitted to it. |
| LED tube note | LED tubes can't be cut. The stack is fitted to the tube instead. Mains voltage: have a qualified person wire it. |
| Height mode | Fit to rod (auto) · Keep segment height |
| Height summary (live) | 11 outer × 154.5 mm · 11 inner × 154.3 mm · lamp 1533.5 mm |
| Locked mode cut note | Cut the rod to 1482 mm. |
| Same-height checkbox | Same height for inner and outer |
| Palette | Add colour · Paint with Amber · ×4 (used on 4 bands) |
| Generators | Fill: Outer / Inner / Both · Alternate · Gradient · Random · Mirror |
| Band tile label | Outer band 3 of 11: Amber |
| Printer tuning | Printer tuning (disclosure) · "The defaults print well on a 0.6 mm nozzle in vase mode." |
| Warnings (examples) | **Outer segment doesn't fit** 202 mm socket on a 180 mm bed. · **Segments stretched 12 %** Segments are 168 mm instead of 150 mm so the stack meets the rod. · The weight pocket needs tree supports (build plate only). |
| No warnings | Every part fits your printer. |
| Download | Download ZIP · Building base… 1 of 7 · Packing ZIP… · Saved stacklamp-1500.zip · 4.2 MB |
| Download blocked | Fix 1 error above to download. |
| 3MF note | Slicers ignore colours inside 3MF files. Load each segment file with the filament the print plan lists. |
| Share | Copy link → toast "Link copied. Anyone with it sees this lamp." |
| Presets | Save preset · Preset "Sunset" saved · Delete preset "Sunset"? → toast with Undo |
| Engine | Starting engine… · Ready · Updating… · Preview out of date · Can't build |
| Engine failure | The geometry engine didn't start. Reload the page; if it keeps failing, your browser may block WebAssembly. |
| WebGL fallback | No 3D preview in this browser. Here is a to-scale drawing instead. |
| Touch overlay | Tap to rotate |
| Stage hint | Drag to orbit · scroll to zoom |
| URL clamped | Some values in the link were out of range and were adjusted. |
| Footer | stacklamp · MIT licence · Source on GitHub · Made for 0.6 mm nozzles and PETG |

---

## 12. 3D stage art direction

The stage is a dark gallery box: the only dark surface on the page, square corners, no border
(on paper the dark block is its own edge). Desktop: inset in the grid, sticky. Mobile: full bleed.

| Token | Value | Meaning |
|---|---|---|
| `--stage-bg` | `#110F12` | renderer clear colour and container background (warm violet-black) |
| `--stage-floor` | `#1A1715` | floor disc, a touch lighter than the background so it reads |
| `--stage-led` | `#FFD49A` | LED core light, about 3000 K; also the point-light colour |
| `--stage-part` | `#5C554E` | printed opaque parts (base, top cover): warm graphite, present but not competing |
| `--stage-rod` | `#C9CDD2` | brushed aluminium (visible in exploded/inner views) |
| `--stage-glow-strength` | `1.0` | multiplier of the additive band glow |
| `--stage-bloom` | `0.6` | bloom strength, high tier only |
| `--stage-pool` | `#FFB86B` | optional: light pool on the floor (tint it towards the bottom band if cheap) |
| `--stage-sheen` | `#FFFFFF` | optional: specular sheen of the PETG |
| `--stage-ink` / `--stage-line` | `#F4EEE1` / `#4A433C` | overlay text/icons and overlay borders |

Read them once at mount with `getComputedStyle(document.documentElement).getPropertyValue(name).trim()`.

- **Camera:** 30–35° vertical FOV, lamp fills ~85 % of the stage height, eye height slightly below
  the lamp's middle (looking a little up, like standing in a room), 15° off-axis. No auto-rotation.
- **Light:** the bands are the light. Glow is additive in the band colour, strongest at grazing
  angles (rim), so each ring reads as a glowing edge with a soft body. Clear bands are the
  brightest, Smoke the dimmest; never boost dark colours to equal brightness.
- **Sheen:** a thin specular highlight (opacity ~0.12) so the tubes read as plastic, not neon.
- **Parts:** base and cover in `--stage-part`, matte (roughness ~0.8), lit by the warm point
  lights and the pool, never pure black.
- **Floor:** disc in `--stage-floor`, additive light pool around the base in `--stage-pool`,
  fading to nothing well inside the disc edge, no visible grid.
- **Bloom:** subtle, high tier only, threshold so only the glow blooms (not the parts).
- **Exploded view:** gaps equal to ~40 % of the pitch, parts keep their glow.
- **Fallback (no WebGL or chunk failed):** the same dark box with
  `StackIllustration variant="schematic"` centred, `color: var(--stage-ink)`, and the stage hint
  replaced by the WebGL fallback sentence.

---

## 13. Illustrations, icons, favicon

### `StackIllustration` (`src/ui/illustrations/StackIllustration.tsx`)

```ts
<StackIllustration
  variant="hero" | "schematic"
  outerColours={string[]}   // hex, index 0 = bottom; [] → default plan
  innerColours={string[]}
  dims?={{ totalHeight, outerOD, innerOD, baseD, innerSegH, outerSegH, rodLength }}  // mm
  title="…"                 // accessible name (required)
  className?="…"
  animate?={boolean}        // hero only, off under reduced motion
/>
```

- `hero`: poster elevation, viewBox 480 × 640, scale it with `width: 100%; height: auto`. Uses
  `--color-ink` / `--color-paper` (with fallbacks) for base, cap and leading; band colours as given.
- `schematic`: to-scale half section in mm. Left half: outer stack exterior; right half: outer wall
  cut, inner stack exterior; dashed core; Ø and height dimensions; callouts for outer, inner, core.
  Linework and labels use `currentColor`: set `color: var(--stage-ink)` on the dark stage. Has a
  `<desc>` with the key numbers. Band count comes from the colour arrays; the drawing re-derives the
  base height from `totalHeight` with the engine's closure, so it stays consistent with any dims.
- Pass real data: `outerColours` = the fitted outer band ids mapped to their palette hex (same for
  inner), and `dims = { totalHeight: d.totalHeight, outerOD: p.tubes.outerOD, innerOD: p.tubes.innerOD,
  baseD: p.base.diameter, outerSegH: d.outer.height, innerSegH: d.inner.height, rodLength: p.core.length }`
  with `d = deriveDims(p)`.

### Icons (`src/ui/illustrations/icons.tsx`)

`<Icon name="download" size={20} title?="…" />`, plus named components (`DownloadIcon`, …).
20 px grid, 2 px stroke, square caps, mitred joins, `currentColor`. Names: `link download plus
trash edit alternate gradient random mirror eye explode resetView warning info check close
chevron`. `chevron` points down; rotate with CSS (`transform: rotate(180deg)` when open, −90° for
"next"). Icons next to visible text are decorative (no `title` → `aria-hidden`); icon-only buttons
put the name on the button (`aria-label`), not on the icon.

### Favicon

`public/favicon.svg`: ink square with a cap, four stacked bands (amber, orange, red, violet from the
bottom), a light core line and a base, on a 2 px pixel grid so it stays crisp at 16 px.

---

## 14. Notes for the UI implementation

- Import order in `main.tsx`: `./ui/styles/fonts.css`, `./ui/styles/tokens.css`, then `base.css`.
- `base.css`: `box-sizing`, `body { background: var(--color-paper); color: var(--color-ink);
  font: var(--fw-regular) var(--fs-md)/var(--lh-body) var(--font-body); }`, `::selection`,
  default `:focus-visible` outline from the tokens, `.tnum { font-variant-numeric: tabular-nums }`,
  `.visually-hidden`, links (ink, 2 px underline offset 4 px, hover accent), the reduced-motion
  safety net from §8.
- CSS modules reference tokens only. No raw colours outside `tokens.css`; tints via
  `color-mix(in srgb, var(--token) 40%, transparent)`.
- The default palette values live in C1's palette code; keep them identical to `--petg-*` (a test
  comparing both is cheap).
- Touch: `@media (pointer: coarse)` raises dense controls to `--target-min`.
- The canvas gets `role="img"` and an `aria-label` that states the configuration
  ("Lamp preview: 1533.5 mm tall, 11 outer rings amber to red, 11 inner rings clear").
