/**
 * Art direction for the dark stage, read once from the `--stage-*` CSS custom
 * properties (written by the design system in tokens.css) with hard-coded
 * fallbacks, so the preview works before / without the stylesheet.
 */

export interface StageTokens {
  /** Background and fog colour. */
  bg: string;
  floor: string;
  /** Warm LED white (strip sleeve, point lights, "Clear" glow). */
  led: string;
  /** Opaque printed parts: base and cover. */
  part: string;
  rod: string;
  /** Global multiplier of the band glow. */
  glowStrength: number;
  /** UnrealBloomPass strength (high tier). */
  bloom: number;
}

export const STAGE_FALLBACK: Readonly<StageTokens> = {
  bg: '#0e0d12',
  floor: '#1c1a20',
  led: '#ffc47e',
  part: '#d9d3ca',
  rod: '#c3c7cd',
  glowStrength: 1,
  bloom: 0.6,
};

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

const toHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/**
 * Normalises any CSS colour to '#rrggbb'. Hex and rgb() are parsed directly; other
 * syntaxes (oklch(), color(), named colours) are resolved by painting one pixel on a
 * 2D canvas. Returns null when the value cannot be resolved.
 */
export function cssColourToHex(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (HEX6.test(v)) return v.toLowerCase();
  if (HEX3.test(v)) return ('#' + [...v.slice(1)].map((c) => c + c).join('')).toLowerCase();
  const m = RGB.exec(v);
  if (m) return toHex(Number(m[1]), Number(m[2]), Number(m[3]));
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#010203';
    ctx.fillStyle = v;
    // An unparseable value leaves the sentinel in place.
    if (ctx.fillStyle === '#010203' && v.toLowerCase() !== '#010203') return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return toHex(d[0]!, d[1]!, d[2]!);
  } catch {
    return null;
  }
}

function num(value: string, fallback: number): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Reads the tokens from :root (or a given element). Never throws. */
export function readStageTokens(el?: Element): StageTokens {
  const out: StageTokens = { ...STAGE_FALLBACK };
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return out;
  try {
    const cs = getComputedStyle(el ?? document.documentElement);
    const get = (name: string) => cs.getPropertyValue(name).trim();
    const colour = (name: string, fb: string) => cssColourToHex(get(name)) ?? fb;
    out.bg = colour('--stage-bg', out.bg);
    out.floor = colour('--stage-floor', out.floor);
    out.led = colour('--stage-led', out.led);
    out.part = colour('--stage-part', out.part);
    out.rod = colour('--stage-rod', out.rod);
    out.glowStrength = num(get('--stage-glow-strength'), out.glowStrength);
    out.bloom = num(get('--stage-bloom'), out.bloom);
  } catch {
    /* keep fallbacks */
  }
  return out;
}
