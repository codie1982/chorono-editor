import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'

const [normalPath,reversedPath,output]=process.argv.slice(2)
if(!normalPath||!reversedPath||!output)throw new Error('Usage: node scripts/perf/merge-paired.mjs normal.json reversed.json output.json')
const inputs=await Promise.all([normalPath,reversedPath].map(async file=>{const bytes=await readFile(file);return {file,sha256:createHash('sha256').update(bytes).digest('hex'),report:JSON.parse(bytes)}}))
const [normal,reversed]=inputs.map(input=>input.report)
// Old paired hosts had only normal creation/placement order and no layout field.
if((normal.environment.layout??'normal')!=='normal'||reversed.environment.layout!=='reversed')throw new Error('One normal and one reversed layout are required.')
for(const report of [normal,reversed])if(report.kind!=='paired-sparse-baseline'||report.status!=='complete'||report.pairs.length!==60||report.checkpoints.length!==6||report.checkpoints.some(row=>!row.equal))throw new Error('Both complete 60-pair / six-pixel-check reports are required.')
if(normal.sceneSha256!==reversed.sceneSha256||JSON.stringify(normal.protocol)!==JSON.stringify(reversed.protocol))throw new Error('Scene or protocol differs.')
for(const side of ['before','after'])if(normal.build[side].bundleSha256!==reversed.build[side].bundleSha256)throw new Error('Compared bundle identity differs between layouts.')
// Compile the authoritative TypeScript utility as a temporary module instead
// of requiring Node's newer native TS loader or duplicating the statistics.
const statsSource=fileURLToPath(new URL('../../src/lib/resources/performance/sampleStatistics.ts',import.meta.url))
const temporary=await mkdtemp(path.join(os.tmpdir(),'chorono-paired-statistics-'))
let summarizeNumbers
try{
 const moduleFile=path.join(temporary,'statistics.mjs')
 await build({entryPoints:[statsSource],outfile:moduleFile,bundle:true,platform:'node',format:'esm',target:'node20'})
 ;({summarizeNumbers}=await import(pathToFileURL(moduleFile).href))
}finally{await rm(temporary,{recursive:true,force:true})}
const pairs=inputs.flatMap(({report})=>report.pairs.map(pair=>({...pair,layout:report.environment.layout??'normal'})))
/** Shared nearest-rank summaries; combine raw samples, never average quantiles. */
function summarize(side){
 const values=key=>pairs.map(pair=>pair[side][key])
 return {evaluationMs:summarizeNumbers(values('evaluationMs')),renderMs:summarizeNumbers(values('renderMs')),
  frameCpuMs:summarizeNumbers(pairs.map(pair=>pair[side].evaluationMs+pair[side].renderMs)),
  knownBytes:summarizeNumbers(values('knownBytes'))}
}
const result={kind:'mirrored-paired-diagnostic',status:'complete',inputs:inputs.map(({report,...input})=>input),
 statisticsSourceSha256:createHash('sha256').update(await readFile(statsSource)).digest('hex'),
 legacyNormalLayout:normal.environment.layout===undefined,identicalBundles:normal.build.before.bundleSha256===normal.build.after.bundleSha256,sceneSha256:normal.sceneSha256,protocol:normal.protocol,
 before:summarize('before'),after:summarize('after'),pairs,
 limitations:['Timings remain device/load sensitive; an A/A control is required before interpreting small differences.',
 'Two placements balance realm creation/order, not whole-editor/player or OS/process RAM scope.']}
await writeFile(output,JSON.stringify(result,null,2))
console.log(JSON.stringify({output,identicalBundles:result.identicalBundles,before:result.before.frameCpuMs,after:result.after.frameCpuMs}))
