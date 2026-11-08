import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'
import {prepareNativeCheck} from './native-check.mjs'

const root=process.cwd(),output=path.resolve(process.argv[2]??'artifacts/performance/opt18-gpu-ownership-20261107/build')
const reference=path.resolve('artifacts/performance/opt18-gpu-ownership-20261107/source-before')
const files={
 'gpu-reference-image':'src/lib/render/gpu/effects/GPUImageEffects.ts',
 'gpu-reference-motion':'src/lib/render/gpu/effects/GPUMotionBlur.ts',
 'gpu-reference-particle':'src/lib/render/gpu/particles/WebGLInstancedQuadBackend.ts',
}
/** Immutable pre-change algorithms, resolved against their original dependency
 * directory. This is standalone test build substitution, never browser eval. */
const plugin={name:'gpu-reference',setup(api){
 api.onResolve({filter:/^gpu-reference-/},args=>({path:path.join(reference,files[args.path]+'.snapshot')}))
 api.onLoad({filter:/\.snapshot$/},async args=>({contents:await readFile(args.path,'utf8'),loader:'ts',
  resolveDir:path.dirname(path.join(root,path.relative(reference,args.path).replace(/\.snapshot$/,'')))}))
}}
const metadata=await prepareNativeCheck({entry:'src/lib/render/gpu/resources/__tests__/browser-gpu-ownership.mjs',output,
 name:'gpu-check',title:'Chorono GPU resource ownership',plugins:[plugin],metadata:{purpose:'Native GPU ownership, admission and exact pixel checks'}})
await writeFile(path.join(output,'gpu-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sourceFiles:metadata.sources.length}))
