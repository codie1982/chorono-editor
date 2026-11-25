import { prepareFullEditorCheck } from './native-check.mjs'
import path from 'node:path'

// Stop Next before preparing. Uses production components and a private document.
console.log(JSON.stringify(await prepareFullEditorCheck({
  entry: 'src/components/splineEdit/__tests__/browser-mesh-face-edit.tsx',
  output: path.resolve(process.argv[2] ?? '/tmp/chorono-mesh-face-qa'),
  name: 'mesh-face-edit', title: 'Mesh Vertex Edge Face acceptance',
})))
