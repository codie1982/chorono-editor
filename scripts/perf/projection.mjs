import path from 'node:path'
import {readFile,writeFile,copyFile} from 'node:fs/promises'
import {prepareNativeCheck} from './native-check.mjs'
const output=path.resolve(process.argv[2]??'artifacts/performance/opt20-frame-cost-20261107/build')
const snapshot=path.resolve('artifacts/performance/opt20-frame-cost-20261107/source-before/src/lib/render/materializeOverrides.ts.snapshot')
const plugins=[{name:'projection-reference',setup(api){
 api.onResolve({filter:/^projection-reference$/},()=>({path:snapshot}))
 api.onLoad({filter:/\.snapshot$/},async args=>({contents:await readFile(args.path,'utf8'),loader:'ts',resolveDir:path.resolve('src/lib/render')}))
}}]
const metadata=await prepareNativeCheck({entry:'src/lib/render/__tests__/browser-projection-cost.ts',output,name:'projection-cost',title:'Projection cost',plugins})
await copyFile('projects/chorono-four-seasons-48s-v1.chorono.json',path.join(output,'four-seasons.chorono.json'))
await writeFile(path.join(output,'projection-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sourceFiles:metadata.sources.length}))
