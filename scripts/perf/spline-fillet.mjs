import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Private QA source/origin; user session and recovery store are never touched.
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-fillet.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-fillet'), name: 'spline-fillet', title: 'Chorono spline Fillet acceptance' })))
