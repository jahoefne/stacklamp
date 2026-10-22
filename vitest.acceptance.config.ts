import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/acceptance/**/*.test.ts'],
      environment: 'node',
      pool: 'forks',
      testTimeout: 180_000,
      hookTimeout: 180_000,
      server: { deps: { external: [/manifold-3d/] } },
    },
  }),
);
