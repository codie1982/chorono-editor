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
import { canvasRenderer } from '../render/CanvasRenderer'
import { exportSVG } from '../export/vector/SVGExporter'
import { exportSequence } from '../export/sequence/SequenceExportEngine'
import { defaultRuntimeExporter } from '../export'
import { initImportPipeline, importManager } from '../import/initImportPipeline'
import { ImportTransactionBuilder } from '../import/ImportTransactionBuilder'

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
}

function asBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)))
  return btoa(binary)
}
const blobBase64 = async (blob: Blob) => asBase64(new Uint8Array(await blob.arrayBuffer()))

export async function portableScene(scene: ChronoScene): Promise<ChronoScene> {
  const copy = structuredClone(scene)
  for (const asset of copy.assets) {
    if (asset.url.startsWith('blob:')) {
      const response = await fetch(asset.url)
      if (!response.ok) throw new Error(`Unable to package asset '${asset.name}'`)
      const blob = await response.blob()
      if (blob.size > 16 * 1024 * 1024) throw new Error(`Asset '${asset.name}' exceeds portable media limit (16 MB)`)
      asset.url = `data:${blob.type || 'application/octet-stream'};base64,${await blobBase64(blob)}`
      asset.storage = { ...asset.storage, mode: 'embedded' }
    }
    delete asset.runtime
  }
  assertScene(copy)
  return copy
}

function filteredScene(scene: ChronoScene, timelineIds?: string[]): ChronoScene {
  if (!timelineIds) return scene
  if (!timelineIds.length || timelineIds.some(id => !scene.timelines.some(t => t.id === id))) throw new Error('Requested timeline does not exist')
  return { ...scene, timelines: scene.timelines.filter(t => timelineIds.includes(t.id)), stateMachines: [] }
}

async function previewAssets(scene: ChronoScene, cached: AssetElementMap) {
  const assets = new Map(cached)
  await Promise.all(scene.assets.filter(a => ['image', 'spriteSheet'].includes(a.type)).map(asset => new Promise<void>((resolve, reject) => {
    const current = assets.get(asset.id)
    if (current instanceof HTMLImageElement && current.getAttribute('src') === asset.url && current.complete && current.naturalWidth) return resolve()
    const image = new Image()
    image.crossOrigin = 'anonymous'
    const timer = setTimeout(() => reject(new Error(`Asset '${asset.name}' did not load`)), 8000)
    image.onload = () => { clearTimeout(timer); assets.set(asset.id, image); resolve() }
    image.onerror = () => { clearTimeout(timer); reject(new Error(`Asset '${asset.name}' failed to load (check URL/CORS)`)) }
    image.src = asset.url
  })))
  return assets
}

export async function executeEditorJob(job: BridgeJob, host: MCPHost, signal?: AbortSignal): Promise<any> {
  await bootstrapMCPActions()
  const { method, args } = job
  const { editor } = host
  const before = editor.getScene()
  const revision = editor.getRevision()
  const snapshot = () => ({ scene: before, revision, selectedTimelineId: host.selectedTimelineId, currentTimeMs: host.currentTimeMs })
  const ensureWritable = () => {
    if (signal?.aborted) throw new Error('MCP connection closed; operation cancelled')
    if (editor.isTransactionActive()) throw new Error('Editor drag transaction is active; retry after it finishes')
    if (args.expectedRevision !== undefined && args.expectedRevision !== editor.getRevision()) throw new Error(`Scene revision conflict: expected ${args.expectedRevision}, actual ${editor.getRevision()}`)
  }
  const commit = (next: ChronoScene, label: string) => {
    ensureWritable()
    if (editor.getRevision() !== revision) throw new Error('Scene changed while preparing the operation; read and retry')
    assertScene(next)
    editor.dispatchCommand({ label, execute: () => next, undo: () => before })
    if (!next.timelines.some(t => t.id === host.selectedTimelineId)) host.selectTimeline(next.timelines[0]?.id ?? '')
    return { revision: editor.getRevision(), ...summarize(next), addedLayerIds: next.layers.filter(l => !before.layers.some(prev => prev.id === l.id)).map(l => l.id) }
  }
  if (method === 'snapshot') return snapshot()
  if (method === 'portable_snapshot') return { ...snapshot(), scene: await portableScene(before) }
  if (method === 'apply_scene') return commit(args.scene, args.label ?? 'MCP change')
  await validateToolCall(method, args)
  if (method === 'undo' || method === 'redo') { ensureWritable(); editor[method](); return { revision: editor.getRevision(), ...summarize(editor.getScene()) } }
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
  if (method === 'render_preview' || method === 'evaluate_frame') {
    if (before.stateMachines?.length && !args.timelineIds && (args.timeMs !== undefined || args.parameters)) throw new Error('For deterministic state-machine previews specify timelineIds; omit timeMs/parameters to capture the current live state')
    const scene = filteredScene(before, args.timelineIds)
    const player = new ChronoPlayer(scene, null, { loop: false })
    for (const [id, value] of Object.entries(args.parameters ?? {})) player.setParam(id, value as any)
    const timeMs = args.timeMs ?? host.currentTimeMs
    const frame = args.timeMs === undefined && !args.timelineIds && !args.parameters ? host.getLiveFrame() : player.tick(timeMs)
    if (method === 'evaluate_frame') return { revision, values: Object.fromEntries(frame.overrides), parameters: Object.fromEntries(frame.paramValues) }
    const width = args.width ?? Math.min(1280, scene.composition.width)
    const height = Math.max(1, Math.round(width * scene.composition.height / scene.composition.width))
    if (width * height > LIMITS.previewPixels) throw new Error('Preview pixel limit exceeded; use a smaller width')
    const assets = await previewAssets(scene, host.assets)
    await document.fonts.ready
    const canvas = document.createElement('canvas')
    canvas.width = scene.composition.width; canvas.height = scene.composition.height
    if (canvas.width * canvas.height > 16_777_216) throw new Error('Composition is too large for preview')
    const context = canvas.getContext('2d')!
    canvasRenderer.render(context, scene, timeMs, null, assets, { renderMode: 'preview', overrides: frame.overrides, paramValues: frame.paramValues })
    const output = document.createElement('canvas')
    output.width = width; output.height = height
    output.getContext('2d')!.drawImage(canvas, 0, 0, width, height)
    return { revision, mimeType: 'image/png', data: output.toDataURL('image/png').split(',')[1], width, height, timeMs }
  }
  if (method === 'validate_scene') {
    assertScene(before)
    try { const runtime = defaultRuntimeExporter.export(before); return { revision, valid: true, warnings: runtime.warnings } }
    catch (error: any) { return { revision, valid: false, errors: error.validation?.errors ?? [(error as Error).message] } }
  }
  if (method === 'export_runtime') {
    const portable = await portableScene(before)
    const runtime = defaultRuntimeExporter.export(portable)
    return { revision, extension: '.runtime.json', data: asBase64(new TextEncoder().encode(JSON.stringify(runtime, null, 2))), warnings: runtime.warnings }
  }
  if (method === 'export_svg') {
    const exported = exportSVG(before, { timeMs: args.timeMs ?? 0 })
    return { revision, extension: '.svg', data: asBase64(new TextEncoder().encode(exported.svg)), warnings: exported.warnings }
  }
  if (method === 'export_sequence') {
    const scene = filteredScene(before, args.timelineIds)
    const fps = args.fps ?? scene.composition.frameRate
    if (scene.composition.durationMs * fps / 1000 > 300 || scene.composition.width * scene.composition.height > LIMITS.previewPixels) throw new Error('Sequence limit: at most 300 frames and 4 MP per frame; reduce duration, FPS or resolution')
    const exported = await exportSequence(scene, await previewAssets(scene, host.assets), { format: 'png', fps })
    if (exported.blob.size > 24 * 1024 * 1024) throw new Error('Sequence exceeds 24 MB transport limit')
    return { revision, extension: '.zip', data: await blobBase64(exported.blob), warnings: exported.warnings }
  }
  if (method === 'import_asset') {
    ensureWritable()
    const bytes = Uint8Array.from(atob(args.data), c => c.charCodeAt(0))
    initImportPipeline()
    const imported = await importManager.importFile(new File([bytes], args.name, { type: args.mimeType }))
    if (imported.errors.length) throw new Error(imported.errors.map(e => e.message).join('; '))
    return commit(new ImportTransactionBuilder().build(imported).execute(before), 'MCP import asset')
  }
  const def = actionRegistry.get(method)
  if (def?.read) return { revision, content: def.read(args, before) }
  if (method === 'run_script') throw new Error('Scripts must run in the MCP sandbox')
  ensureWritable()
  const calls = method === 'batch_actions' ? args.actions : [{ name: method, arguments: args }]
  let working = before
  for (const call of calls) {
    await validateToolCall(call.name, call.arguments)
    const action = actionRegistry.get(call.name)
    if (call.name === 'run_script' || !action?.toCommand) throw new Error(`Tool '${call.name}' cannot be used in a native batch`)
    if (call.name === 'bake_track') {
      const tl = working.timelines.find(t => t.id === call.arguments.timelineId)
      if (tl && tl.durationMs * (call.arguments.fps ?? 60) / 1000 > LIMITS.keyframes) throw new Error('Bake sample limit exceeded')
    }
    if (call.name === 'clone_layer' || call.name === 'array_layer') {
      const options = call.arguments
      assertCloneBudget(working, options.layerId, call.name === 'array_layer' && options.pattern === 'grid' ? (options.rows ?? 3) * (options.columns ?? 3) : (options.count ?? (call.name === 'clone_layer' ? 1 : 10)))
    }
    const command = action.toCommand(call.arguments, working)
    if (command?.label.startsWith('AI ERROR')) throw new Error(command.label)
    if (command) working = command.execute(working)
    assertScene(working)
  }
  return commit(working, method === 'batch_actions' ? 'MCP batch' : `MCP ${method}`)
}
