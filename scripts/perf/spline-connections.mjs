import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Stop Next first. Standalone QA origin, no user's scene/session storage.
console.log(JSON.stringify(await prepareFullEditorCheck({
  entry: 'src/components/splineEdit/__tests__/browser-spline-connections.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/spline-connections'), name: 'spline-connections', title: 'Chorono spline vertex connection acceptance',
})))
