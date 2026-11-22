import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Private QA source/origin; user session and recovery store are never touched.
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-chamfer.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-chamfer'), name: 'spline-chamfer', title: 'Chorono spline Chamfer acceptance' })))
