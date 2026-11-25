import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Only the disposable QA origin is prepared; stop Next before compiling.
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-modifiers.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-modifiers'), name: 'spline-modifiers', title: 'Chorono static spline modifiers' })))
