// Fails when the built JS+CSS (gzip, excluding .wasm and fonts) exceeds the budget.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist/assets';
const TOTAL_LIMIT = 2 * 1024 * 1024;
const ENTRY_LIMIT = 300 * 1024;
let total = 0;
let worst = 0;
const rows = [];
for (const f of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(f)) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  rows.push([f, statSync(join(dir, f)).size, gz]);
  if (/^index-.*\.js$/.test(f)) worst = Math.max(worst, gz);
}
rows.sort((a, b) => b[2] - a[2]);
for (const [f, raw, gz] of rows) console.log(`${f.padEnd(40)} ${(raw / 1024).toFixed(0).padStart(7)} KB  ${(gz / 1024).toFixed(0).padStart(6)} KB gz`);
console.log(`total gzip: ${(total / 1024).toFixed(0)} KB (limit ${TOTAL_LIMIT / 1024} KB); entry: ${(worst / 1024).toFixed(0)} KB (limit ${ENTRY_LIMIT / 1024} KB)`);
if (total > TOTAL_LIMIT || worst > ENTRY_LIMIT) {
  console.error('bundle size budget exceeded');
  process.exit(1);
}
