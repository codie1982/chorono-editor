import { AuthoringHintCollector } from '../editor/authoring/AuthoringHints'
import { commandAuthoringHints } from '../editor/authoring/AuthoringCommand'
import type { AuthoringHints } from '../types/authoring'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { AssetElementMap } from '../renderer'
import type { ChronoScene } from '../types'
import { actionRegistry } from '../ai/ActionRegistry'
import { bootstrapMCPActions } from './actions'
import { validateToolCall } from './catalog'
import { assertCloneBudget, assertScene, LIMITS, summarize, type BridgeJob, type JsonObject, type Snapshot } from './protocol'
import { ChronoPlayer } from '../player/ChronoPlayer'
import type { OverrideMap } from '../evaluator'
import type { ParamValueMap } from '../runtime/paramResolver'
import {svgInScope} from '../export/vector/SVGOutput'
import { renderSequenceOutput } from '../export/sequence/SequenceExportEngine'
import { renderRasterFrame } from '../export/raster/renderRasterFrame'
import { probeChoronoRender, transferToChoronoRender } from '../export/choronoRender/ChoronoRenderBridge'
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
import type { AgentHandoffContext } from '../agentHandoff/prompt'
import type { LayerSelection } from '../selection/layerSelection'
import { captureSceneSelection } from './selection/SceneSelection'
import {
  prepareMCPRigidBake,
  prepareMCPVoronoiBake,
  type MCPRigidBakeInput,
  type MCPVoronoiBakeInput,
} from './bake/MCPRigidBake'
import { mcpPhysicsBakeJobs } from './bake/MCPPhysicsBakeJobManager'
import { makeClearRigidBakeCmd } from '../editor/commands-rigid-bake-lifecycle'
import { RigidBakeOwnershipInspector } from '../physics/RigidBakeOwnership'
import { FractureRenderColliderAnalyzer } from '../fracture/FractureRenderColliderAnalyzer'

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
  getAgentHandoff?: (id: string) => AgentHandoffContext | undefined
  /** Borrow the current UI selection synchronously. Omit for embedded hosts
   * without selection support; their snapshot reports selected:null. */
  getLayerSelection?: () => LayerSelection
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
  const readsSnapshot = method === 'snapshot' || method === 'get_handoff_context' || method === 'portable_snapshot'
  const selected = readsSnapshot ? captureSceneSelection(before, host.getLayerSelection?.()) : null
  const ensureWritable = () => {
    if (signal?.aborted) throw new Error('MCP connection closed; operation cancelled')
    assertEditorSourceAuthorization(job.sourceAuthorization, { documentEpoch: editorDocumentEpoch(editor), revision: editor.getRevision(), transactionActive: editor.isTransactionActive() })
    if (args.expectedRevision !== job.sourceAuthorization!.expectedRevision) throw new SourceAccessError('SOURCE_REVISION_CONFLICT')
  }
  if (isSourceMutation(method)) ensureWritable()
  return assetSourcePool.withAssets(before.assets, async () => {
    const snapshot = (): Snapshot => ({ scene: before, revision, documentEpoch, transactionActive, selectedTimelineId: host.selectedTimelineId, currentTimeMs: host.currentTimeMs, selected })
    const commit = (next: ChronoScene, label: string, hints: AuthoringHints = {}) => {
      ensureWritable()
      if (editor.getRevision() !== revision) throw new Error('Scene changed while preparing the operation; read and retry')
      assertScene(next)
      editor.dispatchCommand({ label, execute: () => next, undo: () => before, authoring: { ...hints,
        mode: job.sourceAuthorization?.sourceMode ?? hints.mode, stamp: job.sourceAuthorization?.authoring } })
      if (!next.timelines.some(t => t.id === host.selectedTimelineId)) host.selectTimeline(next.timelines[0]?.id ?? '')
      return { revision: editor.getRevision(), ...summarize(next), changeSummary: summarizeSourceChanges(before, next),
        addedLayerIds: next.layers.filter(l => !before.layers.some(prev => prev.id === l.id)).map(l => l.id) }
    }
    if (method === 'snapshot') return snapshot()
    if (method === 'get_handoff_context') {
      if (transactionActive) throw new SourceAccessError('SOURCE_EDITOR_BUSY')
      const focus = host.getAgentHandoff?.(args.handoffId)
      if (!focus || focus.sessionId !== args.sessionId || focus.documentEpoch !== documentEpoch ||
          focus.sceneId !== before.composition.id ||
          focus.layers.some(layer => !before.layers.some(current => current.id === layer.id)) ||
          (focus.timelineId && !before.timelines.some(timeline => timeline.id === focus.timelineId))) {
        throw new Error('Agent handoff expired or its document/target changed; create a new handoff')
      }
      return { ...snapshot(), focus }
    }
    if (method === 'portable_snapshot') {
      const scene=await portableSceneInScope(before,scope,signal);assertScene(scene)
      return {...snapshot(),scene}
    }
    if (method === 'apply_scene') return commit(args.scene, args.label ?? 'MCP change', args.authoringHints ?? {})
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
    if (method === 'render_2d') {
      const scene = filteredScene(before, args.timelineIds)
      const intent = args.intent as 'still' | 'video'
      const fps = args.fps ?? scene.composition.frameRate
      const scale = args.scale ?? 1
      const background = args.background ?? 'scene'
      const outputWidth = Math.round(scene.composition.width * scale)
      const outputHeight = Math.round(scene.composition.height * scale)
      const frameCount = intent === 'still' ? 1 : Math.max(1, Math.round(scene.composition.durationMs / 1000 * fps))
      if (!Number.isSafeInteger(scale) || outputWidth * outputHeight > LIMITS.previewPixels) {
        throw new Error('2D render limit: use an integer scale and at most 4,194,304 output pixels per frame')
      }
      const requestedBackend = args.backend ?? 'auto'
      const status = requestedBackend === 'builtin'
        ? { available: false, message: 'Built-in renderer selected.' }
        : await probeChoronoRender(signal)
      if (requestedBackend === 'chorono' && !status.available) throw new Error(status.message)
      const useChorono = requestedBackend !== 'builtin' && status.available
      if (useChorono) {
        if (outputWidth > 4096 || outputHeight > 4096) throw new Error('Chorono Render accepts dimensions up to 4096 px')
        if (intent === 'video' && (outputWidth % 2 !== 0 || outputHeight % 2 !== 0)) throw new Error('MP4 requires even pixel dimensions')
        if (frameCount > 1800) throw new Error('Chorono Render accepts at most 1800 frames per transfer')
        const exported = await renderSequenceOutput(scene, {
          format: 'png', fps, scale, background,
          ...(intent === 'still' ? { startTimeMs: args.timeMs ?? host.currentTimeMs, frameCount: 1 } : {}),
        }, scope, signal)
        const transfer = await transferToChoronoRender(exported.blob, {
          title: args.name ?? (scene.composition.id.trim() || 'Chorono 2D scene'),
          fps,
          intent: intent === 'still' ? 'still' : 'mp4',
        }, signal)
        return { revision, backend: 'chorono', intent, artifact: intent === 'still' ? 'png' : 'mp4',
          frameCount: transfer.frameCount, transfer, warnings: exported.warnings }
      }
      if (intent === 'still') {
        const rendered = await renderRasterFrame(scene, {
          format: 'png', timeMs: args.timeMs ?? host.currentTimeMs, scale, background,
        }, scope, signal)
        return { revision, backend: 'builtin', intent, artifact: 'png', frameCount: 1,
          width: rendered.width, height: rendered.height, extension: '.png',
          data: (await outputBlobBase64(scope, rendered.blob, 24 * 1024 ** 2, signal)).value,
          warnings: [...rendered.warnings, ...(requestedBackend === 'auto' ? [status.message] : [])] }
      }
      if (frameCount > 300) throw new Error('Built-in MCP video render accepts at most 300 frames; reduce duration or FPS, or start Chorono Render')
      const exported = await renderSequenceOutput(scene, { format: 'png', fps, scale, background }, scope, signal, undefined, 24 * 1024 ** 2)
      return { revision, backend: 'builtin', intent, artifact: 'png-sequence', frameCount: exported.frameCount,
        extension: '.zip', data: (await outputBlobBase64(scope, exported.blob, 24 * 1024 ** 2, signal)).value,
        warnings: [...exported.warnings, ...(requestedBackend === 'auto' ? [status.message] : [])] }
    }
    if (method === 'prepare_rigid_body_bake' || method === 'prepare_voronoi_fracture_bake') {
      ensureWritable()
      const bakeJob = method === 'prepare_rigid_body_bake'
        ? mcpPhysicsBakeJobs.startRigid(editor, args as unknown as MCPRigidBakeInput)
        : mcpPhysicsBakeJobs.startVoronoi(editor, args as unknown as MCPVoronoiBakeInput)
      return { revision, bakeJob }
    }
    if (method === 'get_bake_job') {
      return { revision: editor.getRevision(), bakeJob: mcpPhysicsBakeJobs.status(args.jobId) }
    }
    if (method === 'preview_bake_job') {
      return { revision: editor.getRevision(), preview: mcpPhysicsBakeJobs.preview(args.jobId, args.timeMs) }
    }
    if (method === 'cancel_bake_job') {
      return { revision: editor.getRevision(), bakeJob: mcpPhysicsBakeJobs.cancel(args.jobId) }
    }
    if (method === 'discard_bake_job') {
      return { revision: editor.getRevision(), discarded: true, bakeJob: mcpPhysicsBakeJobs.discard(args.jobId) }
    }
    if (method === 'inspect_physics_bake') {
      const inspection = new RigidBakeOwnershipInspector().inspect(before, args.recordId)
      const fractureEvent = inspection.record.recipe.fractureEvents?.[0]
      const fractureEvents = inspection.record.recipe.fractureEvents ?? []
      const fractureHierarchy = inspection.record.recipe.fractureHierarchy
      const cluster = inspection.record.recipe.fractureClusters?.[0]
      const bondBreakEvents = inspection.record.recipe.fractureBondBreakEvents ?? []
      const renderColliderQuality = fractureEvent
        ? new FractureRenderColliderAnalyzer().analyzeCommittedEvent(before, inspection.record.id)
        : undefined
      return { revision, bake: {
        recordId: inspection.record.id,
        mode: inspection.mode,
        ownershipState: inspection.ownershipState,
        sourceState: inspection.sourceState,
        canSafelyMutate: inspection.canSafelyMutate,
        trackCount: inspection.record.tracks.length,
        generatedLayerCount: inspection.record.generatedLayers?.length ?? 0,
        generationId: inspection.generation?.generationId,
        generationCount: inspection.generations?.length ?? (inspection.generation ? 1 : 0),
        ...(fractureEvent ? { topologyEvent: {
          sourceBodyId: fractureEvent.sourceBodyId,
          fragmentBodyIds: fractureEvent.fragmentBodyIds,
          localTimeMs: fractureEvent.timeMs,
          absoluteTimeMs: inspection.record.recipe.startTimeMs + fractureEvent.timeMs,
          tick: fractureEvent.tick,
        }, topologyEvents: fractureEvents.map(event => ({
          eventId: event.id,
          sourceBodyId: event.sourceBodyId,
          fragmentBodyIds: event.fragmentBodyIds,
          localTimeMs: event.timeMs,
          absoluteTimeMs: inspection.record.recipe.startTimeMs + event.timeMs,
          tick: event.tick,
        })), renderColliderQuality } : {}),
        ...(fractureHierarchy ? { recursiveHierarchy: {
          rootGenerationId: fractureHierarchy.rootGenerationId,
          entries: fractureHierarchy.entries,
          limits: fractureHierarchy.limits,
          usage: fractureHierarchy.usage,
          hierarchyHash: fractureHierarchy.hierarchyHash,
        } } : {}),
        ...(cluster ? { bondedCluster: {
          graphId: cluster.graph.graphId,
          strategy: cluster.strategy,
          fragmentCount: cluster.graph.fragmentIds.length,
          bondCount: cluster.graph.bonds.length,
          manualBondCount: cluster.graph.bonds.filter(bond => bond.origin === 'manual').length,
          unbreakableBondCount: cluster.graph.bonds.filter(bond => bond.unbreakable).length,
          forcedBreakCount: cluster.forcedBreaks?.length ?? 0,
          damageResetCount: cluster.damageResets?.length ?? 0,
          breakCount: bondBreakEvents.length,
          splitCount: bondBreakEvents.filter(event => event.componentIds.length > 1).length,
          defaults: cluster.graph.defaults,
          forcedBreaks: cluster.forcedBreaks ?? [],
          damageResets: cluster.damageResets ?? [],
          breakEvents: bondBreakEvents,
        } } : {}),
        issues: inspection.issues,
      } }
    }
    if (method === 'clear_physics_bake') {
      ensureWritable()
      const command = makeClearRigidBakeCmd({
        recordId: args.recordId,
        conflictPolicy: args.discardEdited ? 'discard-edits' : 'reject',
      })
      return commit(command.execute(before), command.label, commandAuthoringHints(command))
    }
    if (method === 'commit_bake_job') {
      ensureWritable()
      let applied: ReturnType<typeof commit> | undefined
      const bakeJob = await mcpPhysicsBakeJobs.commit(args.jobId, command => {
        applied = commit(command.execute(before), command.label, commandAuthoringHints(command))
      }, args.replaceEdited ? 'discard-edits' : 'reject')
      if (!applied) throw new Error('Bake job did not publish an editor command')
      return { ...applied, bakeJob }
    }
    if (method === 'bake_rigid_bodies' || method === 'bake_voronoi_fracture') {
      ensureWritable()
      const baked = method === 'bake_rigid_bodies'
        ? await prepareMCPRigidBake(before, args as unknown as MCPRigidBakeInput, signal)
        : await prepareMCPVoronoiBake(before, args as unknown as MCPVoronoiBakeInput, signal)
      const applied = commit(baked.scene, method === 'bake_rigid_bodies' ? 'MCP rigid body bake' : 'MCP Voronoi fracture bake')
      return { ...applied, bake: {
        recipeHash: baked.recipeHash,
        report: baked.report,
        ...(baked.generationId ? {
          generationId: baked.generationId,
          fragmentCount: baked.fragmentCount,
          generationCount: baked.generationCount,
          totalFragmentCount: baked.totalFragmentCount,
        } : {}),
      } }
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
    const authoring = new AuthoringHintCollector()
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
      if (command) { working = command.execute(working); authoring.add(commandAuthoringHints(command)) }
      assertScene(working)
    }
    return commit(working, method === 'batch_actions' ? 'MCP batch' : `MCP ${method}`, authoring.hints)
  })
}
