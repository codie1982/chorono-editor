import path from 'node:path'
import { prepareFullEditorCheck } from './native-check.mjs'

// Same actual EditorPage/QA pipeline as whole-editor acceptance. Stop Next first.
const output = path.resolve(process.argv[2] ?? 'artifacts/editor-display')
console.log(JSON.stringify(await prepareFullEditorCheck({ entry: 'src/components/editorDisplay/__tests__/browser-editor-display.tsx', output,
  name: 'editor-display', title: 'Chorono responsive editor acceptance' })))
