/**
 * Small formatting and parsing helpers shared by the UI. Numbers are shown with a space
 * before the unit and, above 999, with thousands separators ("1,534 mm").
 */

const nf = new Map<string, Intl.NumberFormat>();
function formatter(maxDigits: number, minDigits: number, grouping: boolean): Intl.NumberFormat {
  const key = `${maxDigits}/${minDigits}/${grouping ? 1 : 0}`;
  let f = nf.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-GB', {
      maximumFractionDigits: maxDigits,
      minimumFractionDigits: minDigits,
      useGrouping: grouping,
    });
    nf.set(key, f);
  }
  return f;
}

/** 1533.5 → "1,534" (digits = 0), 154.5 → "154.5" (digits = 1). Trailing zeros dropped unless `fixed`. */
export function fmt(n: number, digits = 1, fixed = false): string {
  if (!Number.isFinite(n)) return '–';
  return formatter(digits, fixed ? digits : 0, true).format(n);
}

/** Value with unit and a space: "154.5 mm". */
export function mm(n: number, digits = 1): string {
  return `${fmt(n, digits)} mm`;
}

/** Plain editable string for an input (no grouping): 1500 → "1500", 0.8 → "0.8". */
export function formatPlain(n: number, precision: number): string {
  if (!Number.isFinite(n)) return '';
  const s = formatter(Math.max(0, precision), 0, false).format(n);
  return s === '-0' ? '0' : s;
}

/**
 * Parse what a person typed into a number field. Accepts a comma or a dot as the decimal
 * separator ("0,8"), surrounding spaces and a leading sign; rejects anything else.
 */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Round to `precision` decimals without float noise; −0 → 0. */
export function roundTo(n: number, precision: number): number {
  const r = Number(n.toFixed(Math.max(0, precision)));
  return Object.is(r, -0) ? 0 : r;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Two-digit band number: 3 → "03". */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "Amber, Orange and Red" */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Joins class names, skipping falsy values. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
