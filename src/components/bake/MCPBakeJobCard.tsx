'use client'

import { useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import PhysicsBakePreview from '@/components/physics/PhysicsBakePreview'
import {
  mcpPhysicsBakeJobs,
  type MCPPhysicsBakeJobManager,
  type MCPPhysicsBakeJobSnapshot,
} from '@/lib/mcp/bake/MCPPhysicsBakeJobManager'
import { BakeReportMetrics } from './BakeReportMetrics'
import { BakeJobStatusCard } from './BakeJobStatusCard'

type JobManagerActions = Pick<MCPPhysicsBakeJobManager,
  'cancel' | 'commitFromUI' | 'discard' | 'inspect' | 'inspectReplacement'>
type BakeEditor = Pick<EditorStateReturn, 'dispatchCommand'>
type PendingAction = 'cancel' | 'apply' | 'discard'

/**
 * Presents one tab-local MCP physics job and its human review actions.
 *
 * Dense preview buffers remain borrowed from the manager and are never copied
 * into React state. Apply publishes through the editor's normal human command
 * path, while cancel and discard only affect unpublished runtime ownership.
 * Instances hold transient UI state for preview disclosure and action errors.
 */
export function MCPBakeJobCard({
  snapshot,
  editor,
  manager = mcpPhysicsBakeJobs,
}: {
  readonly snapshot: MCPPhysicsBakeJobSnapshot
  readonly editor: BakeEditor
  readonly manager?: JobManagerActions
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState('')
  const inspection = snapshot.status === 'preview-ready' ? manager.inspect(snapshot.jobId) : undefined
  const replacement = snapshot.replaceRecordId ? manager.inspectReplacement(snapshot.jobId) : undefined
  const replacementUnavailable = !!snapshot.replaceRecordId && !replacement
  const ambiguousReplacement = replacement?.issues.some(issue => issue.kind === 'duplicate-track'
    || issue.kind === 'duplicate-generated-layer') ?? false
  const active = snapshot.status === 'queued' || snapshot.status === 'running'
  const ready = snapshot.status === 'preview-ready' && !!inspection
  const canCommit = ready && !replacementUnavailable && !ambiguousReplacement
  const report = snapshot.report

  /** Run one user action once and keep any diagnostic beside its job. */
  const run = async (action: PendingAction, operation: () => unknown | Promise<unknown>) => {
    if (pending) return
    setActionError('')
    setPending(action)
    try {
      await operation()
      if (action !== 'cancel') setShowPreview(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(null)
    }
  }

  return <article aria-labelledby={`${snapshot.jobId}-title`} aria-busy={pending ? 'true' : undefined}
    className="rounded border border-gray-700 bg-gray-950/35 p-2.5">
    <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
      <div className="min-w-0">
        <h4 id={`${snapshot.jobId}-title`} className="truncate text-[11px] font-semibold text-gray-200">
          {snapshot.mode === 'fracture' ? 'Fracture preview' : 'Rigid preview'}
        </h4>
        <p title={snapshot.jobId} className="mt-0.5 truncate font-mono text-[9px] text-gray-500">{snapshot.jobId}</p>
      </div>
      <span className="shrink-0 rounded border border-blue-800/70 bg-blue-950/40 px-1.5 py-0.5 text-[9px] font-medium text-blue-200">
        MCP
      </span>
    </div>

    <BakeJobStatusCard snapshot={snapshot} announce={false}
      sourceLabel={snapshot.sourceLayerId}
      rangeLabel={`Timeline ${snapshot.timelineId}`}
      qualityLabel={report ? `${report.solver} · ${report.execution}` : 'Fixed-step preview'}>
      {report && <BakeReportMetrics report={report} />}
    </BakeJobStatusCard>

    {showPreview && inspection && <div className="mt-2">
      <PhysicsBakePreview scene={inspection.scene} preview={inspection.preview} />
    </div>}
    {snapshot.replaceRecordId && <p className={`mt-2 rounded border p-2 text-[10px] leading-4 ${replacement?.canSafelyMutate
      ? 'border-gray-700 bg-gray-950/40 text-gray-400'
      : 'border-amber-800/70 bg-amber-950/25 text-amber-200'}`}>
      {replacementUnavailable
        ? 'Replacement ownership is unavailable. Inspect or repair the committed bake before applying.'
        : ambiguousReplacement
          ? 'Duplicate generated targets make replacement ambiguous. Resolve them before applying.'
          : replacement?.canSafelyMutate
            ? `This preview safely replaces ${snapshot.replaceRecordId}.`
            : `Edited or legacy output detected in ${snapshot.replaceRecordId}. Apply requires an explicit destructive Replace choice.`}
    </p>}
    {actionError && <p role="alert" tabIndex={-1}
      className="mt-2 rounded border border-red-800/70 bg-red-950/30 p-2 text-[10px] leading-4 text-red-200">
      {actionError}
    </p>}

    <div className="mt-2 grid grid-cols-2 gap-2">
      {active ? <button type="button" disabled={!!pending}
        onClick={() => void run('cancel', () => manager.cancel(snapshot.jobId))}
        className="col-span-2 min-h-11 rounded border border-gray-600 px-3 py-2 text-gray-100 hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        {pending === 'cancel' ? 'Cancelling…' : 'Cancel job'}
      </button> : ready ? <>
        <button type="button" aria-expanded={showPreview} disabled={!!pending}
          onClick={() => setShowPreview(value => !value)}
          className="col-span-2 min-h-11 rounded border border-gray-600 px-3 py-2 text-gray-100 hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          {showPreview ? 'Hide preview' : 'Review preview'}
        </button>
        <button type="button" disabled={!!pending}
          onClick={() => void run('discard', () => manager.discard(snapshot.jobId))}
          className="min-h-11 rounded border border-gray-600 px-3 py-2 text-gray-200 hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          {pending === 'discard' ? 'Discarding…' : 'Discard'}
        </button>
        <button type="button" disabled={!!pending || !canCommit}
          onClick={() => void run('apply', () => manager.commitFromUI(
            snapshot.jobId,
            editor,
            replacement?.canSafelyMutate === false ? 'discard-edits' : 'reject',
          ))}
          className={`min-h-11 rounded px-3 py-2 font-medium disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 ${replacement?.canSafelyMutate === false
            ? 'bg-red-700 text-white hover:bg-red-600 focus-visible:ring-red-300'
            : 'bg-amber-600 text-gray-950 hover:bg-amber-500 focus-visible:ring-amber-300'}`}>
          {pending === 'apply' ? 'Applying…' : replacement?.canSafelyMutate === false
            ? 'Replace edited bake' : snapshot.replaceRecordId ? 'Replace bake' : 'Apply bake'}
        </button>
      </> : <button type="button" disabled={!!pending}
        onClick={() => void run('discard', () => manager.discard(snapshot.jobId))}
        className="col-span-2 min-h-11 rounded border border-gray-600 px-3 py-2 text-gray-200 hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        {pending === 'discard' ? 'Removing…' : 'Remove from list'}
      </button>}
    </div>
  </article>
}
