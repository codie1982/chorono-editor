import {build} from 'esbuild'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import path from 'node:path'

/** Bundle only the collector regression for a separate explicit-GC Node process.
 * Never attaches to Chrome, reads browser state or changes production GC settings.
 * Saves exit status/stdout and input hashes even for the expected pre-fix failure.
 */
const output=path.resolve(process.argv[2]??'artifacts/performance/monitor-retention')
await mkdir(output,{recursive:true})
const entry=path.join(output,'monitor-retention.cjs')
const bundle=await build({entryPoints:['src/lib/resources/monitor/__tests__/node-monitor-retention.ts'],
  outfile:entry,bundle:true,platform:'node',target:'node20',format:'cjs',metafile:true,
  tsconfig:'tsconfig.json',logLevel:'silent'})
const sources=[]
for(const file of Object.keys(bundle.metafile.inputs).sort())sources.push({path:file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})
const child=spawnSync(process.execPath,['--expose-gc',entry],{encoding:'utf8',timeout:15000})
const receipt={exitCode:child.status,signal:child.signal,stdout:child.stdout,stderr:child.stderr,error:child.error?.message,sources}
await writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2))
console.log(JSON.stringify({output,exitCode:child.status,stdout:child.stdout,stderr:child.stderr?.slice(0,1000)}))
process.exitCode=child.status??1
