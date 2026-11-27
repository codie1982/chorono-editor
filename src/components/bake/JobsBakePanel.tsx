'use client'

import { useState, useSyncExternalStore } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { PhysicsBakeController } from '@/components/physics/usePhysicsBakeController'
import type { BakeJobStatus } from '@/lib/bake'
import { mcpPhysicsBakeJobs, type MCPPhysicsBakeJobManager } from '@/lib/mcp/bake/MCPPhysicsBakeJobManager'
import { BakeReportMetrics } from './BakeReportMetrics'
import { BakeJobStatusCard } from './BakeJobStatusCard'
import { MCPBakeJobCard } from './MCPBakeJobCard'

/**
 * Shared editor dock for the currently owned BakeService job.
 *
 * This first product slice exposes the workspace-level rigid/fracture job; the
 * presentation and lifecycle actions are adapter-neutral so cloth, fluid and
 * mesh jobs can be added without copying status semantics. Apply remains
 * enabled only for a reviewed, current preview. Discard releases unpublished
 * buffers and never removes already committed scene data.
 */
export default function JobsBakePanel({ controller, editor, jobManager = mcpPhysicsBakeJobs }: {
  readonly controller: PhysicsBakeController
  readonly editor: Pick<EditorStateReturn, 'dispatchCommand'>
  readonly jobManager?: MCPPhysicsBakeJobManager
}) {
  const [actionError, setActionError] = useState('')
  const remoteJobs = useSyncExternalStore(jobManager.subscribe, jobManager.getSnapshots, jobManager.getSnapshots)
  const { snapshot, descriptor } = controller
  const active = snapshot?.status === 'queued' || snapshot?.status === 'running'
  const committing = snapshot?.status === 'committing'
  const canApply = snapshot?.status === 'preview-ready' && !!snapshot.preview
  const report = snapshot?.preview?.report
  const apply = async () => {
    setActionError('')
    try { await controller.commit() }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
  }
  const jobSummary = summarizeJobs(snapshot?.status, remoteJobs)
  const hasJobs = (!!snapshot && !!descriptor) || remoteJobs.length > 0
  return <div className="flex h-full flex-col gap-3 overflow-auto bg-gray-900 p-3 text-xs text-gray-300" data-testid="jobs-bake-panel">
    <div>
      <h2 className="text-sm font-semibold text-gray-100">Jobs &amp; Bake</h2>
      <p className="mt-1 text-[10px] text-gray-500">Workspace and MCP previews · unpublished runtime ownership</p>
      <p role="status" aria-atomic="true" className="mt-2 min-h-5 rounded border border-gray-700 bg-gray-950/50 px-2 py-1 text-[10px] text-gray-300">
        {jobSummary}
      </p>
    </div>
    {!hasJobs && <div className="min-h-32 rounded border border-dashed border-gray-700 bg-gray-950/25 p-3">
      <p className="leading-5 text-gray-400">No retained bake jobs. Prepare a preview from Physics Simulations or an MCP client.</p>
      <p className="mt-3 text-[10px] leading-4 text-gray-500">Preview data stays outside scene JSON and undo history until Apply.</p>
    </div>}

    {snapshot && descriptor && <section aria-labelledby="workspace-bake-title" className="space-y-2">
      <h3 id="workspace-bake-title" className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Workspace preview</h3>
      <BakeJobStatusCard snapshot={snapshot} announce={false}
        sourceLabel={descriptor.sourceLayerId}
        rangeLabel={`${descriptor.startTimeMs}–${descriptor.startTimeMs + descriptor.durationMs} ms`}
        qualityLabel={report ? `${report.solver} · ${report.execution}` : 'Fixed-step preview'}>
        {report && <BakeReportMetrics report={report} />}
      </BakeJobStatusCard>
      {actionError && <p role="alert" className="rounded border border-red-800 bg-red-950/30 p-2 text-red-200">{actionError}</p>}
      <div className="grid grid-cols-2 gap-2">
        {active
          ? <button type="button" onClick={controller.cancel} className="min-h-11 rounded border border-gray-600 px-3 py-2 text-gray-100 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Cancel</button>
          : <button type="button" disabled={committing} onClick={controller.discard} className="min-h-11 rounded border border-gray-600 px-3 py-2 text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Discard</button>}
        <button type="button" disabled={!canApply || committing} onClick={() => void apply()}
          className="min-h-11 rounded bg-amber-600 px-3 py-2 font-medium text-gray-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          {committing ? 'Applying…' : 'Apply bake'}
        </button>
      </div>
    </section>}

    {remoteJobs.length > 0 && <section aria-labelledby="mcp-bake-title" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="mcp-bake-title" className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">MCP jobs</h3>
        <span className="font-mono text-[10px] tabular-nums text-gray-500">{remoteJobs.length} retained</span>
      </div>
      <div className="space-y-2">
        {remoteJobs.map(job => <MCPBakeJobCard key={job.jobId} snapshot={job} editor={editor} manager={jobManager} />)}
      </div>
    </section>}
  </div>
}

/** Build one contextual live message instead of competing card announcements. */
function summarizeJobs(localStatus: BakeJobStatus | undefined, remoteJobs: ReturnType<MCPPhysicsBakeJobManager['getSnapshots']>): string {
  const statuses = [...(localStatus ? [localStatus] : []), ...remoteJobs.map(job => job.status)]
  if (!statuses.length) return 'No retained bake jobs.'
  const active = statuses.filter(status => status === 'queued' || status === 'running' || status === 'committing').length
  const ready = statuses.filter(status => status === 'preview-ready').length
  const needsAttention = statuses.filter(status => status === 'failed' || status === 'stale').length
  const finished = statuses.length - active - ready - needsAttention
  return [
    `${statuses.length} retained ${statuses.length === 1 ? 'job' : 'jobs'}`,
    active ? `${active} active` : '',
    ready ? `${ready} ready to review` : '',
    needsAttention ? `${needsAttention} need attention` : '',
    finished ? `${finished} finished` : '',
  ].filter(Boolean).join(' · ')
}
