import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
const root=process.cwd(),out=path.resolve(root,'../browser');await mkdir(out,{recursive:true})
for(const [name,entry] of [['packages','src/lib/model3d/__tests__/browser-packages.tsx'],['clips','src/lib/model3d/__tests__/browser-clip-frames.tsx']]){
 await build({absWorkingDir:root,entryPoints:[entry],outfile:path.join(out,name+'.js'),bundle:true,platform:'browser',format:'iife',target:'es2022',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'})
 await writeFile(path.join(out,name+'.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="${name}.css"></head><body><div id="app"></div><script src="${name}.js"></script></body></html>`)
}
console.log(out)
