import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Separate QA origin, source and worker; no user session/persistence mutations.
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-outline.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-outline'), name: 'spline-outline', title: 'Chorono spline Outline acceptance' })))
