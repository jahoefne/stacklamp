/**
 * Procedural canvas textures for the room: walnut planks, the rug, the art print on the
 * wall and the dusk sky in the window. Each is drawn once per scene on a 2D canvas (a few
 * milliseconds), so the preview ships no image files. A builder returns null where there
 * is no 2D context (jsdom, a blocked canvas) and the room falls back to flat colours.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

/** Small deterministic PRNG (mulberry32): the room looks the same on every load. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  } catch {
    return null;
  }
}

function finish(canvas: HTMLCanvasElement, opts: { repeat?: boolean; anisotropy?: number | undefined } = {}): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = RepeatWrapping;
  if (opts.anisotropy) t.anisotropy = opts.anisotropy;
  return t;
}

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const css = (c: Rgb, a = 1): string => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;

/** Fine random speckle over the canvas: fibres on the rug, grain in the paper. */
function speckle(ctx: Ctx, w: number, h: number, rand: () => number, count: number, alpha: number): void {
  for (const [fill, n] of [
    [`rgba(0,0,0,${alpha})`, count / 2],
    [`rgba(255,255,255,${alpha})`, count / 2],
  ] as const) {
    ctx.fillStyle = fill;
    for (let i = 0; i < n; i++) ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

// ---- Wood -------------------------------------------------------------------

export interface WoodOptions {
  /** Canvas side, px. */
  size?: number;
  /** Floor length one canvas covers, m (the texture repeats). */
  metres?: number;
  base?: string;
  /** Plank width, m; Infinity gives one jointless grain field (furniture). */
  plankWidth?: number;
  plankLength?: number;
  seed?: number;
  anisotropy?: number | undefined;
}

/** Floor metres one wood tile covers (the floor's texture repeat is derived from it). */
export const WOOD_TILE_M = 1.6;

interface GrainLine {
  y: number;
  amp: number;
  freq: number;
  phase: number;
  alpha: number;
  width: number;
  light: boolean;
}
interface Plank {
  x0: number;
  y0: number;
  len: number;
  w: number;
  tint: number;
  warm: number;
  lines: GrainLine[];
  /** No seams: a continuous grain field. */
  single: boolean;
}

function makePlank(rand: () => number, x0: number, y0: number, len: number, w: number, single: boolean): Plank {
  const n = 14 + Math.floor(rand() * 10);
  const lines: GrainLine[] = [];
  for (let i = 0; i < n; i++) {
    lines.push({
      y: rand() * w,
      amp: w * (0.03 + rand() * 0.09),
      freq: ((0.5 + rand() * 2) * Math.PI * 2) / len,
      phase: rand() * Math.PI * 2,
      alpha: 0.05 + rand() * 0.1,
      width: 0.8 + rand() * 1.6,
      light: rand() < 0.3,
    });
  }
  return { x0, y0, len, w, tint: 0.82 + rand() * 0.3, warm: 0.96 + rand() * 0.08, lines, single };
}

function paintPlank(ctx: Ctx, p: Plank, base: Rgb): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x0, p.y0, p.len, p.w);
  ctx.clip();
  const col: Rgb = [Math.min(255, base[0] * p.tint * p.warm), Math.min(255, base[1] * p.tint), Math.min(255, (base[2] * p.tint) / p.warm)];
  ctx.fillStyle = css(col);
  ctx.fillRect(p.x0, p.y0, p.len, p.w);
  // A plank is slightly crowned: lighter towards one edge, darker towards the other.
  const grad = ctx.createLinearGradient(0, p.y0, 0, p.y0 + p.w);
  grad.addColorStop(0, 'rgba(255,255,255,0.06)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = grad;
  ctx.fillRect(p.x0, p.y0, p.len, p.w);
  ctx.lineCap = 'round';
  for (const g of p.lines) {
    ctx.strokeStyle = g.light ? `rgba(255,220,180,${g.alpha})` : `rgba(20,8,0,${g.alpha})`;
    ctx.lineWidth = g.width;
    ctx.beginPath();
    for (let x = 0; x <= p.len; x += 6) {
      const y = p.y0 + g.y + Math.sin(x * g.freq + g.phase) * g.amp + Math.sin(x * g.freq * 3.1 + g.phase * 2) * g.amp * 0.3;
      if (x === 0) ctx.moveTo(p.x0 + x, y);
      else ctx.lineTo(p.x0 + x, y);
    }
    ctx.stroke();
  }
  if (!p.single) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(p.x0, p.y0 + p.w - 1.5, p.len, 1.5);
    ctx.fillRect(p.x0 + p.len - 1.5, p.y0, 1.5, p.w);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(p.x0, p.y0, p.len, 1);
  }
  ctx.restore();
}

/** Staggered planks (or one grain field) that tile seamlessly. */
export function woodTexture(opts: WoodOptions = {}): CanvasTexture | null {
  const size = opts.size ?? 1024;
  const c = canvas2d(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  const metres = opts.metres ?? WOOD_TILE_M;
  const rand = seededRandom(opts.seed ?? 7);
  const base = rgb(opts.base ?? '#6b4628');
  const rows = Math.max(1, Math.round(metres / (opts.plankWidth ?? 0.1)));
  const rowH = size / rows;
  const perRow = Math.max(1, Math.round(metres / (opts.plankLength ?? 0.8)));
  const len = size / perRow;
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, size, size);
  for (let r = 0; r < rows; r++) {
    // Joints stagger by quarter planks; every offset divides the canvas, so the tile repeats.
    const offset = Math.floor(rand() * 4) * (len / 4);
    for (let k = 0; k < perRow; k++) {
      const plank = makePlank(rand, offset + k * len, r * rowH, len, rowH, rows === 1 && perRow === 1);
      paintPlank(ctx, plank, base);
      // A plank crossing the right edge continues from the left edge.
      if (plank.x0 + len > size) paintPlank(ctx, { ...plank, x0: plank.x0 - size }, base);
    }
  }
  return finish(canvas, { repeat: true, anisotropy: opts.anisotropy });
}

// ---- Rug --------------------------------------------------------------------

export interface RugOptions {
  width?: number;
  height?: number;
  base?: string;
  /** Pattern colours: rust, teal, ochre. */
  colours?: readonly [string, string, string];
  seed?: number;
}

function diamond(ctx: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx + rx, cy);
  ctx.lineTo(cx, cy + ry);
  ctx.lineTo(cx - rx, cy);
  ctx.closePath();
}

/** Cream field with a rust border and staggered rows of small diamonds. */
export function rugTexture(opts: RugOptions = {}): CanvasTexture | null {
  const w = opts.width ?? 1024;
  const h = opts.height ?? 704;
  const c = canvas2d(w, h);
  if (!c) return null;
  const { canvas, ctx } = c;
  const rand = seededRandom(opts.seed ?? 11);
  const [rust, teal, ochre] = opts.colours ?? ['#a9502c', '#2f6b66', '#c7962f'];
  ctx.fillStyle = opts.base ?? '#d3c09a';
  ctx.fillRect(0, 0, w, h);

  const m = Math.round(w * 0.035);
  ctx.lineWidth = Math.round(w * 0.012);
  ctx.strokeStyle = rust;
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  const m2 = m + Math.round(w * 0.022);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(40,30,20,0.55)';
  ctx.strokeRect(m2, m2, w - 2 * m2, h - 2 * m2);

  const cell = w / 16;
  const field = { x0: m2 + cell * 0.45, y0: m2 + cell * 0.45, x1: w - m2 - cell * 0.45, y1: h - m2 - cell * 0.45 };
  const palette = [rust, teal, ochre];
  let row = 0;
  for (let cy = field.y0; cy <= field.y1; cy += cell * 0.72, row++) {
    const shift = row % 2 ? cell / 2 : 0;
    let col = 0;
    for (let cx = field.x0 + shift; cx <= field.x1; cx += cell, col++) {
      const colour = palette[(row * 2 + col) % 3]!;
      const outline = (row + col) % 4 === 1;
      diamond(ctx, cx, cy, cell * 0.22, cell * 0.36);
      ctx.globalAlpha = 0.8;
      if (outline) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = colour;
        ctx.stroke();
      } else {
        ctx.fillStyle = colour;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // a dot between the diamonds
      ctx.fillStyle = 'rgba(40,30,20,0.6)';
      ctx.beginPath();
      ctx.arc(cx + cell / 2, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Weave: faint horizontal lines and fibre speckle over everything.
  ctx.fillStyle = 'rgba(0,0,0,0.045)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  speckle(ctx, w, h, rand, 20000, 0.06);
  return finish(canvas);
}

// ---- Art print --------------------------------------------------------------

/** A mid-century abstract: a big orange disc, a teal half-disc, a mustard bar, a black line. */
export function artTexture(opts: { width?: number; height?: number; seed?: number } = {}): CanvasTexture | null {
  const w = opts.width ?? 512;
  const h = opts.height ?? 640;
  const c = canvas2d(w, h);
  if (!c) return null;
  const { canvas, ctx } = c;
  const rand = seededRandom(opts.seed ?? 13);
  ctx.fillStyle = '#ebe2cc';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d9a63a';
  ctx.fillRect(w * 0.66, h * 0.14, w * 0.16, h * 0.62);
  ctx.fillStyle = '#c8562a';
  ctx.beginPath();
  ctx.arc(w * 0.42, h * 0.38, w * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ebe2cc';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.3, w * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f6b66';
  ctx.beginPath();
  ctx.arc(w * 0.32, h * 0.8, w * 0.24, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1e1a17';
  ctx.fillRect(w * 0.2, h * 0.1, w * 0.012, h * 0.74);
  ctx.beginPath();
  ctx.arc(w * 0.74, h * 0.86, w * 0.04, 0, Math.PI * 2);
  ctx.fill();
  speckle(ctx, w, h, rand, 5000, 0.04);
  return finish(canvas);
}

// ---- Dusk sky ---------------------------------------------------------------

/** Deep blue to an orange horizon, a tree line and a few rooftops with lit windows. */
export function skyTexture(opts: { width?: number; height?: number; seed?: number } = {}): CanvasTexture | null {
  const w = opts.width ?? 256;
  const h = opts.height ?? 512;
  const c = canvas2d(w, h);
  if (!c) return null;
  const { canvas, ctx } = c;
  const rand = seededRandom(opts.seed ?? 17);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#131b32');
  g.addColorStop(0.3, '#2b3c62');
  g.addColorStop(0.55, '#5f5a78');
  g.addColorStop(0.7, '#b6744c');
  g.addColorStop(0.78, '#e39a55');
  g.addColorStop(0.83, '#c27443');
  g.addColorStop(1, '#2a2320');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
    ctx.fillRect(rand() * w, rand() * h * 0.4, 1, 1);
  }
  const horizon = h * 0.8;
  ctx.fillStyle = '#111514';
  ctx.fillRect(0, horizon, w, h - horizon);
  for (let x = -10; x < w + 10; x += 8 + rand() * 10) {
    const r = 8 + rand() * 18;
    ctx.beginPath();
    ctx.arc(x, horizon - r * 0.55, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const bw = 20 + rand() * 30;
    const bh = 14 + rand() * 22;
    const x = rand() * (w - bw);
    ctx.fillStyle = '#141917';
    ctx.fillRect(x, horizon - bh, bw, bh + 4);
    ctx.fillStyle = 'rgba(255,200,120,0.85)';
    for (let k = 0; k < 2; k++) ctx.fillRect(x + 4 + k * 9, horizon - bh + 4, 3, 4);
  }
  return finish(canvas);
}
