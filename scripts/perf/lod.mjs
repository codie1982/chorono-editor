import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {prepareNativeCheck} from './native-check.mjs'

const output=path.resolve(process.argv[2]??'artifacts/performance/opt30-editor-acceptance-20261108/build-hud')
const metadata=await prepareNativeCheck({entry:'src/lib/render/lod/__tests__/browser-check.ts',output,
  name:'lod-export',title:'Native LOD and full-detail output',format:'esm',
  metadata:{scope:'Existing native LOD regression plus actual PNG/ZIP output from original layers with the same global LOD cache already warm.'}})
await writeFile(path.join(output,'lod-export-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sources:metadata.sources.length}))
