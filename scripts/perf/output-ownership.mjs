import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'
import {prepareNativeCheck} from './native-check.mjs'

const output=path.resolve(process.argv[2]??'artifacts/performance/opt29-output-ownership-20261108/build')
const references={
  'legacy-raster-reference':'src/lib/export/raster/RasterExportEngine.ts',
  'legacy-audio-reference':'src/lib/audio/audioRender.ts',
}
const plugin={name:'immutable-output-reference',setup(api){
  api.onResolve({filter:/^legacy-(raster|audio)-reference$/},args=>({path:path.resolve('artifacts/performance/opt29-output-ownership-20261108/source-before',references[args.path]+'.snapshot')}))
  api.onLoad({filter:/\.snapshot$/},async args=>{
    const relative=Object.values(references).find(file=>args.path.endsWith(file+'.snapshot'))
    if(!relative)throw new Error('Unknown output reference')
    return {contents:await readFile(args.path,'utf8'),loader:'ts',resolveDir:path.resolve(path.dirname(relative))}
  })
}}
const metadata=await prepareNativeCheck({entry:'src/lib/export/__tests__/browser-output.tsx',output,name:'output-ownership',title:'Chorono native output ownership',plugins:[plugin],format:'esm',development:true,
  metadata:{scope:'Actual native raster/ZIP/audio, bounded portable/JSON output and production StrictMode hook/panel. Uses editor shared 512 MiB budget with finite 448 MiB output subset.',reference:'Stage-before raster/audio snapshots captured before OPT29; common media/renderer shared. Delivery gate holds completed native output.'}})
await writeFile(path.join(output,'output-ownership-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,bundleSha256:metadata.bundleSha256,sources:metadata.sources.length}))
