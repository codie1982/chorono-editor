import { FractureAppearanceCompiler } from '@/lib/fracture/FractureAppearanceCompiler'
import type { ChronoScene, Layer } from '@/lib/types'
import type {
  FractureBondDamageReset,
  FractureBondForcedBreak,
  FractureBondGraph,
  FractureBondOverride,
} from '@/lib/types/fractureCluster'
import FractureBondAuthoringControls from './FractureBondAuthoringControls'
import {
  inputClass,
  labelClass,
  PhysicsFieldset,
  PhysicsInlineNotice,
  PhysicsNumberField,
  toggleRowClass,
} from './PhysicsFormControls'

const appearanceCompiler = new FractureAppearanceCompiler()

export interface FractureAuthoringDraft {
  readonly staticLayerIds: readonly string[]
  readonly startTimeMs: number
  readonly durationMs: number
  readonly stepHz: number
  readonly fragmentCount: number
  readonly fractureTimeMs: number
  readonly fractureTriggerKind: 'time' | 'impact'
  readonly impactSpeedPxPerSecond: number
  readonly explosionEnabled: boolean
  readonly explosionCenterX: number
  readonly explosionCenterY: number
  readonly explosionRadialVelocity: number
  readonly explosionDirectionDeg: number
  readonly explosionDirectionalVelocity: number
  readonly explosionSpinVelocity: number
  readonly explosionVariation: number
  readonly explosionSeed: number
  readonly seed: number
  readonly generationId: string
  readonly clusterEnabled: boolean
  readonly bondGraphId: string
  readonly bondImpulseStrength: number
  readonly bondDamageThreshold: number
  readonly bondDamageDecayPerSecond: number
  readonly bondRelativeNormalSpeedScale: number
  readonly bondVariation: number
  readonly bondSeed: number
  readonly bondOverrides: readonly FractureBondOverride[]
  readonly bondForcedBreaks: readonly FractureBondForcedBreak[]
  readonly bondDamageResets: readonly FractureBondDamageReset[]
}

interface Props {
  readonly scene: ChronoScene
  readonly source?: Layer
  readonly draft: FractureAuthoringDraft
  readonly clusterGraph?: FractureBondGraph
  readonly selectedBondId?: string | null
  readonly currentTimeMs?: number
  onSelectBond?(bondId: string): void
  readonly onChange: <K extends keyof FractureAuthoringDraft>(key: K, value: FractureAuthoringDraft[K]) => void
}

/**
 * Shows only controls relevant to the selected fracture trigger and explosion.
 *
 * Impact keeps time hidden, requires an explicit collider selection and places
 * recovery beside the control. Artistic explosion fields remain collapsed
 * until enabled and always disclose that they add non-physical external
 * energy. All controls preserve labelled 44 px interaction targets.
 */
export default function FractureAuthoringSection({
  scene, source, draft, clusterGraph, selectedBondId = null, currentTimeMs = 0,
  onSelectBond = () => {}, onChange,
}: Props) {
  const imageAsset = source?.type === 'image' && source.image
    ? scene.assets.find(asset => asset.id === source.image!.assetId)
    : undefined
  return <PhysicsFieldset title="Voronoi fracture">
    {source?.type === 'image' && <p role="status" className="rounded border border-blue-800/60 bg-blue-950/25 p-2 text-xs leading-5 text-blue-100">
      Image fragments enabled · {imageAsset?.name ?? source.image?.assetId ?? 'missing asset'} · fit {source.image?.objectFit ?? 'contain'} · source-rectangle UVs preserved.
    </p>}
    {(source?.type === 'shape' || source?.type === 'spline') && <p role="status" className="rounded border border-emerald-800/60 bg-emerald-950/25 p-2 text-xs leading-5 text-emerald-100">
      Closed {source.type} enabled · convex sources create editable Path fragments; concave or holed sources create fixed-topology Mesh2D fragments with compound colliders.
    </p>}
    {source?.type === 'mesh2d' && <p role="status" className="rounded border border-violet-800/60 bg-violet-950/25 p-2 text-xs leading-5 text-violet-100">
      Mesh2D region enabled · source triangles and authored UVs are clipped into connected fragment meshes. Concave outlines and holes use compound colliders; live deformation must be baked first.
    </p>}
    <div className="grid grid-cols-2 gap-2">
      <PhysicsNumberField label="Fragments" unit="2–100" value={draft.fragmentCount} min={2} max={100} step={1}
        onChange={value => onChange('fragmentCount', value)} />
      <PhysicsNumberField label="Seed" unit="uint32" value={draft.seed} min={0} max={0xffffffff} step={1}
        onChange={value => onChange('seed', value)} />
    </div>
    <label className={labelClass}>Trigger
      <select aria-label="Fracture trigger" value={draft.fractureTriggerKind}
        onChange={event => onChange('fractureTriggerKind', event.target.value as FractureAuthoringDraft['fractureTriggerKind'])}
        className={inputClass}>
        <option value="time">Time</option>
        <option value="impact">Impact</option>
      </select>
    </label>
    {draft.fractureTriggerKind === 'time'
      ? <PhysicsNumberField label="Fracture time" unit="local ms" value={draft.fractureTimeMs} min={1}
        onChange={value => onChange('fractureTimeMs', value)} />
      : <div className="space-y-2">
        <PhysicsNumberField label="Minimum impact speed" unit="px/s" value={draft.impactSpeedPxPerSecond} min={0.001}
          onChange={value => onChange('impactSpeedPxPerSecond', value)} />
        {draft.staticLayerIds.length
          ? <p role="status" className="text-xs leading-5 text-gray-400">Uses {draft.staticLayerIds.length} selected static collider{draft.staticLayerIds.length === 1 ? '' : 's'}. Speed is measured at the contact point before collision response.</p>
          : <PhysicsInlineNotice tone="warning">Choose at least one Collide with body. Impact preview stays disabled until a trigger collider is selected.</PhysicsInlineNotice>}
      </div>}
    <label className={labelClass}>Generation ID
      <input aria-label="Fracture generation ID" value={draft.generationId} maxLength={110}
        onChange={event => onChange('generationId', event.target.value)} className={`${inputClass} font-mono`} />
    </label>
    <p className="text-xs leading-5 text-gray-500">The realized event tick, seed and polygons are persisted together. Impact preview fails clearly when no contact reaches the threshold.</p>
    <label className={toggleRowClass}>
      <input type="checkbox" checked={draft.clusterEnabled}
        onChange={event => {
          onChange('clusterEnabled', event.target.checked)
          if (event.target.checked && draft.explosionEnabled) onChange('explosionEnabled', false)
        }} className="size-4 accent-cyan-500" />
      <span><span className="block text-xs text-gray-200">Keep fragments bonded</span>
        <span className="block text-xs leading-5 text-gray-500">Starts as one compound body; shared-boundary bonds split connected components under load.</span></span>
    </label>
    {draft.clusterEnabled && <div className="space-y-2 rounded border border-cyan-800/70 bg-cyan-950/20 p-2">
      <p role="status" className="text-xs leading-5 text-cyan-100">Automatic shared-boundary cluster · mass, centre and momentum are checked on every split. Artistic explosion is unavailable in this mode.</p>
      <label className={labelClass}>Bond graph ID
        <input aria-label="Bond graph ID" value={draft.bondGraphId} maxLength={96}
          placeholder="Auto from generation" onChange={event => onChange('bondGraphId', event.target.value)}
          className={`${inputClass} font-mono`} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <PhysicsNumberField label="Impulse strength" unit="solver load" value={draft.bondImpulseStrength} min={0.000001}
          onChange={value => onChange('bondImpulseStrength', value)} />
        <PhysicsNumberField label="Damage threshold" unit="accumulated" value={draft.bondDamageThreshold} min={0.000001}
          onChange={value => onChange('bondDamageThreshold', value)} />
        <PhysicsNumberField label="Damage decay" unit="per second" value={draft.bondDamageDecayPerSecond} min={0}
          onChange={value => onChange('bondDamageDecayPerSecond', value)} />
        <PhysicsNumberField label="Speed influence" unit="load / px/s" value={draft.bondRelativeNormalSpeedScale} min={0}
          onChange={value => onChange('bondRelativeNormalSpeedScale', value)} />
        <PhysicsNumberField label="Bond variation" unit="0–1" value={draft.bondVariation} min={0} max={1}
          onChange={value => onChange('bondVariation', value)} />
        <PhysicsNumberField label="Bond seed" unit="uint32" value={draft.bondSeed} min={0} max={0xffffffff} step={1}
          onChange={value => onChange('bondSeed', value)} />
      </div>
      {draft.bondOverrides.length > 0 && <p className="text-xs leading-5 text-cyan-200">{draft.bondOverrides.length} manual/custom bond override{draft.bondOverrides.length === 1 ? '' : 's'} will be preserved on Re-bake.</p>}
      <FractureBondAuthoringControls graph={clusterGraph} selectedBondId={selectedBondId}
        currentTimeMs={currentTimeMs} startTimeMs={draft.startTimeMs} durationMs={draft.durationMs} stepHz={draft.stepHz}
        overrides={draft.bondOverrides} forcedBreaks={draft.bondForcedBreaks} damageResets={draft.bondDamageResets}
        onSelectBond={onSelectBond}
        onOverrides={value => onChange('bondOverrides', value)}
        onForcedBreaks={value => onChange('bondForcedBreaks', value)}
        onDamageResets={value => onChange('bondDamageResets', value)} />
    </div>}
    <label className={toggleRowClass}>
      <input type="checkbox" checked={draft.explosionEnabled}
        onChange={event => {
          onChange('explosionEnabled', event.target.checked)
          if (event.target.checked && draft.clusterEnabled) onChange('clusterEnabled', false)
        }} className="size-4 accent-amber-500" />
      <span><span className="block text-xs text-gray-200">Add artistic explosion</span>
        <span className="block text-xs leading-5 text-gray-500">Adds external velocity and spin once at the fracture tick.</span></span>
    </label>
    {draft.explosionEnabled && <div className="space-y-2 rounded border border-amber-800/70 bg-amber-950/20 p-2">
      <p role="status" className="text-xs leading-5 text-amber-200">External energy enabled. This changes fragment motion and is not produced by the physical impact.</p>
      <div className="grid grid-cols-2 gap-2">
        <PhysicsNumberField label="Radial velocity" unit="px/s" value={draft.explosionRadialVelocity} min={0}
          onChange={value => onChange('explosionRadialVelocity', value)} />
        <PhysicsNumberField label="Direction" unit="deg" value={draft.explosionDirectionDeg}
          onChange={value => onChange('explosionDirectionDeg', value)} />
        <PhysicsNumberField label="Directional velocity" unit="px/s" value={draft.explosionDirectionalVelocity} min={0}
          onChange={value => onChange('explosionDirectionalVelocity', value)} />
        <PhysicsNumberField label="Spin variation" unit="deg/s" value={draft.explosionSpinVelocity} min={0}
          onChange={value => onChange('explosionSpinVelocity', value)} />
        <PhysicsNumberField label="Centre X" unit="local px" value={draft.explosionCenterX}
          onChange={value => onChange('explosionCenterX', value)} />
        <PhysicsNumberField label="Centre Y" unit="local px" value={draft.explosionCenterY}
          onChange={value => onChange('explosionCenterY', value)} />
        <PhysicsNumberField label="Variation" unit="0–1" value={draft.explosionVariation} min={0} max={1}
          onChange={value => onChange('explosionVariation', value)} />
        <PhysicsNumberField label="Explosion seed" unit="uint32" value={draft.explosionSeed} min={0} max={0xffffffff} step={1}
          onChange={value => onChange('explosionSeed', value)} />
      </div>
    </div>}
  </PhysicsFieldset>
}

/** Returns an inline authoring error without mutating or loading media. */
export function fractureSourceError(scene: ChronoScene, layer: Layer): string | null {
  try {
    appearanceCompiler.snapshot(scene, layer)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
