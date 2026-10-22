import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE } from '../../src/state/palette';

/** The state palette and the design tokens must carry the same nine PETG colours. */
describe('PETG palette vs design tokens', () => {
  it('--petg-<id> tokens match DEFAULT_PALETTE hexes', () => {
    const css = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');
    for (const c of DEFAULT_PALETTE) {
      const m = new RegExp(`--petg-${c.id}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      expect(m, `token --petg-${c.id}`).not.toBeNull();
      expect(m![1]!.toLowerCase(), c.id).toBe(c.hex.toLowerCase());
    }
  });
});
