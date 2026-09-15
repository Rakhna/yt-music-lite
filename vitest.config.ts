import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
      include: [
        'server/utils.js',
        'server/app.js',
        'client/src/utils.ts',
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        'server/index.js',
        'client/src/main.ts',
      ],
    },
  },
});
