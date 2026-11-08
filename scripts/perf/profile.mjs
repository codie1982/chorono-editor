import {build} from 'esbuild'
import ts from 'typescript'
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root=process.cwd(),output=path.resolve(process.argv[2]??'artifacts/performance/opt6-roi-cpu-20261107/before-build')
const mode=process.argv[3]??'roi'
if(!['roi','frame'].includes(mode))throw new Error('Profile mode must be roi or frame')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),transformed=[]
const selected={
 'src/lib/evaluator.ts':['evaluateTimelines'],
 'src/lib/renderer.ts':['drawBezierPath','drawShape'],
 'src/lib/particles/runtime/ParticleSpawner.ts':['computeSpawnParams'],
 'src/lib/render/renderers/ParticleRendererPlugin.ts':['renderParticles','renderParticlesGPU'],
 'src/lib/render/media/VisualDemandResolver.ts':['resolve'],
 'src/lib/render/media/projectFrameFonts.ts':['projectFrameFonts','projectFrameFontOverrides'],
 'src/lib/render/media/NativeDemandBranches.ts':['select'],
 'src/lib/render/prepareRenderFrame.ts':['prepareRenderFrame'],
 'src/lib/render/visibility/PaintFrame.ts':['reject'],
 'src/lib/render/CanvasRenderer.ts':['render'],
 'src/lib/render/resources/planLayerSurfaceRegion.ts':['planLayerSurfaceRegion'],
 'src/lib/render/resources/LayerSurfacePipeline.ts':['render'],
 'src/lib/render/resources/CanvasSurfacePool.ts':['acquire','resizeIdle'],
 'src/lib/render/gpu/effects/GPUImageEffects.ts':['blur','ensureSize'],
 'src/lib/effects/ShadowEffect.ts':['renderShadow'],
 'src/lib/geometry/resolveLayerWorldMatrix.ts':['resolveLayerWorldMatrix'],
 'src/lib/render/materializeOverrides.ts':['materializeRenderScene'],
}
/** Test-only AST instrumentation. Production files remain unchanged. Timings
 * include probe overhead, so use this to locate cost, never acceptance p50. */
const instrument={name:'stage-profile',setup(api){api.onLoad({filter:/\.ts$/},async args=>{
 const relative=path.relative(root,args.path),names=selected[relative];if(!names)return
 const source=await readFile(args.path,'utf8'),ast=ts.createSourceFile(args.path,source,ts.ScriptTarget.Latest,true),edits=[]
 const visit=node=>{
  if((ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node))&&node.name&&node.body&&names.includes(node.name.getText(ast))){
   const label=relative+':'+node.name.getText(ast)
   edits.push([node.body.getStart(ast)+1,'const __stageStarted=performance.now();try{'])
   edits.push([node.body.end-1,'}finally{__stageRecord('+JSON.stringify(label)+',performance.now()-__stageStarted)}'])
  }
  ts.forEachChild(node,visit)
 };visit(ast)
 let contents=source;for(const [at,text]of edits.sort((a,b)=>b[0]-a[0]))contents=contents.slice(0,at)+text+contents.slice(at)
 contents='import {recordStage as __stageRecord} from '+JSON.stringify(path.join(root,'src/lib/resources/benchmark/__tests__/stageTrace.ts'))+';\n'+contents
 transformed.push({path:relative,originalSha256:hash(source),transformedSha256:hash(contents)})
 return {contents,loader:'ts',resolveDir:path.dirname(args.path)}
})}}
await mkdir(output,{recursive:true})
const bundle=await build({absWorkingDir:root,entryPoints:['src/lib/resources/benchmark/__tests__/browser-stage-profile.ts'],bundle:true,platform:'browser',target:'es2022',minify:true,plugins:[instrument],metafile:true,tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"',__PROFILE_MODE__:JSON.stringify(mode)},outfile:path.join(output,'stage-profile.js')})
await writeFile(path.join(output,'stage-profile.html'),'<!doctype html><html><head><meta charset="utf-8"><title>ROI stage profile</title></head><body><script src="stage-profile.js"></script></body></html>')
await copyFile(path.join(root,'projects/chorono-four-seasons-48s-v1.chorono.json'),path.join(output,'four-seasons.chorono.json'))
const sources=[]
for(const file of Object.keys(bundle.metafile.inputs).sort())sources.push({path:file,sha256:hash(await readFile(file))})
await writeFile(path.join(output,'stage-profile-sources.json'),JSON.stringify({mode,sources,transformed,bundleSha256:hash(await readFile(path.join(output,'stage-profile.js'))),sceneSha256:hash(await readFile(path.join(output,'four-seasons.chorono.json')))},null,2))
