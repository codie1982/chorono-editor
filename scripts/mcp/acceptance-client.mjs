import path from 'node:path'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createInterface} from 'node:readline'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'

/** Interactive QA transport for an isolated real editor. Script strings are
 * passed unchanged to run_script's QuickJS bridge; never evaluated by Node.
 * Explicit saved read labels retain one-use authority in this client's memory,
 * without automatic refresh/retry. Reports redact credentials; native image
 * blocks become PNG artifacts. EOF/close terminates the actual SDK connection. */
const [directory,urlArg,target]=process.argv.slice(2)
assert(directory&&urlArg&&target,'Usage: node scripts/mcp/acceptance-client.mjs isolated-root editor-url output')
const root=path.resolve(directory),output=path.resolve(target),origin=new URL(urlArg)
assert(root.startsWith('/private/tmp/chorono-'),'Use a disposable source snapshot')
assert(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname),'Use a loopback editor')
await mkdir(output,{recursive:true})
const client=new Client({name:'Chorono E17 acceptance',version:'2.1.0'})
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'dist/mcp/server.cjs')],cwd:root,
  stderr:'pipe',env:{...process.env,CHORONO_PROJECT_ROOT:root,CHORONO_EDITOR_URL:origin.origin,CHORONO_MCP_TOOL_PROFILE:'standard'}})
const reads=new Map()
// macOS canonical terminal lines are limited to 1024 bytes, shorter than a
// valid SceneAPI script request. Read JSON lines directly without terminal echo;
// the transport still receives plain strings and never evaluates their code.
const terminal=process.stdin.isTTY
if(terminal)process.stdin.setRawMode(true)
/** Remove capability credentials recursively from persisted/printed receipts. */
function sanitized(value){return JSON.parse(JSON.stringify(value,(key,item)=>['readToken','token','connectionToken'].includes(key)?undefined:item))}
try{
  await client.connect(transport)
  console.log(JSON.stringify({ready:true,editor:origin.origin,source:root}))
  for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
    try{
      const request=JSON.parse(line)
      if(request.close)break
      assert(/^[A-Za-z0-9_-]{1,80}$/.test(request.id),'Bounded request artifact ID required')
      let reply
      if(request.resource)reply=await client.readResource({uri:request.resource})
      else{
        const args={...request.arguments}
        if(request.useRead){const read=reads.get(request.useRead);assert(read,'Read label not found');Object.assign(args,{expectedRevision:read.revision,readToken:read.readToken})}
        reply=await client.callTool({name:request.tool,arguments:args},undefined,{timeout:130000})
      }
      const text=reply.content?.find(item=>item.type==='text')?.text
      let data;try{data=text?JSON.parse(text):undefined}catch{data=text}
      if(request.readAs&&data?.readToken)reads.set(request.readAs,{revision:data.revision,readToken:data.readToken})
      const images=[]
      for(const block of reply.content??[])if(block.type==='image'){
        const imagePath=path.join(output,request.id+'-'+images.length+'.png');await writeFile(imagePath,Buffer.from(block.data,'base64'));images.push(imagePath)
      }
      const result=sanitized(request.resource?reply:data??reply)
      await writeFile(path.join(output,request.id+'.json'),JSON.stringify({isError:reply.isError??false,result,images},null,2)+'\n')
      const printed=result?.scene?{...result,scene:{composition:result.scene.composition,layers:result.scene.layers.length,timelines:result.scene.timelines.length}}:result
      console.log(JSON.stringify({id:request.id,isError:reply.isError??false,result:printed,images,heldRead:request.readAs&&reads.has(request.readAs)?request.readAs:undefined}))
    }catch(error){console.log(JSON.stringify({error:String(error)}))}
  }
}finally{if(terminal)process.stdin.setRawMode(false);await client.close()}
