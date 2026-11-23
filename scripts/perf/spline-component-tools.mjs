import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Prepare only with Next stopped. No user scene, route or application injection.
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-component-tools.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-component-tools'), name: 'spline-component-tools', title: 'Chorono spline component tools' })))
