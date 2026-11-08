import path from 'node:path'
import {readFile,writeFile,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {prepareNativeCheck} from './native-check.mjs'
const root=process.cwd(),output=path.resolve(process.argv[2]??'artifacts/performance/opt20-frame-cost-20261107/build')
const snapshot=path.resolve('artifacts/performance/opt20-frame-cost-20261107/source-before/src/lib/render/materializeOverrides.ts.snapshot')
const transformProof={}
/** Build-time trusted-source substitution; the production preparer/renderer
 * files stay unchanged. AA selects the same exact function and host twice. */
const plugin={name:'same-realm-projection',setup(api){
 api.onResolve({filter:/^projection-reference$/},()=>({path:snapshot}))
 api.onLoad({filter:/\.snapshot$/},async args=>({contents:await readFile(args.path,'utf8'),loader:'ts',resolveDir:path.resolve('src/lib/render')}))
 api.onResolve({filter:/^projection-strategy$/},()=>({path:path.resolve('src/lib/resources/benchmark/__tests__/projectionStrategy.ts')}))
 api.onLoad({filter:/[\\/]prepareRenderFrame\.ts$/},async args=>{
  const source=await readFile(args.path,'utf8'),needle="from './materializeOverrides'"
  if(source.split(needle).length!==2)throw new Error('Unexpected preparer projection import.')
  const contents=source.replace(needle,"from 'projection-strategy'")
  Object.assign(transformProof,{path:path.relative(root,args.path),originalSha256:createHash('sha256').update(source).digest('hex'),transformedSha256:createHash('sha256').update(contents).digest('hex')})
  return {contents,loader:'ts',resolveDir:path.dirname(args.path)}
 })
}}
const metadata=await prepareNativeCheck({entry:'src/lib/resources/benchmark/__tests__/browser-same-realm.ts',output,name:'same-realm',title:'Same-realm frame comparison',plugins:[plugin],metadata:{transformProof}})
await copyFile('projects/chorono-four-seasons-48s-v1.chorono.json',path.join(output,'four-seasons.chorono.json'))
await writeFile(path.join(output,'same-realm-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sourceFiles:metadata.sources.length,transformProof}))
