'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BakeJobStatusCard } from '@/components/bake/BakeJobStatusCard'
import { isFractureSourceLayerCandidate } from '@/lib/fracture/FractureSourceBoundaryCompiler'
import type { RigidBakeOwnershipInspection } from '@/lib/physics/RigidBakeOwnership'
import type { RigidBakeConflictPolicy } from '@/lib/physics/RigidBakeSceneMutation'
import { isRigidRectangleLayerCandidate } from '@/lib/physics/RigidBodySceneCompiler'
import type { ChronoScene, Layer } from '@/lib/types'
import type { RigidBakeRecord, RigidBodyMaterial } from '@/lib/types/physics'
import FractureAuthoringSection, {
  fractureSourceError,
  type FractureAuthoringDraft,
} from './FractureAuthoringSection'
import {
  inputClass,
  labelClass,
  PhysicsFieldset as Fieldset,
  PhysicsInlineNotice as InlineNotice,
  PhysicsNumberField as NumberField,
  toggleRowClass,
} from './PhysicsFormControls'
import PhysicsBakeInspector from './PhysicsBakeInspector'
import PhysicsBakePreview from './PhysicsBakePreview'
import type { PhysicsViewportOverlaySettings } from './PhysicsViewportOverlayState'
import { requestFromRecord, type PhysicsBakeController, type PhysicsBakeRequest } from './usePhysicsBakeController'

type PhysicsMode = 'rigid' | 'fracture' | 'particle'
type PhysicsView = 'source' | 'preview' | 'inspect'

export interface PhysicsDraft extends FractureAuthoringDraft {
  sourceLayerId: string
  staticLayerIds: string[]
  timelineId: string
  startTimeMs: number
  durationMs: number
  stepHz: number
  sampleFps: number
  pixelsPerMeter: number
  gravityX: number
  gravityY: number
  velocityX: number
  velocityY: number
  angularVelocity: number
  density: number
  friction: number
  restitution: number
  airFriction: number
}

interface Props {
  readonly scene: ChronoScene
  readonly selectedLayerId: string | null
  readonly selectedTimelineId: string
  readonly currentTimeMs?: number
  readonly controller: PhysicsBakeController
  readonly onOpenParticles: () => void
  readonly viewportOverlay: PhysicsViewportOverlaySettings
  readonly onViewportOverlayChange: (settings: PhysicsViewportOverlaySettings) => void
}

/**
 * Product UI for rectangle rigid bodies and convex-source Voronoi fracture.
 * Form values remain a local draft; Preview starts the
 * shared workspace job, Cancel/Discard release it and Apply is the only source
 * mutation. Unsupported geometry is excluded from pickers and described
 * explicitly. The Particle tab routes to the existing particle authoring
 * panel; it does not imply a particle-body solver that has not landed.
 */
export default function PhysicsSimulationsPanel({
  scene,
  selectedLayerId,
  selectedTimelineId,
  currentTimeMs = 0,
  controller,
  onOpenParticles,
  viewportOverlay,
  onViewportOverlayChange,
}: Props) {
  const rigidRectangles = useMemo(() => scene.layers.filter(isSupportedRectangle), [scene.layers])
  const fractureSources = useMemo(() => scene.layers.filter(isFractureSourceLayerCandidate), [scene.layers])
  const initialSource = rigidRectangles.find(layer => layer.id === selectedLayerId)?.id ?? rigidRectangles[0]?.id ?? ''
  const initialTimeline = scene.timelines.find(timeline => timeline.id === selectedTimelineId) ?? scene.timelines[0]
  const [mode, setMode] = useState<PhysicsMode>('rigid')
  const [view, setView] = useState<PhysicsView>('source')
  const [draft, setDraft] = useState<PhysicsDraft>(() => initialDraft(initialSource, initialTimeline?.id ?? '', initialTimeline?.durationMs ?? 3000))
  const [replaceRecordId, setReplaceRecordId] = useState<string | undefined>()
  const [actionError, setActionError] = useState('')
  const sources = mode === 'fracture' ? fractureSources : rigidRectangles
  const snapshot = controller.snapshot
  const preview = snapshot?.preview
  const fractureRecords = useMemo(() => (scene.physics?.rigidBakes ?? []).filter(record => (
    record.recipe.fractureEvents?.length && record.fractureGeneration
  )), [scene.physics?.rigidBakes])
  const replacementClusterGraph = replaceRecordId
    ? scene.physics?.rigidBakes.find(record => record.id === replaceRecordId)?.recipe.fractureClusters?.[0]?.graph
    : undefined

  useEffect(() => { controller.checkSource() }, [controller.checkSource, scene])
  useEffect(() => {
    const reconciled = reconcilePhysicsDraftWithScene(
      scene,
      selectedTimelineId,
      draft,
      mode === 'fracture' ? 'fracture' : 'rigid',
    )
    if (reconciled === draft) return
    controller.discard()
    setActionError('')
    setReplaceRecordId(undefined)
    setView('source')
    setDraft(reconciled)
  }, [controller, draft, mode, scene, selectedTimelineId])

  const update = <K extends keyof PhysicsDraft>(key: K, value: PhysicsDraft[K]) => {
    controller.discard()
    setActionError('')
    setView('source')
    setDraft(previous => ({ ...previous, [key]: value }))
  }
  const updateFracture = <K extends keyof FractureAuthoringDraft>(key: K, value: FractureAuthoringDraft[K]) => {
    controller.discard()
    setActionError('')
    setView('source')
    setDraft(previous => ({ ...previous, [key]: value }))
  }
  const selectSource = (sourceLayerId: string) => {
    controller.discard()
    setActionError('')
    setView('source')
    setDraft(previous => ({
      ...previous,
      sourceLayerId,
      generationId: generationIdFor(sourceLayerId),
      secondaryGenerationId: secondaryGenerationIdFor(sourceLayerId),
      staticLayerIds: previous.staticLayerIds.filter(id => id !== sourceLayerId),
    }))
  }
  const useSelection = () => {
    if (selectedLayerId && sources.some(layer => layer.id === selectedLayerId)) selectSource(selectedLayerId)
  }
  const toggleStatic = (layerId: string) => update('staticLayerIds', draft.staticLayerIds.includes(layerId)
    ? draft.staticLayerIds.filter(id => id !== layerId)
    : [...draft.staticLayerIds, layerId])
  const start = () => {
    if (mode === 'particle') return
    try {
      controller.start(buildRequest(mode, draft, replaceRecordId))
      setActionError('')
      setView('preview')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }
  const apply = async (conflictPolicy: RigidBakeConflictPolicy = 'reject') => {
    try {
      await controller.commit(conflictPolicy)
      setActionError('')
      setReplaceRecordId(undefined)
      setView('inspect')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }
  const source = sources.find(layer => layer.id === draft.sourceLayerId)
  const sourceError = mode === 'fracture' && source ? fractureSourceError(scene, source) : null
  const triggerError = mode === 'fracture' && draft.fractureTriggerKind === 'impact' && !draft.staticLayerIds.length
    ? 'Impact trigger needs at least one selected static collider.'
    : null
  const active = snapshot?.status === 'queued' || snapshot?.status === 'running'
  const replacingRecordId = controller.descriptor?.replacingRecordId
  const replacementInspection = descriptorInspection(controller, replacingRecordId)
  const replacementUnavailable = !!replacingRecordId && !replacementInspection
  const ambiguousReplacement = replacementInspection?.issues.some(issue => issue.kind === 'duplicate-track'
    || issue.kind === 'duplicate-generated-layer') ?? false
  const canApply = snapshot?.status === 'preview-ready' && !!preview
    && !replacementUnavailable && !ambiguousReplacement
  const beginRebake = (inspection: RigidBakeOwnershipInspection) => {
    const request = requestFromRecord(inspection.record, inspection.generation, inspection.generations)
    setMode(request.mode)
    setDraft(draftFromRequest(request))
    setReplaceRecordId(inspection.record.id)
    setActionError('')
    setView('preview')
  }

  return <div className="flex h-full flex-col overflow-hidden bg-gray-900 text-xs text-gray-300" data-testid="physics-simulations-panel">
    <div className="border-b border-gray-700 px-3 pt-3">
      <h2 className="text-sm font-semibold text-gray-100">Physics Simulations</h2>
      <div role="tablist" aria-label="Physics solver" className="mt-2 flex gap-1">
        {(['rigid', 'fracture', 'particle'] as const).map(item => <TabButton key={item} selected={mode === item}
          onClick={() => {
            if (item !== mode) { controller.discard(); setReplaceRecordId(undefined) }
            if (item !== 'particle') {
              const nextSources = item === 'fracture' ? fractureSources : rigidRectangles
              const preferred = nextSources.find(layer => layer.id === selectedLayerId)
                ?? nextSources.find(layer => layer.id === draft.sourceLayerId)
                ?? nextSources[0]
              if (preferred && preferred.id !== draft.sourceLayerId) {
                setDraft(previous => ({ ...previous, sourceLayerId: preferred.id,
                  generationId: generationIdFor(preferred.id),
                  staticLayerIds: previous.staticLayerIds.filter(id => id !== preferred.id) }))
              }
            }
            setMode(item); setView('source'); setActionError('')
          }}>
          {item === 'rigid' ? 'Rigid' : item === 'fracture' ? 'Fracture' : 'Particle'}
        </TabButton>)}
      </div>
      {mode !== 'particle' && <div role="tablist" aria-label="Physics workflow" className="mt-2 flex gap-1 border-t border-gray-800 pt-2">
        {([['source', 'Edit Source'], ['preview', 'Preview Simulation'], ['inspect', 'Inspect Bake']] as const).map(([id, label]) =>
          <TabButton key={id} selected={view === id} onClick={() => setView(id)}>{label}</TabButton>)}
      </div>}
    </div>

    <div className="flex-1 overflow-auto p-3">
      {mode === 'particle' ? <ParticleNotice onOpen={onOpenParticles} />
        : view === 'source' ? <div className="space-y-4">
          {!sources.length ? <InlineNotice tone="warning">{mode === 'fracture'
            ? 'Add a root closed shape, closed spline, fixed-topology Mesh2D or image rectangle with positive uniform scale. Concave outlines and holes are preserved with connected Mesh2D fragments and compound colliders.'
            : 'Add a root rectangle shape or image with positive uniform scale. Rigid bodies do not approximate text, hierarchy or non-uniform scale.'}</InlineNotice>
            : <>
              <SourceSection sources={sources} staticRectangles={rigidRectangles} sourceLayerId={draft.sourceLayerId} selectedLayerId={selectedLayerId}
                staticLayerIds={draft.staticLayerIds} onSource={selectSource} onUseSelection={useSelection} onToggleStatic={toggleStatic} />
              {sourceError && <InlineNotice tone="warning">{sourceError} Choose a supported source or fix it before Preview.</InlineNotice>}
              <TimingSection scene={scene} draft={draft} update={update} />
              <DynamicsSection draft={draft} update={update} />
              {mode === 'fracture' && <FractureAuthoringSection scene={scene} source={source} draft={draft}
                clusterGraph={replacementClusterGraph} selectedBondId={viewportOverlay.selectedBondId}
                currentTimeMs={currentTimeMs}
                onSelectBond={bondId => onViewportOverlayChange({ ...viewportOverlay, enabled: true, bonds: true,
                  recordId: replaceRecordId ?? viewportOverlay.recordId, selectedBondId: bondId })}
                onChange={updateFracture} />}
            </>}
          {actionError && <p role="alert" className="rounded border border-red-800 bg-red-950/30 p-2 text-red-200">{actionError}</p>}
        </div>
        : view === 'preview' ? <div className="space-y-3">
          {snapshot ? <BakeJobStatusCard snapshot={snapshot} sourceLabel={source?.name ?? draft.sourceLayerId}
            rangeLabel={`${draft.startTimeMs}–${draft.startTimeMs + draft.durationMs} ms`}
            qualityLabel={`${draft.stepHz} Hz solver · ${draft.sampleFps} FPS samples`} />
            : <InlineNotice>No preview is retained. Return to Edit Source and prepare one.</InlineNotice>}
          {preview && <PhysicsBakePreview scene={scene} preview={preview} />}
          {replacementInspection && <ReplacementNotice inspection={replacementInspection} />}
          {replacementUnavailable && <InlineNotice tone="warning">
            Replacement ownership is unavailable. Return to Inspect Bake and repair or clear the committed bake before applying this preview.
          </InlineNotice>}
          {actionError && <p role="alert" className="rounded border border-red-800 bg-red-950/30 p-2 text-red-200">{actionError}</p>}
        </div>
        : <PhysicsBakeInspector scene={scene} controller={controller} onRebakeStarted={beginRebake} />}
      {mode === 'fracture' && <FractureOverlayControls
        records={fractureRecords}
        settings={viewportOverlay}
        onChange={onViewportOverlayChange}
      />}
    </div>

    {mode !== 'particle' && <div className="grid grid-cols-3 gap-2 border-t border-gray-700 bg-gray-900 p-3">
      {active ? <button type="button" onClick={controller.cancel} className={secondaryButton}>Cancel</button>
        : <button type="button" disabled={!sources.length || !!sourceError || !!triggerError} onClick={start}
          className={secondaryButton}>{preview ? 'Refresh preview' : 'Preview'}</button>}
      <button type="button" disabled={!snapshot || active || snapshot.status === 'committing'} onClick={controller.discard} className={secondaryButton}>Discard</button>
      <button type="button" disabled={!canApply} onClick={() => void apply(replacementInspection?.canSafelyMutate === false ? 'discard-edits' : 'reject')}
        className={replacementInspection?.canSafelyMutate === false ? dangerButton : primaryButton}>
        {replacementInspection?.canSafelyMutate === false ? 'Replace edited bake' : replaceRecordId ? 'Replace bake' : 'Apply bake'}
      </button>
    </div>}
  </div>
}

function SourceSection({ sources, staticRectangles, sourceLayerId, selectedLayerId, staticLayerIds, onSource, onUseSelection, onToggleStatic }: {
  sources: readonly Layer[]; staticRectangles: readonly Layer[]; sourceLayerId: string; selectedLayerId: string | null; staticLayerIds: readonly string[]
  onSource(id: string): void; onUseSelection(): void; onToggleStatic(id: string): void
}) {
  const selectionCompatible = !!selectedLayerId && sources.some(layer => layer.id === selectedLayerId)
  return <Fieldset title="Bodies">
    <label className={labelClass}>Dynamic source
      <select aria-label="Dynamic body source" value={sourceLayerId} onChange={event => onSource(event.target.value)} className={inputClass}>
        {sources.map(layer => <option key={layer.id} value={layer.id}>{layer.name} · {sourceTypeLabel(layer)} · {layer.id}</option>)}
      </select>
    </label>
    <button type="button" disabled={!selectionCompatible || selectedLayerId === sourceLayerId} onClick={onUseSelection} className={smallButton}>Use canvas selection</button>
    <div>
      <p className="mb-1 text-[10px] text-gray-400">Collide with · static rectangles</p>
      <div className="max-h-28 space-y-1 overflow-auto rounded border border-gray-700 bg-gray-950/40 p-2">
        {staticRectangles.filter(layer => layer.id !== sourceLayerId).map(layer => <label key={layer.id} className="flex min-h-11 items-center gap-2 rounded px-1 text-[11px] hover:bg-gray-800/60 focus-within:ring-2 focus-within:ring-blue-400">
          <input type="checkbox" checked={staticLayerIds.includes(layer.id)} onChange={() => onToggleStatic(layer.id)} className="accent-blue-500" />
          <span className="truncate">{layer.name}</span><span className="ml-auto font-mono text-[9px] text-gray-500">{layer.type === 'image' ? 'image rect' : 'shape rect'}</span>
        </label>)}
        {staticRectangles.filter(layer => layer.id !== sourceLayerId).length === 0 && <p className="text-[10px] text-gray-500">No separate static rectangle collider. The body can still fall freely.</p>}
      </div>
    </div>
  </Fieldset>
}

function TimingSection({ scene, draft, update }: SectionProps) {
  return <Fieldset title="World & sampling">
    <label className={labelClass}>Timeline
      <select aria-label="Physics target timeline" value={draft.timelineId} onChange={event => update('timelineId', event.target.value)} className={inputClass}>
        {scene.timelines.map(timeline => <option key={timeline.id} value={timeline.id}>{timeline.id} · {timeline.durationMs} ms</option>)}
      </select>
    </label>
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="Start" unit="ms" value={draft.startTimeMs} min={0} onChange={value => update('startTimeMs', value)} />
      <NumberField label="Duration" unit="ms" value={draft.durationMs} min={1} onChange={value => update('durationMs', value)} />
      <NumberField label="Solver step" unit="Hz" value={draft.stepHz} min={1} step={1} onChange={value => update('stepHz', value)} />
      <NumberField label="Bake samples" unit="FPS" value={draft.sampleFps} min={1} step={1} onChange={value => update('sampleFps', value)} />
      <NumberField label="Gravity X" unit="m/s²" value={draft.gravityX} step="any" onChange={value => update('gravityX', value)} />
      <NumberField label="Gravity Y" unit="m/s²" value={draft.gravityY} step="any" onChange={value => update('gravityY', value)} />
      <NumberField label="World scale" unit="px/m" value={draft.pixelsPerMeter} min={1} step="any" onChange={value => update('pixelsPerMeter', value)} />
    </div>
  </Fieldset>
}

function DynamicsSection({ draft, update }: Omit<SectionProps, 'scene'>) {
  return <Fieldset title="Motion & material">
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="Velocity X" unit="px/s" value={draft.velocityX} step="any" onChange={value => update('velocityX', value)} />
      <NumberField label="Velocity Y" unit="px/s" value={draft.velocityY} step="any" onChange={value => update('velocityY', value)} />
      <NumberField label="Angular velocity" unit="deg/s" value={draft.angularVelocity} step="any" onChange={value => update('angularVelocity', value)} />
      <NumberField label="Density" unit="kg/m²" value={draft.density} min={0.001} step="any" onChange={value => update('density', value)} />
      <NumberField label="Friction" unit="0–1" value={draft.friction} min={0} max={1} step="any" onChange={value => update('friction', value)} />
      <NumberField label="Restitution" unit="0–1" value={draft.restitution} min={0} max={1} step="any" onChange={value => update('restitution', value)} />
      <NumberField label="Air friction" unit="0–&lt;1" value={draft.airFriction} min={0} max={0.999} step="any" onChange={value => update('airFriction', value)} />
    </div>
  </Fieldset>
}

/**
 * Controls editor-only diagnostics for one applied fracture bake.
 *
 * The master switch is opt-in and every setting stays outside scene/history.
 * Text status accompanies colour, controls retain a 44 px target and missing
 * records explain recovery instead of silently selecting unrelated output.
 */
function FractureOverlayControls({ records, settings, onChange }: {
  readonly records: readonly RigidBakeRecord[]
  readonly settings: PhysicsViewportOverlaySettings
  readonly onChange: (settings: PhysicsViewportOverlaySettings) => void
}) {
  const recordIds = new Set(records.map(record => record.id))
  const effectiveRecordId = settings.recordId && recordIds.has(settings.recordId)
    ? settings.recordId
    : records.at(-1)?.id ?? null
  const activeCount = [settings.fragments, settings.colliders, settings.centroids, settings.triangles, settings.bonds,
    settings.clusterColors,
    settings.topologyEvent, settings.colliderDelta]
    .filter(Boolean).length
  const patch = (next: Partial<PhysicsViewportOverlaySettings>) => onChange({
    ...settings,
    recordId: effectiveRecordId,
    ...next,
  })

  return <div className="mt-3">
    <Fieldset title="Canvas diagnostics">
      {!records.length ? <InlineNotice>Apply a Voronoi fracture bake to inspect fragment, collider, centroid and triangle geometry on Canvas.</InlineNotice>
        : <>
          <label className={labelClass}>Applied fracture bake
            <select aria-label="Fracture overlay bake" value={effectiveRecordId ?? ''}
              onChange={event => patch({ recordId: event.target.value })} className={inputClass}>
              {records.map(record => <option key={record.id} value={record.id}>{record.id}</option>)}
            </select>
          </label>
          <label className={toggleRowClass}>
            <input type="checkbox" checked={settings.enabled} onChange={event => patch({ enabled: event.target.checked })}
              className="size-4 accent-blue-500" />
            <span><span className="block text-gray-200">Show on Canvas</span>
              <span className="block text-[9px] text-gray-500">{settings.enabled ? `On · ${activeCount} diagnostics` : 'Off · editor-only'}</span></span>
          </label>
          <div className="grid grid-cols-2 gap-2" aria-label="Fracture canvas diagnostics">
            <OverlayToggle label="Fragments" checked={settings.fragments} disabled={!settings.enabled}
              onChange={checked => patch({ fragments: checked })} />
            <OverlayToggle label="Colliders" checked={settings.colliders} disabled={!settings.enabled}
              onChange={checked => patch({ colliders: checked })} />
            <OverlayToggle label="Centroids" checked={settings.centroids} disabled={!settings.enabled}
              onChange={checked => patch({ centroids: checked })} />
            <OverlayToggle label="Triangles" checked={settings.triangles} disabled={!settings.enabled}
              onChange={checked => patch({ triangles: checked })} />
            <OverlayToggle label="Bonds" checked={settings.bonds} disabled={!settings.enabled}
              onChange={checked => patch({ bonds: checked })} />
            <OverlayToggle label="Cluster colors" checked={settings.clusterColors} disabled={!settings.enabled}
              onChange={checked => patch({ clusterColors: checked })} />
            <OverlayToggle label="Event state" checked={settings.topologyEvent} disabled={!settings.enabled}
              onChange={checked => patch({ topologyEvent: checked })} />
            <OverlayToggle label="Collider delta" checked={settings.colliderDelta} disabled={!settings.enabled}
              onChange={checked => patch({ colliderDelta: checked })} />
          </div>
          {settings.selectedBondId && <p role="status" className="break-all rounded border border-cyan-900/70 bg-cyan-950/20 p-2 font-mono text-[9px] text-cyan-200">
            Selected bond · {settings.selectedBondId}
          </p>}
          <p className="text-[10px] leading-4 text-gray-500">Event state names the active topology. Bond lines show intact, unbreakable or realized-broken state and can be selected on Canvas. Diagnostics never appear in preview, playback or export; triangle lines remain a diagnostic fan.</p>
        </>}
    </Fieldset>
  </div>
}

function OverlayToggle({ label, checked, disabled, onChange }: {
  readonly label: string
  readonly checked: boolean
  readonly disabled: boolean
  readonly onChange: (checked: boolean) => void
}) {
  return <label className={`${toggleRowClass} ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}
      className="size-4 accent-blue-500" />
    <span>{label}</span>
  </label>
}

function ParticleNotice({ onOpen }: { onOpen(): void }) {
  return <div className="space-y-3"><InlineNotice>Visual particle emitters already have a dedicated panel. Particle rigid bodies, liquid surfaces and smoke/fire solvers remain separate planned adapters.</InlineNotice>
    <button type="button" onClick={onOpen} className={primaryButton}>Open Particle panel</button></div>
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick(): void; children: ReactNode }) {
  return <button type="button" role="tab" aria-selected={selected} onClick={onClick}
    className={`min-h-11 rounded-t px-3 py-2 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${selected ? 'border border-b-gray-900 border-gray-600 bg-gray-900 text-gray-100' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}>{children}</button>
}

interface SectionProps {
  scene: ChronoScene
  draft: PhysicsDraft
  update<K extends keyof PhysicsDraft>(key: K, value: PhysicsDraft[K]): void
}

function initialDraft(sourceLayerId: string, timelineId: string, durationMs: number): PhysicsDraft {
  return { sourceLayerId, staticLayerIds: [], timelineId, startTimeMs: 0, durationMs, stepHz: 120, sampleFps: 30,
    pixelsPerMeter: 100, gravityX: 0, gravityY: 9.81, velocityX: 0, velocityY: 0, angularVelocity: 0,
    density: 1, friction: 0.2, restitution: 0.2, airFriction: 0.01, fragmentCount: 16,
    fractureTimeMs: Math.min(800, Math.max(1, durationMs - 1)), fractureTriggerKind: 'time',
    impactSpeedPxPerSecond: 120, explosionEnabled: false, explosionCenterX: 0, explosionCenterY: 0,
    explosionRadialVelocity: 180, explosionDirectionDeg: 270, explosionDirectionalVelocity: 0,
    explosionSpinVelocity: 180, explosionVariation: .15, explosionSeed: 42,
    clusterEnabled: false, bondGraphId: '', bondImpulseStrength: 40, bondDamageThreshold: 80,
    bondDamageDecayPerSecond: 0, bondRelativeNormalSpeedScale: .1,
    bondVariation: .1, bondSeed: 42, bondOverrides: [],
    bondForcedBreaks: [], bondDamageResets: [],
    secondaryEnabled: false, secondaryParentFragmentIndex: 0, secondaryFragmentCount: 4,
    secondaryFractureTimeMs: Math.min(1200, Math.max(2, durationMs - 1)), secondarySeed: 84,
    secondaryGenerationId: secondaryGenerationIdFor(sourceLayerId),
    secondaryMaxFragments: 256, secondaryMaxTriangles: 4096, secondaryMaxPortableBytes: 8 * 1024 * 1024,
    seed: 42, generationId: generationIdFor(sourceLayerId) }
}

/**
 * Reconcile a local physics form after a project/scene replacement.
 *
 * User-entered material and sampling values remain intact while references that
 * no longer exist are replaced with the selected/first timeline and first
 * supported rectangle. Static colliders are filtered to current scene ids.
 * Returning the original object when no repair is needed keeps the effect
 * idempotent during ordinary source edits.
 */
export function reconcilePhysicsDraftWithScene(
  scene: ChronoScene,
  selectedTimelineId: string,
  draft: PhysicsDraft,
  mode: Exclude<PhysicsMode, 'particle'> = 'rigid',
): PhysicsDraft {
  const candidates = scene.layers.filter(mode === 'fracture' ? isFractureSourceLayerCandidate : isSupportedRectangle)
  const staticIds = new Set(scene.layers.filter(isSupportedRectangle).map(layer => layer.id))
  const candidateIds = new Set(candidates.map(layer => layer.id))
  const sourceLayerId = candidateIds.has(draft.sourceLayerId)
    ? draft.sourceLayerId
    : candidates[0]?.id ?? ''
  const staticLayerIds = draft.staticLayerIds.filter(id => staticIds.has(id) && id !== sourceLayerId)
  const timeline = scene.timelines.find(item => item.id === draft.timelineId)
    ?? scene.timelines.find(item => item.id === selectedTimelineId)
    ?? scene.timelines[0]
  const timelineId = timeline?.id ?? ''
  const sourceChanged = sourceLayerId !== draft.sourceLayerId
  const timelineChanged = timelineId !== draft.timelineId
  const staticsChanged = staticLayerIds.length !== draft.staticLayerIds.length
    || staticLayerIds.some((id, index) => id !== draft.staticLayerIds[index])
  if (!sourceChanged && !timelineChanged && !staticsChanged) return draft
  const durationMs = timelineChanged ? timeline?.durationMs ?? 3000 : draft.durationMs
  return {
    ...draft,
    sourceLayerId,
    staticLayerIds,
    timelineId,
    startTimeMs: timelineChanged ? 0 : draft.startTimeMs,
    durationMs,
    fractureTimeMs: timelineChanged
      ? Math.min(800, Math.max(1, durationMs - 1))
      : draft.fractureTimeMs,
    secondaryFractureTimeMs: timelineChanged
      ? Math.min(1200, Math.max(2, durationMs - 1))
      : draft.secondaryFractureTimeMs,
    generationId: sourceChanged ? generationIdFor(sourceLayerId) : draft.generationId,
    secondaryGenerationId: sourceChanged ? secondaryGenerationIdFor(sourceLayerId) : draft.secondaryGenerationId,
  }
}

function buildRequest(
  mode: Exclude<PhysicsMode, 'particle'>,
  draft: PhysicsDraft,
  replaceRecordId?: string,
): PhysicsBakeRequest {
  const material: RigidBodyMaterial = { densityKgPerSquareMeter: draft.density, friction: draft.friction,
    restitution: draft.restitution, airFriction: draft.airFriction }
  const common = { timelineId: draft.timelineId, startTimeMs: draft.startTimeMs, durationMs: draft.durationMs,
    stepHz: draft.stepHz, sampleFps: draft.sampleFps, pixelsPerMeter: draft.pixelsPerMeter,
    gravity: { x: draft.gravityX, y: draft.gravityY } }
  if (mode === 'fracture') return { mode, replaceRecordId, input: { ...common, sourceLayerId: draft.sourceLayerId,
    staticLayerIds: draft.staticLayerIds,
    fractureTimeMs: draft.fractureTriggerKind === 'time' ? draft.fractureTimeMs : undefined,
    fractureTrigger: draft.fractureTriggerKind === 'impact'
      ? { kind: 'impact' as const, minimumRelativeNormalSpeedPxPerSecond: draft.impactSpeedPxPerSecond,
        colliderLayerIds: draft.staticLayerIds }
      : { kind: 'time' as const },
    ...(draft.explosionEnabled ? { explosion: {
      centerLocalOffsetPx: { x: draft.explosionCenterX, y: draft.explosionCenterY },
      radialVelocityPxPerSecond: draft.explosionRadialVelocity,
      directionDeg: draft.explosionDirectionDeg,
      directionalVelocityPxPerSecond: draft.explosionDirectionalVelocity,
      spinVelocityDegPerSecond: draft.explosionSpinVelocity,
      variation: draft.explosionVariation,
      seed: draft.explosionSeed,
    } } : {}),
    ...(draft.clusterEnabled ? { cluster: {
      ...(draft.bondGraphId ? { graphId: draft.bondGraphId } : {}),
      defaults: {
        impulseStrength: draft.bondImpulseStrength,
        damageThreshold: draft.bondDamageThreshold,
        damageDecayPerSecond: draft.bondDamageDecayPerSecond,
        relativeNormalSpeedScale: draft.bondRelativeNormalSpeedScale,
        variation: draft.bondVariation,
        seed: draft.bondSeed,
      },
      overrides: draft.bondOverrides,
      forcedBreaks: draft.bondForcedBreaks,
      damageResets: draft.bondDamageResets,
    } } : {}),
    ...(draft.secondaryEnabled ? { secondary: {
      parentFragmentIndex: draft.secondaryParentFragmentIndex,
      fractureTimeMs: draft.secondaryFractureTimeMs,
      fragmentCount: draft.secondaryFragmentCount,
      seed: draft.secondarySeed,
      generationId: draft.secondaryGenerationId,
      budgets: {
        maxDepth: 1,
        maxGenerations: 2,
        maxFragments: draft.secondaryMaxFragments,
        maxTriangles: draft.secondaryMaxTriangles,
        maxPortableBytes: draft.secondaryMaxPortableBytes,
      },
    } } : {}),
    fragmentCount: draft.fragmentCount,
    seed: draft.seed, generationId: draft.generationId, material,
    initialVelocityPxPerSecond: { x: draft.velocityX, y: draft.velocityY },
    initialAngularVelocityDegPerSecond: draft.angularVelocity } }
  return { mode, replaceRecordId, input: { ...common, bodies: [
    { layerId: draft.sourceLayerId, motionType: 'dynamic', material,
      initialVelocityPxPerSecond: { x: draft.velocityX, y: draft.velocityY },
      initialAngularVelocityDegPerSecond: draft.angularVelocity },
    ...draft.staticLayerIds.map(layerId => ({ layerId, motionType: 'static' as const, material })),
  ] } }
}

function draftFromRequest(request: PhysicsBakeRequest): PhysicsDraft {
  if (request.mode === 'fracture') {
    const common = request.input
    return {
      sourceLayerId: common.sourceLayerId,
      staticLayerIds: [...(common.staticLayerIds ?? [])],
      timelineId: common.timelineId,
      startTimeMs: common.startTimeMs ?? 0,
      durationMs: common.durationMs,
      stepHz: common.stepHz ?? 120,
      sampleFps: common.sampleFps ?? 30,
      pixelsPerMeter: common.pixelsPerMeter ?? 100,
      gravityX: common.gravity?.x ?? 0,
      gravityY: common.gravity?.y ?? 9.81,
      velocityX: common.initialVelocityPxPerSecond?.x ?? 0,
      velocityY: common.initialVelocityPxPerSecond?.y ?? 0,
      angularVelocity: common.initialAngularVelocityDegPerSecond ?? 0,
      density: common.material?.densityKgPerSquareMeter ?? 1,
      friction: common.material?.friction ?? .2,
      restitution: common.material?.restitution ?? .2,
      airFriction: common.material?.airFriction ?? .01,
      fragmentCount: common.fragmentCount,
      fractureTimeMs: common.fractureTimeMs ?? Math.min(800, Math.max(1, common.durationMs - 1)),
      fractureTriggerKind: common.fractureTrigger?.kind ?? 'time',
      impactSpeedPxPerSecond: common.fractureTrigger?.kind === 'impact'
        ? common.fractureTrigger.minimumRelativeNormalSpeedPxPerSecond : 120,
      explosionEnabled: !!common.explosion,
      explosionCenterX: common.explosion?.centerLocalOffsetPx.x ?? 0,
      explosionCenterY: common.explosion?.centerLocalOffsetPx.y ?? 0,
      explosionRadialVelocity: common.explosion?.radialVelocityPxPerSecond ?? 180,
      explosionDirectionDeg: common.explosion?.directionDeg ?? 270,
      explosionDirectionalVelocity: common.explosion?.directionalVelocityPxPerSecond ?? 0,
      explosionSpinVelocity: common.explosion?.spinVelocityDegPerSecond ?? 180,
      explosionVariation: common.explosion?.variation ?? .15,
      explosionSeed: common.explosion?.seed ?? 42,
      clusterEnabled: !!common.cluster,
      bondGraphId: common.cluster?.graphId ?? '',
      bondImpulseStrength: common.cluster?.defaults?.impulseStrength ?? 40,
      bondDamageThreshold: common.cluster?.defaults?.damageThreshold ?? 80,
      bondDamageDecayPerSecond: common.cluster?.defaults?.damageDecayPerSecond ?? 0,
      bondRelativeNormalSpeedScale: common.cluster?.defaults?.relativeNormalSpeedScale ?? .1,
      bondVariation: common.cluster?.defaults?.variation ?? .1,
      bondSeed: common.cluster?.defaults?.seed ?? common.seed,
      bondOverrides: [...(common.cluster?.overrides ?? [])],
      bondForcedBreaks: [...(common.cluster?.forcedBreaks ?? [])],
      bondDamageResets: [...(common.cluster?.damageResets ?? [])],
      secondaryEnabled: !!common.secondary,
      secondaryParentFragmentIndex: common.secondary?.parentFragmentIndex ?? 0,
      secondaryFragmentCount: common.secondary?.fragmentCount ?? 4,
      secondaryFractureTimeMs: common.secondary?.fractureTimeMs ?? Math.min(1200, Math.max(2, common.durationMs - 1)),
      secondarySeed: common.secondary?.seed ?? 84,
      secondaryGenerationId: common.secondary?.generationId ?? secondaryGenerationIdFor(common.sourceLayerId),
      secondaryMaxFragments: common.secondary?.budgets?.maxFragments ?? 256,
      secondaryMaxTriangles: common.secondary?.budgets?.maxTriangles ?? 4096,
      secondaryMaxPortableBytes: common.secondary?.budgets?.maxPortableBytes ?? 8 * 1024 * 1024,
      seed: common.seed,
      generationId: common.generationId,
    }
  }
  const common = request.input
  const dynamic = common.bodies.find(body => body.motionType === 'dynamic')
  if (!dynamic) throw new Error('The saved rigid bake has no dynamic source body.')
  return {
    sourceLayerId: dynamic.layerId,
    staticLayerIds: common.bodies.filter(body => body.motionType === 'static').map(body => body.layerId),
    timelineId: common.timelineId,
    startTimeMs: common.startTimeMs ?? 0,
    durationMs: common.durationMs,
    stepHz: common.stepHz ?? 120,
    sampleFps: common.sampleFps ?? 30,
    pixelsPerMeter: common.pixelsPerMeter ?? 100,
    gravityX: common.gravity?.x ?? 0,
    gravityY: common.gravity?.y ?? 9.81,
    velocityX: dynamic.initialVelocityPxPerSecond?.x ?? 0,
    velocityY: dynamic.initialVelocityPxPerSecond?.y ?? 0,
    angularVelocity: dynamic.initialAngularVelocityDegPerSecond ?? 0,
    density: dynamic.material?.densityKgPerSquareMeter ?? 1,
    friction: dynamic.material?.friction ?? .2,
    restitution: dynamic.material?.restitution ?? .2,
    airFriction: dynamic.material?.airFriction ?? .01,
    fragmentCount: 16,
    fractureTimeMs: Math.min(800, Math.max(1, common.durationMs - 1)),
    fractureTriggerKind: 'time',
    impactSpeedPxPerSecond: 120,
    explosionEnabled: false,
    explosionCenterX: 0,
    explosionCenterY: 0,
    explosionRadialVelocity: 180,
    explosionDirectionDeg: 270,
    explosionDirectionalVelocity: 0,
    explosionSpinVelocity: 180,
    explosionVariation: .15,
    explosionSeed: 42,
    clusterEnabled: false,
    bondGraphId: '',
    bondImpulseStrength: 40,
    bondDamageThreshold: 80,
    bondDamageDecayPerSecond: 0,
    bondRelativeNormalSpeedScale: .1,
    bondVariation: .1,
    bondSeed: 42,
    bondOverrides: [],
    bondForcedBreaks: [],
    bondDamageResets: [],
    secondaryEnabled: false,
    secondaryParentFragmentIndex: 0,
    secondaryFragmentCount: 4,
    secondaryFractureTimeMs: Math.min(1200, Math.max(2, common.durationMs - 1)),
    secondarySeed: 84,
    secondaryGenerationId: secondaryGenerationIdFor(dynamic.layerId),
    secondaryMaxFragments: 256,
    secondaryMaxTriangles: 4096,
    secondaryMaxPortableBytes: 8 * 1024 * 1024,
    seed: 42,
    generationId: generationIdFor(dynamic.layerId),
  }
}

function descriptorInspection(
  controller: PhysicsBakeController,
  recordId: string | undefined,
): RigidBakeOwnershipInspection | undefined {
  if (!recordId) return undefined
  try { return controller.inspectBake(recordId) }
  catch { return undefined }
}

function ReplacementNotice({ inspection }: { inspection: RigidBakeOwnershipInspection }) {
  const ambiguous = inspection.issues.some(issue => issue.kind === 'duplicate-track'
    || issue.kind === 'duplicate-generated-layer')
  if (inspection.canSafelyMutate) {
    return <InlineNotice>Applying this preview replaces only the verified output owned by <span className="font-mono">{inspection.record.id}</span>. One Undo restores the previous bake.</InlineNotice>
  }
  return <InlineNotice tone="warning">
    {ambiguous
      ? 'Duplicate generated targets make ownership ambiguous. Resolve them before applying this replacement.'
      : 'The existing bake contains edited, missing or legacy output. It will remain unchanged unless you explicitly choose Replace edited bake.'}
  </InlineNotice>
}

function isSupportedRectangle(layer: Layer): boolean {
  return isRigidRectangleLayerCandidate(layer)
}

function sourceTypeLabel(layer: Layer): string {
  if (layer.type === 'image') return 'Image'
  if (layer.type === 'spline') return 'Spline'
  if (layer.type === 'mesh2d') return 'Mesh2D'
  return 'Shape'
}

function generationIdFor(sourceLayerId: string): string {
  const safe = `fracture-${sourceLayerId || 'source'}`.replace(/[^A-Za-z0-9_-]/g, '-')
  return safe.slice(0, 116)
}

function secondaryGenerationIdFor(sourceLayerId: string): string {
  const root = generationIdFor(sourceLayerId)
  return `${root.slice(0, 108)}-g1`
}

const smallButton = 'min-h-11 rounded border border-gray-600 px-3 py-2 text-[10px] text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
const secondaryButton = 'min-h-11 rounded border border-gray-600 px-3 py-2 text-gray-100 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
const primaryButton = 'min-h-11 rounded bg-amber-600 px-3 py-2 font-medium text-gray-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300'
const dangerButton = 'min-h-11 rounded bg-red-700 px-3 py-2 font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300'
