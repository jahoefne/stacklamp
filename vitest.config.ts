import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.ts'],
      // Node by default; component tests opt in with `// @vitest-environment jsdom`.
      environment: 'node',
      // One process per test file: each gets its own WASM heap.
      pool: 'forks',
      testTimeout: 60_000,
      hookTimeout: 60_000,
      // Let Node load the Emscripten glue (and find manifold.wasm next to it) natively.
      server: { deps: { external: [/manifold-3d/] } },
    },
  }),
);
