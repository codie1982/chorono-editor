import { defineConfig } from 'tsup'

// Bundles the framework-free runtime (src/lib/player core) into a distributable
// @chorono/runtime package. Tree-shaking pulls in only the player + the engine
// modules it actually uses (evaluator, statemachine, runtime/*, render/*) — not
// the editor UI. Source of truth stays in chorono-nextjs; the dist is published
// to the separate chorono-runtime repo.
//
// Run: npm run build:runtime
export default defineConfig({
  entry: { 'chorono-runtime': 'src/lib/player/index.ts' },
  outDir: 'dist/runtime',
  format: ['esm', 'cjs', 'iife'],
  globalName: 'Chorono',       // HTML export expects window.Chorono
  platform: 'browser',
  target: 'es2020',
  // Next.js tsconfig sets incremental:true which conflicts with tsup's dts tsc
  // pass — disable it just for the declaration build.
  dts: { compilerOptions: { incremental: false } },
  clean: true,
  minify: true,
  treeshake: true,
  sourcemap: true,
})
