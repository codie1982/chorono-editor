import path from 'node:path'
import { prepareFullEditorCheck } from './native-check.mjs'

// Isolated real EditorPage acceptance; stop Next first, as for editor-display.
console.log(JSON.stringify(await prepareFullEditorCheck({
  entry: 'src/components/layerHierarchy/__tests__/browser-layer-selection.tsx',
  output: path.resolve(process.argv[2] ?? 'artifacts/layer-selection'),
  name: 'layer-selection', title: 'Chorono layer selection acceptance',
})))
