import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Prepare with Next stopped; serve only this disposable acceptance origin.
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-point-tools.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-point-tools'), name: 'spline-point-tools', title: 'Chorono spline Point and Edge tools' })))
