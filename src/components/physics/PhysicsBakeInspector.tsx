'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { FractureAppearanceQualityAnalyzer } from '@/lib/fracture/FractureAppearanceQualityAnalyzer'
import { FractureRenderColliderAnalyzer } from '@/lib/fracture/FractureRenderColliderAnalyzer'
import type { ChronoScene } from '@/lib/types'
import type { RigidBakeOwnershipInspection } from '@/lib/physics/RigidBakeOwnership'
import FractureAppearanceQualityCard from './FractureAppearanceQualityCard'
import FractureEventSummary from './FractureEventSummary'
import FractureBondedClusterCard from './FractureBondedClusterCard'
import FractureTopologyColliderCard from './FractureTopologyColliderCard'
import FractureHierarchyCard from './FractureHierarchyCard'
import type { PhysicsBakeController } from './usePhysicsBakeController'

const fractureAppearanceQualityAnalyzer = new FractureAppearanceQualityAnalyzer()
const fractureRenderColliderAnalyzer = new FractureRenderColliderAnalyzer()

interface Props {
  readonly scene: ChronoScene
  readonly controller: PhysicsBakeController
  onRebakeStarted(inspection: RigidBakeOwnershipInspection): void
}

/**
 * Lists committed physics bakes with ownership/source diagnostics and explicit
 * lifecycle actions. Destructive confirmation stays inline beside the affected
 * record, preserves keyboard order and never relies on color alone. Instances
 * own only transient confirmation/error state; scene mutation remains in the
 * shared controller and normal editor command history.
 */
export default function PhysicsBakeInspector({ scene, controller, onRebakeStarted }: Props) {
  const records = scene.physics?.rigidBakes ?? []
  const generations = scene.physics?.fractureGenerations ?? []
  const [confirmRecordId, setConfirmRecordId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const fractureAppearanceQuality = useMemo(() => {
    const analyses = new Map<string, ReturnType<FractureAppearanceQualityAnalyzer['analyze']>>()
    for (const record of records) {
      if (record.recipe.fractureEvents?.length) {
        analyses.set(record.id, fractureAppearanceQualityAnalyzer.analyze(scene, record.id))
      }
    }
    return analyses
  }, [records, scene])
  const fractureRenderColliderQuality = useMemo(() => {
    const analyses = new Map<string, ReturnType<FractureRenderColliderAnalyzer['analyzeCommittedEvent']>>()
    for (const record of records) {
      if (record.recipe.fractureEvents?.length) {
        analyses.set(record.id, fractureRenderColliderAnalyzer.analyzeCommittedEvent(scene, record.id))
      }
    }
    return analyses
  }, [records, scene])

  const startRebake = (recordId: string) => {
    try {
      const inspection = controller.inspectBake(recordId)
      controller.startRebake(recordId)
      setActionError('')
      setConfirmRecordId(null)
      onRebakeStarted(inspection)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }
  const clear = (inspection: RigidBakeOwnershipInspection) => {
    try {
      controller.clearBake(inspection.record.id, inspection.canSafelyMutate ? undefined : 'discard-edits')
      setActionError('')
      setConfirmRecordId(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  return <section className="space-y-3" aria-label="Applied physics bakes">
    <div>
      <h3 className="font-semibold text-gray-100">Applied bakes</h3>
      <p className="mt-1 text-[10px] leading-4 text-gray-500">
        Re-bake prepares a replacement preview. Existing output stays unchanged until Apply.
      </p>
    </div>
    {actionError && <p role="alert" tabIndex={-1}
      className="rounded border border-red-800 bg-red-950/30 p-2 text-[10px] leading-4 text-red-200">
      {actionError}
    </p>}
    {!records.length ? <InlineNotice>No rigid or fracture bake has been applied to this scene.</InlineNotice>
      : records.slice().reverse().map(record => {
        let inspection: RigidBakeOwnershipInspection
        try {
          inspection = controller.inspectBake(record.id)
        } catch (error) {
          return <article key={record.id} className="rounded border border-red-800/70 bg-red-950/20 p-3">
            <p className="font-medium text-red-200">Bake record cannot be inspected</p>
            <p className="mt-1 break-all text-[10px] text-red-300">{error instanceof Error ? error.message : String(error)}</p>
          </article>
        }
        const confirming = confirmRecordId === record.id
        const ambiguous = inspection.issues.some(issue => issue.kind === 'duplicate-track'
          || issue.kind === 'duplicate-generated-layer')
        const cannotRebake = inspection.sourceState === 'unavailable'
          || (inspection.mode === 'fracture' && !inspection.generation)
        return <article key={record.id} aria-labelledby={`${record.id}-title`}
          className="rounded border border-gray-700 bg-gray-950/50 p-3">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 id={`${record.id}-title`} className="truncate font-medium text-gray-200">
                {inspection.mode === 'fracture' ? 'Voronoi fracture' : 'Rigid body'}
              </h4>
              <p title={record.id} className="mt-1 truncate font-mono text-[9px] text-gray-500">{record.id}</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              <StatusBadge label={ownershipLabel(inspection)} tone={inspection.ownershipState === 'current' ? 'good' : 'warning'} />
              <StatusBadge label={sourceLabel(inspection)} tone={inspection.sourceState === 'current' ? 'good' : 'warning'} />
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] tabular-nums">
            <dt className="text-gray-500">Samples</dt><dd className="text-right text-gray-300">{record.sampleCount}</dd>
            <dt className="text-gray-500">Tracks</dt><dd className="text-right text-gray-300">{record.tracks.length}</dd>
            <dt className="text-gray-500">Bodies</dt><dd className="text-right text-gray-300">{record.recipe.bodies.length}</dd>
          </dl>
          {record.recipe.fractureEvents?.map(event => <FractureEventSummary key={event.id} event={event} />)}
          <FractureHierarchyCard recipe={record.recipe} />
          <FractureBondedClusterCard recipe={record.recipe} />
          {inspection.mode === 'fracture' && <FractureAppearanceQualityCard
            analysis={fractureAppearanceQuality.get(record.id)!} />}
          {inspection.mode === 'fracture' && <FractureTopologyColliderCard
            analysis={fractureRenderColliderQuality.get(record.id)!} />}
          {inspection.issues.length > 0 && <div className="mt-3 rounded border border-amber-800/70 bg-amber-950/20 p-2">
            <p className="text-[10px] font-medium text-amber-200">
              {inspection.issues.length} ownership {inspection.issues.length === 1 ? 'issue' : 'issues'}
            </p>
            <ul className="mt-1 space-y-1 text-[9px] leading-4 text-amber-300">
              {inspection.issues.slice(0, 3).map(issue => <li key={`${issue.kind}:${issue.target}`} className="break-words">
                {issue.message} <span className="font-mono text-amber-400/80">{issue.target}</span>
              </li>)}
            </ul>
          </div>}
          {!confirming ? <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={cannotRebake} onClick={() => startRebake(record.id)} className={secondaryButton}>
              Re-bake…
            </button>
            <button type="button" onClick={() => { setActionError(''); setConfirmRecordId(record.id) }} className={dangerOutlineButton}>
              Clear bake…
            </button>
          </div> : <div aria-labelledby={`${record.id}-confirm-title`}
            className="mt-3 rounded border border-red-800/70 bg-red-950/25 p-3">
            <h5 id={`${record.id}-confirm-title`} className="text-[11px] font-semibold text-red-200">
              {inspection.canSafelyMutate ? 'Clear generated bake output?' : 'Delete changed bake output?'}
            </h5>
            <p className="mt-1 text-[10px] leading-4 text-red-300">
              {confirmationText(inspection, ambiguous)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmRecordId(null)} className={secondaryButton}>Keep bake</button>
              <button type="button" disabled={ambiguous} onClick={() => clear(inspection)} className={dangerButton}>
                {inspection.canSafelyMutate ? 'Clear generated output' : 'Delete edited output'}
              </button>
            </div>
          </div>}
        </article>
      })}
    <p className="text-[10px] leading-4 text-gray-500">
      {generations.length} fracture generation manifest{generations.length === 1 ? '' : 's'} · Clear and Re-bake are single undoable edits.
    </p>
  </section>
}

function StatusBadge({ label, tone }: { label: string; tone: 'good' | 'warning' }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${tone === 'good'
    ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
    : 'border-amber-800/70 bg-amber-950/30 text-amber-200'}`}>{label}</span>
}

function ownershipLabel(inspection: RigidBakeOwnershipInspection): string {
  if (inspection.ownershipState === 'current') return 'Output current'
  if (inspection.ownershipState === 'edited') return 'Output edited'
  if (inspection.ownershipState === 'legacy') return 'Legacy ownership'
  return 'Output incomplete'
}

function sourceLabel(inspection: RigidBakeOwnershipInspection): string {
  if (inspection.sourceState === 'current') return 'Source current'
  if (inspection.sourceState === 'changed') return 'Source changed'
  return 'Source unavailable'
}

function confirmationText(inspection: RigidBakeOwnershipInspection, ambiguous: boolean): string {
  if (ambiguous) return 'Duplicate targets make ownership ambiguous. Resolve duplicate tracks or layer ids before clearing; forced deletion is disabled.'
  if (inspection.canSafelyMutate) return 'Only verified generated tracks, fragment layers, topology and memberships will be removed. Other scene content is preserved.'
  return 'This bake contains edited, missing or legacy-owned output. Continuing explicitly discards the remaining recorded output. Undo restores the entire previous bake.'
}

function InlineNotice({ children }: { children: ReactNode }) {
  return <p className="rounded border border-gray-700 bg-gray-950/40 p-2 text-[10px] leading-4 text-gray-400">{children}</p>
}

const secondaryButton = 'min-h-11 rounded border border-gray-600 px-3 py-2 text-[10px] text-gray-100 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
const dangerOutlineButton = 'min-h-11 rounded border border-red-800/80 px-3 py-2 text-[10px] text-red-200 hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400'
const dangerButton = 'min-h-11 rounded bg-red-700 px-3 py-2 text-[10px] font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300'
