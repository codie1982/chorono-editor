import path from 'node:path'
import {readFile,writeFile,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {prepareNativeCheck} from './native-check.mjs'

const output=path.resolve(process.argv[2]??'artifacts/performance/opt28-media-preflight-20261108/build')
const reference=path.resolve('artifacts/performance/opt28-media-preflight-20261108/source-before/src/lib/text/GlyphOutlineExtractor.ts.snapshot')
const plugin={name:'immutable-outline-reference',setup(api){
  api.onResolve({filter:/^legacy-outline-reference$/},()=>({path:reference}))
  api.onLoad({filter:/GlyphOutlineExtractor\.ts\.snapshot$/},async()=>({contents:await readFile(reference,'utf8'),loader:'ts',resolveDir:path.resolve('src/lib/text')}))
}}
const metadata=await prepareNativeCheck({entry:'src/lib/asset/metadata/__tests__/browser-media-preflight.tsx',output,
  name:'media-preflight',title:'Chorono native media admission',plugins:[plugin],format:'esm',development:true,
  metadata:{scope:'Actual native image/video/audio/font/outline and production sprite modal. Private 512 MiB ledger, existing shared-job contract; post-native delivery gates.',
    reference:'Pre-OPT28 GlyphOutlineExtractor preserved from unchanged HEAD; SVG/2D geometry helpers shared unchanged.'}})
await copyFile('public/fonts/GeistVF.woff',path.join(output,'native-font.woff'))
metadata.fixtureSha256=createHash('sha256').update(await readFile(path.join(output,'native-font.woff'))).digest('hex')
await writeFile(path.join(output,'media-preflight-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sources:metadata.sources.length,bundleSha256:metadata.bundleSha256}))
