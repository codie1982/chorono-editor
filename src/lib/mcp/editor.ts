import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { AssetElementMap } from '../renderer'
import type { ChronoScene } from '../types'
import { actionRegistry } from '../ai/ActionRegistry'
import { bootstrapMCPActions } from './actions'
import { validateToolCall } from './catalog'
import { assertCloneBudget, assertScene, LIMITS, summarize, type BridgeJob, type JsonObject } from './protocol'
import { ChronoPlayer } from '../player/ChronoPlayer'
import type { OverrideMap } from '../evaluator'
import type { ParamValueMap } from '../runtime/paramResolver'
import {svgInScope} from '../export/vector/SVGOutput'
import { renderSequenceOutput } from '../export/sequence/SequenceExportEngine'
import { defaultRuntimeExporter } from '../export'
import { initImportPipeline, importManager } from '../import/initImportPipeline'
import { ImportTransactionBuilder } from '../import/ImportTransactionBuilder'
import { renderAudioMixInScope, normalizedClipGain } from '../audio/audioRender'
import { makePatchAudioClipCmd } from '../editor/commands-audio'
import { assetSourcePool } from '../asset/sources'
import { releaseImportSources } from '../import/resources/importSources'
import {acquirePortableScene,portableSceneInScope} from '../export/portable'
import {editorOutputResources,outputBase64,outputBlobBase64,outputUtf8,outputJson,type OutputScope} from '../export/resources'
import {previewOutput} from './output/PreviewOutput'
import {runtimePackageInScope} from '../export/runtime/RuntimeOutput'
import {implementationToolName} from './tools/ToolCatalogPolicy'
import {editorDocumentEpoch, assertEditorSourceAuthorization} from './source/EditorSourceIdentity'
import {isSourceMutation} from './source/ToolSourcePolicy'
import {SourceAccessError} from './source/SourceAccessError'
import {summarizeSourceChanges} from './source/SourceChangeSummary'
import {nativeToolArguments} from './source/NativeArguments'

export interface MCPHost {
  editor: EditorStateReturn
  assets: AssetElementMap
  selectedTimelineId: string
  currentTimeMs: number
  isPlaying: boolean
  getLiveFrame: () => { overrides: OverrideMap; paramValues: ParamValueMap }
  getRuntimeState: () => JsonObject
  setRuntimeTest: (active: boolean) => void
  selectTimeline: (id: string) => void
  isolateTimelines: (ids: string[] | null) => void
  seek: (time: number) => void
  playToggle: () => void
  setSpeed: (speed: number) => void
  setParameter: (id: string, value: any) => void
  dispatchEvent: (event: string, machineId?: string) => void
  getAudioState?: () => unknown
}

/** Legacy raw portable-scene handoff; construction is bounded, returned source
 * data is caller-owned outside managed lifetime. Live MCP uses the in-scope
 * converter and retains its output through actual serialized reply settlement. */
export async function portableScene(scene: ChronoScene, fetcher: typeof fetch = fetch): Promise<ChronoScene> {
  const lease=await acquirePortableScene(scene,{fetch:fetcher})
  try{assertScene(lease.value);return lease.value}finally{lease.release()}
}

function filteredScene(scene: ChronoScene, timelineIds?: string[]): ChronoScene {
  if (!timelineIds) return scene
  if (!timelineIds.length || timelineIds.some(id => !scene.timelines.some(t => t.id === id))) throw new Error('Requested timeline does not exist')
  return { ...scene, timelines: scene.timelines.filter(t => timelineIds.includes(t.id)), stateMachines: [] }
}

/** Legacy direct job adapter for embedded callers/tests. Consumers retaining raw
 * output own it after return; browser bridge uses withEditorReply instead. */
export async function executeEditorJob(job:BridgeJob,host:MCPHost,signal?:AbortSignal):Promise<any>{
  const lease=await editorOutputResources.run((scope,native)=>executeEditorJobInScope(job,host,scope,native),{signal})
  try{return lease.value}finally{lease.release()}
}

/** Native command/output dispatch inside an already admitted job. Output steps
 * share its scope; never recursively submit to the same bounded output queue.
 * Mutation semantics, revision checks and serialized protocol remain unchanged. */
export async function executeEditorJobInScope(job: BridgeJob, host: MCPHost, scope:OutputScope,signal?: AbortSignal): Promise<any> {
  await bootstrapMCPActions()
  const { method: requestedMethod, args } = job
  const method = implementationToolName(requestedMethod)
  const { editor } = host
  const before = editor.getScene()
  const revision = editor.getRevision(), documentEpoch = editorDocumentEpoch(editor)
  const transactionActive = editor.isTransactionActive()
  const ensureWritable = () => {
    if (signal?.aborted) throw new Error('MCP connection closed; operation cancelled')
    assertEditorSourceAuthorization(job.sourceAuthorization, { documentEpoch: editorDocumentEpoch(editor), revision: editor.getRevision(), transactionActive: editor.isTransactionActive() })
    if (args.expectedRevision !== job.sourceAuthorization!.expectedRevision) throw new SourceAccessError('SOURCE_REVISION_CONFLICT')
  }
  if (isSourceMutation(method)) ensureWritable()
  return assetSourcePool.withAssets(before.assets, async () => {
    const snapshot = () => ({ scene: before, revision, documentEpoch, transactionActive, selectedTimelineId: host.selectedTimelineId, currentTimeMs: host.currentTimeMs })
    const commit = (next: ChronoScene, label: string) => {
      ensureWritable()
      if (editor.getRevision() !== revision) throw new Error('Scene changed while preparing the operation; read and retry')
      assertScene(next)
      editor.dispatchCommand({ label, execute: () => next, undo: () => before })
      if (!next.timelines.some(t => t.id === host.selectedTimelineId)) host.selectTimeline(next.timelines[0]?.id ?? '')
      return { revision: editor.getRevision(), ...summarize(next), changeSummary: summarizeSourceChanges(before, next),
        addedLayerIds: next.layers.filter(l => !before.layers.some(prev => prev.id === l.id)).map(l => l.id) }
    }
    if (method === 'snapshot') return snapshot()
    if (method === 'portable_snapshot') {
      const scene=await portableSceneInScope(before,scope,signal);assertScene(scene)
      return {...snapshot(),scene}
    }
    if (method === 'apply_scene') return commit(args.scene, args.label ?? 'MCP change')
    await validateToolCall(requestedMethod, args)
    if (method === 'undo' || method === 'redo') {
      ensureWritable(); editor[method](); const next = editor.getScene()
      return { revision: editor.getRevision(), ...summarize(next), changeSummary: summarizeSourceChanges(before, next) }
    }
    if (method === 'control_playback') {
      if (args.timelineIds) {
        if (args.timelineIds.some((id: string) => !before.timelines.some(t => t.id === id))) throw new Error('Timeline not found')
        host.isolateTimelines(args.timelineIds.length ? args.timelineIds : null)
      }
      if (args.timelineId) {
        if (!before.timelines.some(t => t.id === args.timelineId)) throw new Error('Timeline not found')
        host.selectTimeline(args.timelineId)
      }
      if (args.speed !== undefined) host.setSpeed(args.speed)
      if (args.timeMs !== undefined) host.seek(args.timeMs)
      if (args.action === 'stop') { if (host.isPlaying) host.playToggle(); host.seek(0) }
      else if ((args.action === 'play' && !host.isPlaying) || (args.action === 'pause' && host.isPlaying)) host.playToggle()
      return { revision, action: args.action, selectedTimelineId: args.timelineId ?? host.selectedTimelineId, timeMs: args.timeMs ?? host.currentTimeMs }
    }
    if (method === 'control_runtime') {
      if (args.event) {
        const machines = host.getRuntimeState().stateMachines ?? []
        if (!machines.length || (args.machineId && !machines.some((machine: any) => machine.id === args.machineId))) throw new Error('No matching live state machine; restore playback with control_playback timelineIds:[] before dispatching events')
      }
      if (args.testMode !== undefined) host.setRuntimeTest(args.testMode)
      for (const [id, value] of Object.entries(args.parameters ?? {})) {
        if (!before.parameters.some(p => p.id === id)) throw new Error(`Unknown parameter '${id}'`)
        host.setParameter(id, value)
      }
      if (args.event) { host.dispatchEvent(args.event, args.machineId); host.setRuntimeTest(true) }
      return { revision, parameters: args.parameters ?? {}, event: args.event }
    }
    if (method === 'get_runtime') return { revision, currentTimeMs: host.currentTimeMs, isPlaying: host.isPlaying, selectedTimelineId: host.selectedTimelineId, ...host.getRuntimeState() }
    if (method === 'get_audio_state') return { revision, currentTimeMs: host.currentTimeMs, isPlaying: host.isPlaying,
      audio: host.getAudioState?.() ?? { available: false } }
    if (method === 'render_audio_preview' || method === 'export_audio') {
      if (args.expectedRevision !== undefined && args.expectedRevision !== revision) throw new Error(`Scene revision conflict: expected ${args.expectedRevision}, actual ${revision}`)
      const maxDurationMs = method === 'render_audio_preview' ? 10000 : 120000
      const startMs = args.startMs ?? 0
      const rendered = await renderAudioMixInScope(before, { startMs, durationMs: args.durationMs ?? Math.min(maxDurationMs, before.composition.durationMs - startMs),
        timelineIds: args.timelineIds, sampleRate: args.sampleRate, maxDurationMs },scope,signal)
      return { revision, extension: '.wav', data: outputBase64(scope,rendered.bytes,24*1024**2,signal).value, mimeType: rendered.mimeType,
        durationMs: rendered.durationMs, startMs, sampleRate: rendered.sampleRate, channels: rendered.channels,
        frames: rendered.frames, stats: rendered.stats, clips: rendered.clips, warnings: rendered.warnings }
    }
    if (method === 'normalize_audio_clip') {
      ensureWritable()
      const normalized = await normalizedClipGain(before, args.layerId, args.targetDbFS)
      const applied = commit(makePatchAudioClipCmd(args.layerId, { volume: normalized.volume }).execute(before), 'Normalize audio clip')
      return { ...applied, normalization: normalized }
    }
    if (method === 'render_preview' || method === 'evaluate_frame') {
      if (before.stateMachines?.length && !args.timelineIds && (args.timeMs !== undefined || args.parameters)) throw new Error('For deterministic state-machine previews specify timelineIds; omit timeMs/parameters to capture the current live state')
      const scene = filteredScene(before, args.timelineIds)
      const player = new ChronoPlayer(scene, null, { loop: false })
      for (const [id, value] of Object.entries(args.parameters ?? {})) player.setParam(id, value as any)
      const timeMs = args.timeMs ?? host.currentTimeMs
      const frame = args.timeMs === undefined && !args.timelineIds && !args.parameters ? host.getLiveFrame() : player.tick(timeMs)
      if (method === 'evaluate_frame') return { revision, values: Object.fromEntries(frame.overrides), parameters: Object.fromEntries(frame.paramValues) }
      const width = args.width ?? Math.min(1280, scene.composition.width)
      return {revision,...await previewOutput(scene,timeMs,width,frame,scope,signal)}
    }
    if (method === 'validate_scene') {
      assertScene(before)
      try { const runtime = defaultRuntimeExporter.export(before); return { revision, valid: true, warnings: runtime.warnings } }
      catch (error: any) { return { revision, valid: false, errors: error.validation?.errors ?? [(error as Error).message] } }
    }
    if (method === 'export_runtime') {
      const portable = await portableSceneInScope(before,scope,signal)
      const runtime = runtimePackageInScope(portable,scope)
      const json=outputJson(scope,runtime,{space:2,maxBytes:24*1024**2})
      const bytes=outputUtf8(scope,json.value)
      return { revision, extension: '.runtime.json', data: outputBase64(scope,bytes.value,24*1024**2,signal).value, warnings: [
        ...runtime.warnings, ...(before.layers.some(layer => layer.type === 'audio') ? [{ code: 'AUDIO_SEPARATE_OUTPUT', message: 'Runtime JSON is not an audio mix. Use export_audio for a WAV soundtrack.' }] : []),
      ] }
    }
    if (method === 'export_svg') {
      const exported = await svgInScope(before,scope,signal,{ timeMs: args.timeMs ?? 0 })
      const bytes=outputUtf8(scope,exported.svg)
      return { revision, extension: '.svg', data: outputBase64(scope,bytes.value,24*1024**2,signal).value, warnings: exported.warnings }
    }
    if (method === 'export_sequence') {
      const scene = filteredScene(before, args.timelineIds)
      const fps = args.fps ?? scene.composition.frameRate
      if (scene.composition.durationMs * fps / 1000 > 300 || scene.composition.width * scene.composition.height > LIMITS.previewPixels) throw new Error('Sequence limit: at most 300 frames and 4 MP per frame; reduce duration, FPS or resolution')
      const exported = await renderSequenceOutput(scene,{ format:'png',fps },scope,signal,undefined,24*1024**2)
      return { revision, extension: '.zip', data:(await outputBlobBase64(scope,exported.blob,24*1024**2,signal)).value,warnings:exported.warnings }
    }
    if (method === 'import_asset') {
      ensureWritable()
      const bytes = Uint8Array.from(atob(args.data), c => c.charCodeAt(0))
      initImportPipeline()
      const imported = await importManager.importFile(new File([bytes], args.name, { type: args.mimeType }))
      try {
        if (imported.errors.length) throw new Error(imported.errors.map(e => e.message).join('; '))
        return commit(new ImportTransactionBuilder().build(imported, { timelineId: args.timelineId ?? host.selectedTimelineId, startMs: args.startMs ?? host.currentTimeMs }).execute(before), 'MCP import asset')
      } finally { releaseImportSources(imported) }
    }
    const def = actionRegistry.get(method)
    if (def?.read) return { revision, content: def.read(args, before) }
    if (method === 'run_script') throw new Error('Scripts must run in the MCP sandbox')
    ensureWritable()
    const calls = method === 'batch_actions' ? args.actions : [{ name: method, arguments: args }]
    let working = before
    for (const call of calls) {
      await validateToolCall(call.name, call.arguments, { withinBatch: true })
      const implementation = implementationToolName(call.name)
      const action = actionRegistry.get(implementation)
      if (implementation === 'run_script' || !action?.toCommand) throw new Error(`Tool '${call.name}' cannot be used in a native batch`)
      if (implementation === 'bake_track') {
        const tl = working.timelines.find(t => t.id === call.arguments.timelineId)
        if (tl && tl.durationMs * (call.arguments.fps ?? 60) / 1000 > LIMITS.keyframes) throw new Error('Bake sample limit exceeded')
      }
      if (implementation === 'clone_layer' || implementation === 'array_layer') {
        const options = call.arguments
        assertCloneBudget(working, options.layerId, implementation === 'array_layer' && options.pattern === 'grid' ? (options.rows ?? 3) * (options.columns ?? 3) : (options.count ?? (implementation === 'clone_layer' ? 1 : 10)))
      }
      const command = action.toCommand(nativeToolArguments(call.arguments), working)
      if (command?.label.startsWith('AI ERROR')) throw new Error(command.label)
      if (command) working = command.execute(working)
      assertScene(working)
    }
    return commit(working, method === 'batch_actions' ? 'MCP batch' : `MCP ${method}`)
  })
}
