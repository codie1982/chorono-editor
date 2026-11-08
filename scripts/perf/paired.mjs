import {build} from 'esbuild'
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root=process.cwd(),out=path.resolve(process.argv[2]??'artifacts/performance/opt6-roi-cpu-20261107')
const compiledBefore=process.argv[3]?path.resolve(process.argv[3]):null
const snapshots=['src/lib/geometry/resolveLayerWorldMatrix.ts','src/lib/render/resources/planLayerSurfaceRegion.ts','src/lib/render/gpu/effects/GPUImageEffects.ts',
 'src/lib/render/CanvasRenderer.ts','src/lib/render/visibility/PaintFrame.ts','src/lib/render/materializeOverrides.ts']
const common={absWorkingDir:root,bundle:true,platform:'browser',target:'es2022',minify:true,tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}}
const hashes={}
await mkdir(out,{recursive:true})
await copyFile(compiledBefore?path.join(compiledBefore,'paired-four-seasons.chorono.json'):path.join(out,'before-build/four-seasons.chorono.json'),path.join(out,'paired-four-seasons.chorono.json'))
/** Compile the same test adapter against immutable before vs current runtime
 * sources. This is build-time source substitution, never browser eval/authoring. */
for(const version of ['before','after']){
 if(version==='before'&&compiledBefore){
  // Preserve an already verified immutable child bundle, not a reconstruction
  // from a newer dirty worktree. The reference protocol is the same child ABI.
  const metadata=JSON.parse(await readFile(path.join(compiledBefore,'paired-sources.json'),'utf8')).after
  const bytes=await readFile(path.join(compiledBefore,'paired-after.js'))
  if(createHash('sha256').update(bytes).digest('hex')!==metadata.bundleSha256)throw new Error('Archived paired reference digest differs')
  await writeFile(path.join(out,'paired-before.js'),bytes)
  hashes.before={...metadata,compiledReference:path.relative(root,compiledBefore)}
  await writeFile(path.join(out,'paired-before.html'),'<!doctype html><html><body><script src="paired-before.js"></script></body></html>')
  continue
 }
 const inputs=[]
 const plugin={name:'paired-sources',setup(api){api.onLoad({filter:/\.ts$/},async args=>{
  const rel=path.relative(root,args.path);if(!rel.startsWith('src/'))return
  const file=version==='before'&&snapshots.includes(rel)?path.join(out,'source-before',rel+'.snapshot'):args.path
  const contents=await readFile(file,'utf8');inputs.push({path:rel,sha256:createHash('sha256').update(contents).digest('hex')})
  return {contents,loader:'ts',resolveDir:path.dirname(args.path)}
 })}}
 const outfile=path.join(out,`paired-${version}.js`)
 await build({...common,entryPoints:['src/lib/resources/benchmark/__tests__/browser-paired-child.ts'],plugins:[plugin],outfile})
 hashes[version]={bundleSha256:createHash('sha256').update(await readFile(outfile)).digest('hex'),sources:inputs.sort((a,b)=>a.path.localeCompare(b.path))}
 await writeFile(path.join(out,`paired-${version}.html`),`<!doctype html><html><body><script src="paired-${version}.js"></script></body></html>`)
}
const host=await build({...common,entryPoints:['src/lib/resources/benchmark/__tests__/browser-paired.ts'],metafile:true,outfile:path.join(out,'paired.js')})
const hostSources=[]
for(const file of Object.keys(host.metafile.inputs).sort())hostSources.push({path:file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})
hashes.host={bundleSha256:createHash('sha256').update(await readFile(path.join(out,'paired.js'))).digest('hex'),sources:hostSources}
await writeFile(path.join(out,'paired.html'),'<!doctype html><html><head><meta charset="utf-8"><title>Paired renderer comparison</title></head><body><script src="paired.js"></script></body></html>')
await writeFile(path.join(out,'paired-sources.json'),JSON.stringify(hashes,null,2))
