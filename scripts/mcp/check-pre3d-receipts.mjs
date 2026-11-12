import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'

/** Recheck the recorded real UI/MCP flow without contacting any editor or
 * evaluating scripts. Receipts are produced by acceptance-client.mjs and native
 * UI automation; this verifier never substitutes a fabricated actor/source.
 * Pass the E17 receipt directory. All comparisons include stable IDs/easing;
 * only the explicitly permitted source field is changed in expected snapshots.
 */
const directory=path.resolve(process.argv[2]??'artifacts/validation/pre3d-e17-20261112')
const read=async name=>JSON.parse(await readFile(path.join(directory,name+'.json'),'utf8'))
const scene=async name=>{const receipt=await read(name);assert(!receipt.isError,name);return receipt.result.scene}
const before=await scene('e17-stale-read'),human=await scene('e17-human'),agent=await scene('e17-after-agent')
const byName=(value,name)=>{const layer=value.layers.find(item=>item.name===name);assert(layer,name);return layer}
const clock=byName(human,'Clock / human time'),route=byName(human,'Clock / editable route'),marker=byName(human,'Clock / motion marker')
const writer=(value,id,field)=>value.authoring.records[JSON.stringify(['layer',id])].fields[JSON.stringify(field)].actor.kind
assert.equal(clock.text.value,'09:05');assert.equal(writer(human,clock.id,['text','value']),'human')
assert.notDeepEqual(route.path,byName(before,'Clock / editable route').path)
assert.equal(writer(human,route.id,['path','anchors']),'human')
const keyTrack=value=>value.timelines.find(item=>item.id==='clock-motion').tracks.find(item=>item.target===`layers.${marker.id}.transform.x`)
assert.equal(keyTrack(human).keyframes[0].easing.type,'easeInOut')
assert.equal(keyTrack(human).keyframes[0].id,keyTrack(before).keyframes[0].id)
const rejected=await read('e17-stale-rejected')
assert(rejected.isError);assert.equal(rejected.result.error.code,'SOURCE_REVISION_CONFLICT')
const expected=structuredClone(human);byName(expected,'Clock / human time').text.color='#fbbf24'
const {authoring:_humanLedger,...expectedSource}=expected,{authoring:_agentLedger,...agentSource}=agent
assert.deepEqual(agentSource,expectedSource)
assert.equal(writer(agent,clock.id,['text','value']),'human');assert.equal(writer(agent,clock.id,['text','color']),'agent')
assert.deepEqual(await scene('e17-after-undo'),human)
assert.deepEqual(await scene('e17-after-redo'),agent)
assert.deepEqual(await scene('e17-loaded'),agent)
const runtime=await read('human-preserved.runtime');assert(!Object.hasOwn(runtime.runtime,'authoring'))
const keys=await scene('e17-set-key')
for(const timeline of agent.timelines)for(const track of timeline.tracks)for(const key of track.keyframes){
  const current=keys.timelines.find(item=>item.id===timeline.id).tracks.find(item=>item.target===track.target).keyframes.find(item=>item.id===key.id)
  assert.deepEqual(current,key)
}
const edited=await scene('e17-sine-edited'),restored=await scene('e17-restored'),undone=await scene('e17-restored-undone'),redone=await scene('e17-restored-redone')
assert.deepEqual(restored,edited);assert.deepEqual(redone,edited)
const signal=byName(edited,'Signal / sine control')
const signalTrack=value=>value.timelines.find(item=>item.id==='clock-motion').tracks.find(item=>item.target===`layers.${signal.id}.transform.x`)
assert.equal(signalTrack(edited).controller,undefined);assert.equal(signalTrack(edited).keyframes.length,25)
assert(signalTrack(edited).keyframes.every(key=>key.easing.type==='linear'))
assert.equal(signalTrack(edited).keyframes[0].value,102);assert.equal(signalTrack(undone).keyframes[0].value,100)
const expectedUndo=structuredClone(edited);signalTrack(expectedUndo).keyframes[0].value=100
const {authoring:_undoLedger,...undoSource}=undone,{authoring:_expectedLedger,...expectedUndoSource}=expectedUndo
assert.deepEqual(undoSource,expectedUndoSource)
const result={passed:true,checks:['Human clock, native handle and easing recorded','Stale revision rejected','Fresh agent edit changes only color and preserves human attribution',
  'Exact Undo/Redo and portable source','Runtime omits editor ledger','Multi Set Key retains all original key IDs/easing',
  'Sine baked to 25 normal keys and edited natively','Reload exact source and persisted Undo/Redo'],scope:'Recorded real isolated production editor. No new editor mutations.'}
await writeFile(path.join(directory,'verified.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
