import {execFileSync} from 'node:child_process'
import {readFile,writeFile,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {prepareNativeCheck} from './native-check.mjs'

const output=path.resolve(process.argv[2]??'artifacts/performance/opt30-editor-acceptance-20261108/build')
// Uses the actual EditorPage dependency graph and existing native QA bundler;
// no alternate editor or production debugging route is installed.
const metadata=await prepareNativeCheck({entry:'src/lib/resources/benchmark/__tests__/browser-editor-acceptance.tsx',
  output,name:'editor-acceptance',title:'Chorono whole-editor acceptance',format:'esm',
  plugins:[{name:'local-welcome-font',setup(api){
    api.onResolve({filter:/^\/fonts\/GeistVF\.woff$/},()=>({path:'./GeistVF.woff',external:true}))
  }}],
  metadata:{scope:'Actual production EditorPage with normal UI import/actions. Numeric ownership/heap/RAF telemetry only; no backend/MCP or forced GC.'}})
const fixture='projects/chorono-four-seasons-48s-v1.chorono.json',bytes=await readFile(fixture)
await copyFile(fixture,path.join(output,'four-seasons.chorono.json'))
metadata.fixture={path:fixture,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),layers:JSON.parse(bytes).layers.length}
await copyFile('public/fonts/GeistVF.woff',path.join(output,'GeistVF.woff'))
metadata.welcomeFontSha256=createHash('sha256').update(await readFile(path.join(output,'GeistVF.woff'))).digest('hex')
// Same utility-CSS compilation used by the existing UI virtualization QA.
execFileSync(path.resolve('node_modules/.bin/tailwindcss'),['-i','src/app/globals.css','-o',path.join(output,'editor-base.css'),'--minify'],{stdio:'pipe'})
metadata.baseCssSha256=createHash('sha256').update(await readFile(path.join(output,'editor-base.css'))).digest('hex')
const html=await readFile(path.join(output,'editor-acceptance.html'),'utf8')
await writeFile(path.join(output,'editor-acceptance.html'),html.replace('</head>','<link rel="stylesheet" href="editor-base.css"></head>'))
await writeFile(path.join(output,'editor-acceptance-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,sources:metadata.sources.length,bundleSha256:metadata.bundleSha256}))
