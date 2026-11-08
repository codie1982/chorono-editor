import path from 'node:path'
import {readFile,writeFile,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {prepareNativeCheck} from './native-check.mjs'

const output=path.resolve(process.argv[2]??'artifacts/performance/opt29-output-integration-20261108/build')
const references={'integration-before-svg':'src/lib/export/vector/SVGExporter.ts','integration-before-html':'src/lib/export/html/htmlExport.ts','integration-before-runtime':'src/lib/export/runtimeExport.ts'}
const plugin={name:'frozen-text-output-reference',setup(api){
  api.onResolve({filter:/^integration-before-/},args=>({path:path.resolve('artifacts/performance/opt29-output-integration-20261108/source-before',references[args.path]+'.snapshot')}))
  api.onLoad({filter:/\.snapshot$/},async args=>{
    const original=Object.values(references).find(file=>args.path.endsWith(file+'.snapshot'))
    if(!original)throw new Error('Unknown text output reference')
    return {contents:await readFile(args.path,'utf8'),loader:'ts',resolveDir:path.resolve(path.dirname(original))}
  })
}}
const metadata=await prepareNativeCheck({entry:'src/lib/export/__tests__/browser-output-integration.tsx',output,name:'output-integration',title:'Chorono native output integration',format:'esm',development:true,plugins:[plugin],
  metadata:{scope:'Actual OPFS/FileSystemWritableFileStream, production StrictMode hooks/JSON modal, native SVG decode and actual download. Existing shared 512 MiB policy.',reference:'Frozen stage-before SVG/HTML/legacy runtime text sources. Common geometry/evaluator dependencies remain shared.'}})
const fixture='projects/chorono-four-seasons-48s-v1.chorono.json',bytes=await readFile(fixture)
await copyFile(fixture,path.join(output,'four-seasons.chorono.json'))
metadata.fixtureSha256=createHash('sha256').update(bytes).digest('hex')
metadata.fixture={source:fixture,sourceBytes:bytes.length,layers:JSON.parse(bytes).layers.length}
await writeFile(path.join(output,'output-integration-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sources:metadata.sources.length,bundleSha256:metadata.bundleSha256}))
