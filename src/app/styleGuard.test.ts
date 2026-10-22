/**
 * Design-system guard: component styles (CSS Modules under src/ui and src/app) reference
 * tokens only. Raw colours live in src/ui/styles/tokens.css (and the illustrations).
 */
import { describe, expect, it } from 'vitest';

// Vitest blanks CSS modules (even `?raw`), so read the files from disk. The app tsconfig has
// no Node types, hence the untyped specifier.
const fsId = 'node:fs';
const fs = (await import(/* @vite-ignore */ fsId)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
  readdirSync(path: URL, opts: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};

const ROOT = new URL('../../', import.meta.url);
const DIRS = [new URL('src/ui/', ROOT), new URL('src/app/', ROOT)];

function cssModules(dir: URL): URL[] {
  const out: URL[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...cssModules(new URL(`${entry.name}/`, dir)));
    else if (entry.name.endsWith('.module.css')) out.push(new URL(entry.name, dir));
  }
  return out;
}

const RAW_COLOUR = [
  { name: 'hex colour', re: /#[0-9a-f]{3,8}\b/gi },
  { name: 'rgb()/rgba()', re: /\brgba?\s*\(/gi },
  { name: 'hsl()/hsla()', re: /\bhsla?\s*\(/gi },
];

/** Raw colour literals in a stylesheet (comments ignored). */
export function findRawColours(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const hits: string[] = [];
  for (const { name, re } of RAW_COLOUR) for (const m of code.matchAll(re)) hits.push(`${name}: ${m[0]}`);
  return hits;
}

describe('CSS Modules use design tokens only', () => {
  const files = DIRS.flatMap(cssModules);

  it('finds the component stylesheets', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('flags raw colours (self-test)', () => {
    expect(findRawColours('.a { color: #fff; background: rgb(0 0 0); border-color: hsl(0 0% 0%); }')).toHaveLength(3);
    expect(findRawColours('/* #fff */ .a { color: var(--color-ink); }')).toEqual([]);
  });

  it.each(files.map((f) => [f.href.slice(ROOT.href.length), f] as const))('%s has no raw hex/rgb/hsl colour', (_, file) => {
    expect(findRawColours(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });
});
