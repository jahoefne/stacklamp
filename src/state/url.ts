/**
 * Share URL for a code: page origin + Vite base (`/stacklamp/`) + `#code`. Outside a
 * browser (Node tests, CLI) it falls back to the public site.
 */
export const PUBLIC_URL = 'https://jahoefne.github.io/stacklamp/';

function baseUrl(): string {
  const base = import.meta.env?.BASE_URL ?? '/stacklamp/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function shareUrl(code: string): string {
  const origin = typeof location !== 'undefined' && typeof location.origin === 'string' ? location.origin : '';
  return origin.startsWith('http') ? `${origin}${baseUrl()}#${code}` : `${PUBLIC_URL}#${code}`;
}
