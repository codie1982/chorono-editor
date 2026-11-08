import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {prepareNativeCheck} from './native-check.mjs'

const output=path.resolve(process.argv[2]??'artifacts/performance/opt30-editor-acceptance-20261108/build')
const metadata=await prepareNativeCheck({entry:'src/lib/resources/benchmark/__tests__/browser-native-av.ts',output,
  name:'native-av',title:'Native editor A/V acceptance',format:'esm'})
metadata.fixtures=await Promise.all(['native-sync.webm','native-sync.wav'].map(async file=>{
  const bytes=await readFile(path.join(output,file));return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
}))
await writeFile(path.join(output,'native-av-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sources:metadata.sources.length}))
