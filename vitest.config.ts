import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    conditions: ['development', 'node', 'import', 'default'],
    alias: {
      '@post/core': path.join(rootDir, 'packages/core/src/index.ts'),
      '@post/video': path.join(rootDir, 'packages/video/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts', 'apps/**/tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
