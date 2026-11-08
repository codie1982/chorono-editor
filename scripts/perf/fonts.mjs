import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {prepareNativeCheck} from './native-check.mjs'

const output=path.resolve(process.argv[2]??'artifacts/performance/opt19-font-ownership-20261107/build')
const files=['src/app/fonts/GeistVF.woff','src/app/fonts/GeistMonoVF.woff'],fixtures=[]
for(const file of files){const bytes=await readFile(file);fixtures.push({name:path.basename(file),url:`data:font/woff;base64,${bytes.toString('base64')}`,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}
const metadata=await prepareNativeCheck({entry:'src/lib/asset/fonts/__tests__/browser-fonts.tsx',output,
 name:'font-check',title:'Chorono font ownership',metadata:{purpose:'Native font scope, readiness, geometry and ownership',fixtures:fixtures.map(({url,...rest})=>rest)}})
await writeFile(path.join(output,'font-fixtures.json'),JSON.stringify(fixtures))
await writeFile(path.join(output,'font-sources.json'),JSON.stringify({...metadata,fixtureSha256:createHash('sha256').update(await readFile(path.join(output,'font-fixtures.json'))).digest('hex')},null,2))
console.log(JSON.stringify({output,sourceFiles:metadata.sources.length}))
