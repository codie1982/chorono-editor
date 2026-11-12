import path from 'node:path'
import {readFile,copyFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {prepareNativeCheck} from './native-check.mjs'

/** Compile complete immutable before/after trees with the same QA builder.
 * No partial source substitution, authoring, Next cache or running app changes.
 * Inputs are explicit local checkouts; prepare snapshots with git archive and
 * retain their revision receipts. Each child's realm owns its own resources. */
const [beforeArg,afterArg,outputArg]=process.argv.slice(2)
if(!beforeArg||!afterArg||!outputArg)throw new Error('Usage: node scripts/perf/pre3d-comparison.mjs before-root after-root output')
const output=path.resolve(outputArg),metadata={}
const roots={before:path.resolve(beforeArg),after:path.resolve(afterArg)}
let fixtureHash
for(const [version,sourceRoot] of Object.entries(roots)){
  const fixture=await readFile(path.join(sourceRoot,'projects/chorono-four-seasons-48s-v1.chorono.json'))
  const hash=createHash('sha256').update(fixture).digest('hex')
  if(fixtureHash&&fixtureHash!==hash)throw new Error('Before/after fixtures differ')
  fixtureHash=hash
  metadata[version]=await prepareNativeCheck({sourceRoot,output,entry:'src/lib/resources/benchmark/__tests__/browser-paired-child.ts',
    name:'paired-'+version,title:'Chorono '+version+' sparse frame host',metadata:{revision:JSON.parse(await readFile(path.join(sourceRoot,'source-revision.json'),'utf8')).revision}})
}
metadata.host=await prepareNativeCheck({sourceRoot:roots.after,output,entry:'src/lib/resources/benchmark/__tests__/browser-paired.ts',name:'paired',title:'Chorono pre-3D paired acceptance'})
metadata.fixtureSha256=fixtureHash
await copyFile(path.join(roots.after,'projects/chorono-four-seasons-48s-v1.chorono.json'),path.join(output,'paired-four-seasons.chorono.json'))
await writeFile(path.join(output,'paired-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,fixtureSha256:fixtureHash,before:metadata.before.revision,after:metadata.after.revision}))
