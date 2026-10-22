import { describe, expect, it } from 'vitest';

// Vitest blanks CSS modules (even `?raw`), so read the files from disk. The app tsconfig has no
// Node types, hence the untyped specifier.
const fsId = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fsId)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
};
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const fontsCss = readFileSync(new URL('./fonts.css', import.meta.url), 'utf8');

/** The names the UI, preview and illustrations consume. Every one must exist in :root. */
const CONTRACT = [
  '--color-paper', '--color-paper-2', '--color-ink', '--color-ink-2', '--color-line',
  '--color-inverse', '--color-inverse-ink', '--color-accent', '--color-accent-ink',
  '--color-focus', '--color-danger', '--color-warning', '--color-ok',
  '--block-1', '--block-2', '--block-3', '--block-4', '--block-5', '--block-6',
  '--stage-bg', '--stage-floor', '--stage-led', '--stage-part', '--stage-rod',
  '--stage-glow-strength', '--stage-bloom',
  '--font-display', '--font-body', '--font-mono',
  '--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-display',
  '--lh-tight', '--lh-body',
  '--fw-regular', '--fw-medium', '--fw-bold', '--fw-black',
  '--tracking-label',
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5',
  '--space-6', '--space-7', '--space-8', '--space-9', '--space-10',
  '--radius-0', '--radius-sm', '--radius-md', '--radius-pill',
  '--border-thin', '--border-bold',
  '--shadow-block', '--shadow-pop',
  '--focus-ring',
  '--dur-fast', '--dur-base', '--dur-slow', '--ease-out', '--ease-in-out',
  '--z-header', '--z-popover', '--z-toast',
  '--layout-max', '--panel-width', '--preview-min-h',
] as const;

const PETG_IDS = ['clr', 'smk', 'amb', 'org', 'red', 'vio', 'blu', 'tea', 'grn'] as const;
const HEX = /^#[0-9a-f]{6}$/i;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Declarations of the first top-level `:root { … }` block (the one outside any @media). */
function rootDeclarations(css: string): Map<string, string> {
  const src = stripComments(css);
  const start = src.search(/(^|\n)\s*:root\s*\{/);
  expect(start, 'tokens.css has a top-level :root block').toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', start);
  const close = src.indexOf('}', open);
  const body = src.slice(open + 1, close);
  const out = new Map<string, string>();
  for (const decl of body.split(';')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(decl);
    if (!m) continue;
    const [, name, value] = m;
    expect(out.has(name!), `${name} is defined once`).toBe(false);
    out.set(name!, value!);
  }
  return out;
}

const tokens = rootDeclarations(tokensCss);

describe('tokens.css', () => {
  it.each(CONTRACT)('defines %s', (name) => {
    expect(tokens.get(name), `${name} missing from :root`).toBeTruthy();
  });

  it.each(PETG_IDS)('defines the PETG palette colour --petg-%s as hex', (id) => {
    expect(tokens.get(`--petg-${id}`)).toMatch(HEX);
  });

  it('keeps stage colours as plain hex and stage numbers as plain numbers', () => {
    for (const name of ['--stage-bg', '--stage-floor', '--stage-led', '--stage-part', '--stage-rod']) {
      expect(tokens.get(name), name).toMatch(HEX);
    }
    for (const name of ['--stage-glow-strength', '--stage-bloom']) {
      const n = Number(tokens.get(name));
      expect(Number.isFinite(n), name).toBe(true);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(2);
    }
  });

  it('only references custom properties that exist', () => {
    for (const [name, value] of tokens) {
      for (const ref of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        expect(tokens.has(ref[1]!), `${name} references undefined ${ref[1]}`).toBe(true);
      }
    }
  });

  it('zeroes all durations under prefers-reduced-motion', () => {
    const src = stripComments(tokensCss);
    const m = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(src);
    expect(m, 'reduced-motion block').not.toBeNull();
    for (const name of ['--dur-fast', '--dur-base', '--dur-slow']) {
      expect(m![1]).toMatch(new RegExp(`${name}\\s*:\\s*0m?s\\s*;`));
    }
  });
});

describe('fonts.css', () => {
  const woff2 = Object.keys(import.meta.glob('../fonts/*.woff2'));

  it('declares the two families named in --font-display and --font-body', () => {
    expect(fontsCss).toMatch(/font-family:\s*'Jost'/);
    expect(fontsCss).toMatch(/font-family:\s*'Space Grotesk'/);
    expect(tokens.get('--font-display')).toMatch(/^'Jost'/);
    expect(tokens.get('--font-body')).toMatch(/^'Space Grotesk'/);
  });

  it('points every @font-face at a relative woff2 that exists', () => {
    const urls = [...fontsCss.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const url of urls) {
      expect(url.startsWith('../fonts/'), url).toBe(true);
      expect(woff2, url).toContain(url);
    }
  });
});
