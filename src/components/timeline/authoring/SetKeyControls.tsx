'use client'
import { shortcutRegistry } from '@/lib/shortcuts'
import type { TimelineAuthoringControls } from './useTimelineAuthoring'
import type { KeysetMode } from '@/lib/timeline/authoring/keyableChannels'

/** Visible primary authoring command and explicit keyset. Source scope is shown
 * beside the button; an absent shortcut never advertises an unavailable K. */
export function SetKeyControls({ controls }: { controls: TimelineAuthoringControls }) {
  const key = shortcutRegistry.displayString('timeline.keyframe.set')
  return <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Set Key">
    <button onClick={() => controls.setKey()} disabled={controls.disabled || !controls.selectedCount}
      title={`Set keys for the selected layers${key ? ` (${key})` : ''}`}
      className="px-3 py-1.5 text-xs font-semibold rounded bg-amber-500 text-gray-950 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      ◆ Set Key{key && <span className="ml-2 text-[10px] opacity-70">{key}</span>}
    </button>
    <select aria-label="Set Key channels" value={controls.keyset} onChange={event => controls.setKeyset(event.target.value as KeysetMode)}
      className="max-w-[145px] bg-gray-800 border border-gray-600 text-gray-200 rounded px-1 py-1 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
      <option value="all">All supported channels</option><option value="transform">Transform + opacity</option>
      <option value="animated">Existing animated channels</option><option value="selected">Selected key channels</option>
    </select>
  </div>
}

/** Partial plans require explicit Apply. Diagnostics and mode are UI state;
 * cancel/dismiss cannot author source. The command itself checks stale data. */
export function SetKeyReview({ controls }: { controls: TimelineAuthoringControls }) {
  if (!controls.notice) return null
  return <div className="shrink-0 border-b border-gray-700 px-3 py-1 text-[11px] text-gray-200 bg-gray-800" role="status">
    <div className="flex items-center flex-wrap gap-2"><span>{controls.notice}</span>
      {controls.pending?.command && <button className="text-amber-300 underline focus-visible:outline" onClick={controls.applyPending}>Set supported keys</button>}
      <button className="ml-auto text-gray-300 underline focus-visible:outline" onClick={controls.dismiss}>{controls.pending ? 'Cancel' : 'Dismiss'}</button>
    </div>
    {!!controls.pending?.diagnostics.length && <details><summary className="cursor-pointer">Skipped channels</summary>
      <ul className="max-h-32 overflow-auto">{controls.pending.diagnostics.map((item, index) => <li key={index}>{item.target}: {item.reason}</li>)}</ul>
    </details>}
  </div>
}
