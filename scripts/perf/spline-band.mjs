import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-band.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-band'), name: 'spline-band', title: 'Chorono Outline / Stroke to Path' })))
