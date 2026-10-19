import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0, manifest: true },
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['default', ['json', { outputFile: 'reports/vitest.json' }]],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/player/flight.ts', 'src/activities/**', 'src/world/city-data.ts', 'src/world/city-mesh.ts', 'src/world/terrain.ts', 'src/world/env-data.ts', 'src/world/streets.ts', 'src/world/landcover.ts', 'src/world/karl.ts', 'src/world/moon.ts', 'src/world/trees.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 75 },
    },
  },
});
