import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    // jsdom is heavier and only needed for component / DOM tests.
    // Pure algorithm tests (geometry, path, registry) run in plain node.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/geometry/**/*.ts',
        'src/lib/path/**/*.ts',
        'src/lib/registry/**/*.ts',
        'src/lib/editor/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/index.ts',
        '**/bootstrap.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
