/** Number formatting for the generated documents (deterministic, en-US style). */

/** Round to at most `decimals` decimals and drop trailing zeros: 154.5, 133.05, 1500. */
export function num(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '–';
  const f = 10 ** decimals;
  const r = Math.round(v * f) / f;
  return String(r === 0 ? 0 : r);
}

/** Fixed decimals: 98.4 → "98.4" with 1, 3 → "3.0". */
export function fixed(v: number, decimals = 1): string {
  if (!Number.isFinite(v)) return '–';
  const s = v.toFixed(decimals);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

/** Integer with thousands separators: 12800 → "12,800". */
export function int(v: number): string {
  const n = Math.round(v);
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${s}` : s;
}

/** Signed percentage with one decimal: 0.03 → "+3.0 %". */
export function percent(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} %`;
}

export const yesNo = (b: boolean): string => (b ? 'yes' : '**no**');

/** A Markdown table. */
export function table(head: readonly string[], rows: readonly (readonly string[])[], align?: readonly ('l' | 'r')[]): string {
  const sep = head.map((_, i) => (align?.[i] === 'r' ? '---:' : '---'));
  const line = (cells: readonly string[]) => `| ${cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`;
  return [line(head), `|${sep.join('|')}|`, ...rows.map(line)].join('\n');
}
