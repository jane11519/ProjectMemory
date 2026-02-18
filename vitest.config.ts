import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**'],
      thresholds: {
        lines: 80,
        branches: 75,
      },
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@config': path.resolve(__dirname, 'src/config'),
    },
  },
});
