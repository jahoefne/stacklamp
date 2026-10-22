#!/usr/bin/env bash
# Headless Bambu Studio slice of every part file (*.3mf, *.stl) under a directory.
#
#   npm run gen:samples              # writes out/<case>/*.3mf|*.stl (+ config.json)
#   bash scripts/slice-check.sh out  # slices them all, prints a summary, exits 1 on any failure
#
# Checks per part file:
#   info    `BambuStudio --info`: the mesh is closed (manifold = yes) and one part.
#   vase    segments + fit test, as PRINT-PLAN.md says: spiral vase, 1 wall, line width = wall
#           (read from the config.json next to the file), 0 top/bottom layers, 0 % infill,
#           0.3 mm layers, brim 5 mm on the outer segment only, elephant-foot 0.15.
#   normal  segments + fit test without vase mode: Arachne wall generator, otherwise stock.
#           (The stock *classic* generator lays two overlapping 0.62 mm loops into a 0.8 mm
#           wall, ~1.5x the material; with 1 wall at 0.8 it leaves gaps. Arachne prints one
#           0.8 mm line, like vase mode.)
#           base: 4 walls, 20 % gyroid, 5/5 shells, tree supports on build plate only, no brim.
#           top-cover: 3 walls, 20 % infill, 0.2 mm layers, no supports, no brim.
# Machine: Bambu Lab A1 mini 0.6 nozzle when config.json says printer.preset = bambu-a1-mini,
# otherwise Bambu Lab X1 Carbon 0.6 nozzle, with the matching "0.30mm Standard … 0.6 nozzle"
# process, Generic PETG and the Textured PEI plate. The bundled system profiles use `inherits`
# and `include`, which the CLI does not resolve (it falls back to a 200x200x100 bed), so they
# are flattened into plain JSON first.
# 3MF files are sliced where the file places them (--arrange=0: a part placed off the bed
# fails). STL files are put at the bed centre with --load-assemble-list, as the GUI does on
# import (the CLI's auto-arrange keeps a 12 mm margin when supports are on and would reject
# the 240 mm base on a 256 mm bed, which says nothing about the file).
#
# A slice passes when: the CLI exits 0; plate_1.gcode and the sliced 3MF exist; result.json
# has return_code 0; neither the log nor the slicer warning mentions
# non-manifold/empty/outside/error; the G-code reaches the model height (± 1 layer); and for
# segments + fit test the tool path at mid-body is ONE loop whose outer edge is the modelled
# OD (± 0.05 mm) and in the foot one loop whose inner edge is the modelled socket ID.
#
# Env: BAMBU (CLI binary), BAMBU_PROFILES (…/profiles/BBL), SLICE_FILTER (regex on paths).
# Output: <dir>/_slice/<case>/<part>.<mode>/{log.txt,result.json,plate_1.gcode,<part>.<mode>.3mf}
#         <dir>/_slice/summary.txt and commands.txt (every CLI call). Needs node and perl.
set -u -o pipefail

if [ $# -lt 1 ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

BAMBU=${BAMBU:-/Applications/BambuStudio.app/Contents/MacOS/BambuStudio}
PROFILES=${BAMBU_PROFILES:-/Applications/BambuStudio.app/Contents/Resources/profiles/BBL}
FILTER=${SLICE_FILTER:-}

[ -d "$1" ] || { echo "slice-check: no such directory: $1" >&2; exit 2; }
OUT_DIR=$(cd "$1" && pwd)
[ -x "$BAMBU" ] || { echo "slice-check: Bambu Studio CLI not found at $BAMBU (set BAMBU=…)" >&2; exit 2; }
[ -d "$PROFILES/machine" ] || { echo "slice-check: Bambu profiles not found at $PROFILES (set BAMBU_PROFILES=…)" >&2; exit 2; }
command -v node >/dev/null || { echo "slice-check: node is required" >&2; exit 2; }
command -v perl >/dev/null || { echo "slice-check: perl is required" >&2; exit 2; }

WORK="${OUT_DIR:?}/_slice"
rm -rf "${WORK:?}"
mkdir -p "$WORK/profiles"
HELPER="$WORK/helper.mjs"
SUMMARY="$WORK/summary.tsv"
: > "$SUMMARY"
: > "$WORK/commands.txt"

# ---------------------------------------------------------------- node helper
cat > "$HELPER" <<'EOF'
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const [cmd, ...args] = process.argv.slice(2);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const META = new Set(['name', 'type', 'from', 'setting_id', 'instantiation', 'inherits', 'include', 'filament_id']);
const BAD = /non-manifold|empty|outside|error/i;

/** Resolve `inherits` (parent first) and `include` templates; child keys win. */
function resolve(path, seen = new Set()) {
  if (seen.has(path)) throw new Error(`inheritance cycle at ${path}`);
  seen.add(path);
  const own = readJson(path);
  const dir = dirname(path);
  let merged = {};
  if (own.inherits) {
    const parent = join(dir, `${own.inherits}.json`);
    if (!existsSync(parent)) throw new Error(`parent profile "${own.inherits}" of ${path} not found`);
    merged = resolve(parent, seen);
  }
  for (const inc of own.include ?? []) {
    const file = join(dir, `${inc}.json`);
    if (!existsSync(file)) throw new Error(`included template "${inc}" of ${path} not found`);
    for (const [k, v] of Object.entries(readJson(file))) if (!META.has(k)) merged[k] = v;
  }
  for (const [k, v] of Object.entries(own)) if (k !== 'inherits' && k !== 'include') merged[k] = v;
  return merged;
}

function configNextTo(file) {
  const p = join(dirname(file), 'config.json');
  return existsSync(p) ? readJson(p) : null;
}

/** Header numbers plus, per layer, the wall extrusion moves (feature-tagged, E > 0). */
function readGcode(file) {
  const text = readFileSync(file, 'utf8');
  const get = (re) => re.exec(text)?.[1];
  const relative = get(/; use_relative_e_distances = (\d)/) !== '0';
  const layers = [];
  let layer = null;
  let feature = '';
  let x, y, e = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('; CHANGE_LAYER')) { layer = { z: NaN, moves: [] }; layers.push(layer); continue; }
    if (line.startsWith('; Z_HEIGHT:') && layer) { layer.z = Number(line.slice(11)); continue; }
    if (line.startsWith('; FEATURE:')) { feature = line.slice(10).trim(); continue; }
    if (line.startsWith('M82')) { /* absolute E */ }
    if (!/^G[0-3] /.test(line)) continue;
    const words = {};
    for (const w of line.split(';')[0].trim().split(/\s+/).slice(1)) words[w[0]] = Number(w.slice(1));
    const nx = words.X ?? x, ny = words.Y ?? y;
    let de = 0;
    if (words.E !== undefined) { de = relative ? words.E : words.E - e; if (!relative) e = words.E; }
    if (layer && de > 0 && /wall/i.test(feature) && x !== undefined && nx !== undefined) {
      layer.moves.push([x, y, nx, ny, /^G[23]/.test(line)]);
    }
    x = nx; y = ny;
  }
  return {
    layers,
    count: Number(get(/; total layer number: (\d+)/)),
    maxZ: Number(get(/; max_z_height: ([\d.]+)/)),
    grams: Number(get(/; total filament weight \[g\] : ([\d.]+)/)),
    time: get(/; model printing time: ([^;\n]+)/)?.trim() ?? '?',
    spiral: get(/; spiral_mode = (\d)/),
    layerHeight: Number(get(/; layer_height = ([\d.]+)/)),
  };
}

/** One loop of the expected radius at height z? Returns a problem string or ''. */
function loopCheck(g, centre, z, radius, label) {
  let best = null;
  for (const l of g.layers) if (l.moves.length && (!best || Math.abs(l.z - z) < Math.abs(best.z - z))) best = l;
  if (!best) return `${label}: no wall moves`;
  if (best.moves.some((m) => m[4])) return `${label}: arcs in the wall path (disable arc fitting)`;
  let len = 0, rMin = Infinity, rMax = -Infinity;
  for (const [x0, y0, x1, y1] of best.moves) {
    len += Math.hypot(x1 - x0, y1 - y0);
    const r = Math.hypot(x1 - centre[0], y1 - centre[1]);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
  }
  const want = 2 * Math.PI * radius;
  const problems = [];
  if (Math.abs(len / want - 1) > 0.02) problems.push(`path ${len.toFixed(0)} mm vs one loop ${want.toFixed(0)} mm`);
  if (rMin < radius - 0.05 || rMax > radius + 0.05) problems.push(`radius ${rMin.toFixed(2)}–${rMax.toFixed(2)} vs ${radius.toFixed(2)}`);
  return problems.length ? `${label} @z${best.z}: ${problems.join(', ')}` : '';
}

switch (cmd) {
  case 'flatten': {
    // flatten <profile.json> <out.json> [key=value …]
    const [src, dst, ...pairs] = args;
    const out = resolve(src);
    for (const pair of pairs) {
      const i = pair.indexOf('=');
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      out[k] = Array.isArray(out[k]) ? out[k].map(() => v) : v;
    }
    writeFileSync(dst, JSON.stringify(out, null, 1));
    break;
  }
  case 'config': {
    // config <part file> → "<printer preset> <segment wall>"
    const cfg = configNextTo(args[0]);
    process.stdout.write(`${cfg?.params?.printer?.preset ?? 'unknown'} ${cfg?.params?.segments?.wall ?? 0.8}\n`);
    break;
  }
  case 'assemble': {
    // assemble <stl> <machine.json> <out.json>: one plate, the STL centred on the bed, no arrange
    const [stl, machine, dst] = args;
    const pts = readJson(machine).printable_area.map((p) => p.split('x').map(Number));
    const mid = (i) => (Math.min(...pts.map((p) => p[i])) + Math.max(...pts.map((p) => p[i]))) / 2;
    const object = { path: stl, count: 1, filaments: [1], assemble_index: [0], pos_x: [mid(0)], pos_y: [mid(1)], pos_z: [0] };
    writeFileSync(dst, JSON.stringify({ plates: [{ plate_name: basename(stl), need_arrange: false, objects: [object] }] }, null, 1));
    break;
  }
  case 'info': {
    // info <info log> → "ok|FAIL\t<detail>\t<size_z>"
    const text = readFileSync(args[0], 'utf8');
    const get = (k) => new RegExp(`^${k} = (.*)$`, 'm').exec(text)?.[1]?.trim();
    const manifold = get('manifold');
    const parts = Number(get('number_of_parts'));
    const z = Number(get('size_z'));
    const ok = manifold === 'yes' && parts === 1 && z > 0;
    process.stdout.write(`${ok ? 'ok' : 'FAIL'}\tmanifold=${manifold ?? '?'} parts=${parts} facets=${get('number_of_facets') ?? '?'} z=${z}\t${z}\n`);
    break;
  }
  case 'check': {
    // check <run dir> <exit code> <export name> <model height> <mode> <part file> → "ok|FAIL\t<detail>"
    const [dir, exit, name, height, mode, partFile] = args;
    const problems = [];
    const notes = [];
    if (exit !== '0') problems.push(`exit ${exit}`);
    const log = existsSync(join(dir, 'log.txt')) ? readFileSync(join(dir, 'log.txt'), 'utf8') : '';
    const badLines = log.split('\n').filter((l) => BAD.test(l));
    if (badLines.length) problems.push(`log: ${badLines[0].replace(/^\[[^\]]*\] \[[^\]]*\] /, '').trim().slice(0, 160)}`);
    let result = null;
    try { result = readJson(join(dir, 'result.json')); } catch { problems.push('no result.json'); }
    if (result) {
      if (result.return_code !== 0) problems.push(`return_code ${result.return_code}: ${result.error_string ?? ''}`.trim());
      for (const plate of result.sliced_plates ?? []) {
        if (plate.warning_message) (BAD.test(plate.warning_message) ? problems : notes).push(`warning: ${plate.warning_message}`);
      }
    }
    const gcode = join(dir, 'plate_1.gcode');
    if (!existsSync(gcode) || statSync(gcode).size < 1000) problems.push('no G-code');
    if (!existsSync(join(dir, name))) problems.push(`no ${name}`);
    let detail = '';
    if (existsSync(gcode)) {
      const g = readGcode(gcode);
      const tol = Math.max(g.layerHeight || 0.3, 0.2) + 0.01;
      if (!(Math.abs(g.maxZ - Number(height)) <= tol)) problems.push(`G-code max z ${g.maxZ} vs model ${height}`);
      if (mode === 'vase' && g.spiral !== '1') problems.push('spiral mode not active');
      detail = `${g.count} layers, z ${g.maxZ}, ${g.grams} g, ${g.time}`;
      const part = basename(partFile).replace(/\.[^.]+$/, '');
      const cfg = configNextTo(partFile);
      if (cfg && /segment$|^fit-test$/.test(part)) {
        // one loop of width w: body outer edge = D, foot inner edge = D + 2c
        const p = cfg.params;
        const w = p.segments.wall, c = p.tolerances.segment, ov = p.segments.overlap, lead = p.segments.rimLeadIn;
        const D = part === 'inner-segment' ? cfg.derived.inner.D : cfg.derived.outer.D;
        const box = [Infinity, Infinity, -Infinity, -Infinity];
        for (const l of g.layers) for (const m of l.moves) {
          box[0] = Math.min(box[0], m[0], m[2]); box[1] = Math.min(box[1], m[1], m[3]);
          box[2] = Math.max(box[2], m[0], m[2]); box[3] = Math.max(box[3], m[1], m[3]);
        }
        const centre = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
        const bodyZ = (ov + w + c + Number(height) - lead) / 2;
        for (const msg of [
          loopCheck(g, centre, bodyZ, D / 2 - w / 2, 'body'),
          loopCheck(g, centre, ov / 2, D / 2 + c + w / 2, 'foot'),
        ]) if (msg) problems.push(msg);
        if (!problems.length) detail += `; 1 loop: OD ${D} body, ID ${+(D + 2 * c).toFixed(3)} foot`;
      }
    }
    const all = [...problems, ...(detail ? [detail] : []), ...notes];
    process.stdout.write(`${problems.length ? 'FAIL' : 'ok'}\t${all.join('; ')}\n`);
    break;
  }
  case 'table': {
    // table <summary.tsv> <out dir>
    const rows = readFileSync(args[0], 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
    const rel = (p) => (p.startsWith(args[1]) ? `${basename(args[1])}${p.slice(args[1].length)}` : p);
    const head = ['file', 'mode', 'result', 'seconds', 'detail', 'log'];
    const body = rows.map(([file, mode, res, secs, detail, log]) => [rel(file), mode, res, secs, detail, rel(log)]);
    const cap = [200, 8, 6, 7, 72, 200];
    const cell = (c, i) => (c.length > cap[i] ? `${c.slice(0, cap[i] - 1)}…` : c);
    const widths = head.map((h, i) => Math.min(cap[i], Math.max(h.length, ...body.map((r) => (r[i] ?? '').length))));
    const fmt = (r) => r.map((c, i) => cell(c ?? '', i).padEnd(widths[i])).join('  ').trimEnd();
    console.log(fmt(head));
    console.log(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const r of body) console.log(fmt(r));
    const failed = rows.filter((r) => r[2] !== 'ok');
    const secs = rows.reduce((a, r) => a + Number(r[3] || 0), 0);
    console.log(`\n${rows.length} checks, ${failed.length} failed, ${secs.toFixed(1)} s in the CLI`);
    for (const r of failed) console.log(`FAILED ${rel(r[0])} ${r[1]}: ${r[4]}\n  log: ${rel(r[5])}`);
    break;
  }
  default:
    throw new Error(`unknown helper command ${cmd}`);
}
EOF

helper() { node "$HELPER" "$@"; }
now() { perl -MTime::HiRes=time -e 'printf "%.2f", time'; }
since() { perl -e "printf '%.1f', $(now) - $1"; }

# ---------------------------------------------------------------- profiles
X1C_MACHINE="Bambu Lab X1 Carbon 0.6 nozzle"
X1C_PROCESS="0.30mm Standard @BBL X1C 0.6 nozzle"
X1C_FILAMENT="Generic PETG"
A1M_MACHINE="Bambu Lab A1 mini 0.6 nozzle"
A1M_PROCESS="0.30mm Standard @BBL A1M 0.6 nozzle"
A1M_FILAMENT="Generic PETG @BBL A1M"
BED="curr_bed_type=Textured PEI Plate"

flatten() { # flatten <kind> <profile name> <out name> [key=value …] → prints the flattened path
  local kind=$1 name=$2 out=$3
  shift 3
  local src="$PROFILES/$kind/$name.json"
  [ -f "$src" ] || { echo "slice-check: missing profile $src" >&2; return 1; }
  helper flatten "$src" "$WORK/profiles/$out.json" "$@" || { echo "slice-check: could not flatten $src" >&2; return 1; }
  echo "$WORK/profiles/$out.json"
}

# process_profile <machine tag> <part> <mode> <wall> → flattened process path (cached)
process_profile() {
  local tag=$1 part=$2 mode=$3 wall=$4 base brim_type=no_brim brim_width=0
  if [ "$tag" = a1m ]; then base=$A1M_PROCESS; else base=$X1C_PROCESS; fi
  if [ "$part" = outer-segment ]; then brim_type=outer_only; brim_width=5; fi
  local out="$tag-$part-$mode-w$wall"
  if [ -f "$WORK/profiles/$out.json" ]; then echo "$WORK/profiles/$out.json"; return 0; fi
  case "$part:$mode" in
    *segment:vase | fit-test:vase)
      flatten process "$base" "$out" "$BED" brim_type=$brim_type brim_width=$brim_width \
        spiral_mode=1 wall_loops=1 top_shell_layers=0 bottom_shell_layers=0 sparse_infill_density=0% \
        enable_support=0 layer_height=0.3 elefant_foot_compensation=0.15 enable_arc_fitting=0 \
        line_width="$wall" outer_wall_line_width="$wall" inner_wall_line_width="$wall" initial_layer_line_width="$wall" ;;
    *segment:normal | fit-test:normal)
      flatten process "$base" "$out" "$BED" brim_type=$brim_type brim_width=$brim_width \
        wall_generator=arachne enable_support=0 enable_arc_fitting=0 ;;
    base:normal)
      flatten process "$base" "$out" "$BED" brim_type=no_brim brim_width=0 wall_loops=4 \
        sparse_infill_density=20% sparse_infill_pattern=gyroid top_shell_layers=5 bottom_shell_layers=5 \
        enable_support=1 "support_type=tree(auto)" support_on_build_plate_only=1 ;;
    top-cover:normal)
      flatten process "$base" "$out" "$BED" brim_type=no_brim brim_width=0 wall_loops=3 \
        sparse_infill_density=20% layer_height=0.2 enable_support=0 ;;
    *)
      flatten process "$base" "$out" "$BED" ;;
  esac
}

X1C_M=$(flatten machine "$X1C_MACHINE" x1c-machine) || exit 2
X1C_F=$(flatten filament "$X1C_FILAMENT" x1c-filament) || exit 2
A1M_M=$(flatten machine "$A1M_MACHINE" a1m-machine) || exit 2
A1M_F=$(flatten filament "$A1M_FILAMENT" a1m-filament) || exit 2

record() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >> "$SUMMARY"; }
row() { printf '%-36s %-6s %-4s %5ss  %s\n' "$@"; }

# ---------------------------------------------------------------- slice loop
FILES=$(find "$OUT_DIR" -path "$WORK" -prune -o -type f \( -name '*.3mf' -o -name '*.stl' \) -print | sort)
if [ -n "$FILTER" ]; then FILES=$(printf '%s\n' "$FILES" | grep -E "$FILTER"); fi
[ -n "$FILES" ] || { echo "slice-check: no *.3mf / *.stl files under $OUT_DIR (run npm run gen:samples first)" >&2; exit 2; }

echo "slice-check: $("$BAMBU" --help 2>/dev/null | grep -m1 -oE 'BambuStudio-[0-9.]+'), profiles $PROFILES"
FAILED=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  rel=${file#"$OUT_DIR"/}
  case_name=$(basename "$(dirname "$file")")
  fname=$(basename "$file")
  part=${fname%.*}
  ext=${fname##*.}
  read -r preset wall <<< "$(helper config "$file")"
  if [ "$preset" = bambu-a1-mini ]; then
    tag=a1m machine=$A1M_M filament=$A1M_F machine_name=$A1M_MACHINE
  else
    tag=x1c machine=$X1C_M filament=$X1C_F machine_name=$X1C_MACHINE
  fi

  # info: closed, single-part mesh; its height is the reference for the G-code
  run="$WORK/$case_name/$part.info"
  mkdir -p "$run"
  t0=$(now)
  "$BAMBU" --info "$file" > "$run/log.txt" 2>&1
  secs=$(since "$t0")
  IFS=$'\t' read -r res detail height <<< "$(helper info "$run/log.txt")"
  [ -n "$res" ] || { res=FAIL; detail="info helper crashed"; height=0; }
  record "$file" info "$res" "$secs" "$detail" "$run/log.txt"
  [ "$res" = ok ] || FAILED=$((FAILED + 1))
  row "$rel" info "$res" "$secs" "$detail"

  case "$part" in
    *segment | fit-test) modes="vase normal" ;;
    *) modes="normal" ;;
  esac
  for mode in $modes; do
    process=$(process_profile "$tag" "$part" "$mode" "$wall") || exit 2
    run="$WORK/$case_name/$part.$mode"
    mkdir -p "$run"
    name="$part.$mode.3mf"
    if [ "$ext" = 3mf ]; then
      input=(--arrange=0 "$file")
    else
      helper assemble "$file" "$machine" "$run/assemble.json"
      input=(--load-assemble-list "$run/assemble.json")
    fi
    # --outputdir must be absolute and --export-3mf a bare file name (it is joined to it)
    args=(--debug 2 --slice 0 --load-settings "$machine;$process" --load-filaments "$filament"
      --outputdir "$run" --export-3mf "$name" "${input[@]}")
    printf '%q ' "$BAMBU" "${args[@]}" >> "$WORK/commands.txt"
    echo >> "$WORK/commands.txt"
    t0=$(now)
    "$BAMBU" "${args[@]}" > "$run/log.txt" 2>&1
    code=$?
    secs=$(since "$t0")
    IFS=$'\t' read -r res detail <<< "$(helper check "$run" "$code" "$name" "$height" "$mode" "$file")"
    [ -n "$res" ] || { res=FAIL; detail="check helper crashed (node $HELPER check $run …)"; }
    record "$file" "$mode" "$res" "$secs" "$detail [$machine_name]" "$run/log.txt"
    [ "$res" = ok ] || FAILED=$((FAILED + 1))
    row "$rel" "$mode" "$res" "$secs" "$detail"
  done
done <<< "$FILES"

echo
helper table "$SUMMARY" "$OUT_DIR" | tee "$WORK/summary.txt"
echo "CLI calls: $WORK/commands.txt"
if [ "$FAILED" -gt 0 ]; then
  echo "slice-check: $FAILED check(s) FAILED" >&2
  exit 1
fi
echo "slice-check: all green"
