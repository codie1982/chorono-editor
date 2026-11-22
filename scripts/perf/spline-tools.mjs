import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Private native UI/worker acceptance; prepare with Next stopped.
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-tools.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-tools'), name: 'spline-tools', title: 'Chorono native spline Edit tools' })))
