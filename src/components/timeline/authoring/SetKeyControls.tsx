'use client'
import { shortcutRegistry } from '@/lib/shortcuts'
import type { TimelineAuthoringControls } from './useTimelineAuthoring'
import type { KeysetMode } from '@/lib/timeline/authoring/keyableChannels'
import DropdownButton from '@/components/TopToolbar/DropdownButton'

const KEYSETS: readonly { value: KeysetMode; label: string }[] = [
  { value: 'all', label: 'All supported channels' }, { value: 'transform', label: 'Transform + opacity' },
  { value: 'animated', label: 'Existing animated channels' }, { value: 'selected', label: 'Selected key channels' },
]
const PRESETS = [
  { label: 'Position (X, Y)', paths: ['transform.x', 'transform.y'] },
  { label: 'Scale (X, Y)', paths: ['transform.scaleX', 'transform.scaleY'] },
  { label: 'Rotation', paths: ['transform.rotationDeg'] }, { label: 'Opacity', paths: ['opacity'] },
  { label: 'Transform (all)', paths: ['transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY', 'transform.rotationDeg'] },
  { label: 'All (transform + opacity)', paths: ['opacity', 'transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY', 'transform.rotationDeg'] },
]

/** One authoring control: click sets the current keyset, hold opens options.
 * Choosing a keyset only changes UI state; a channel preset writes keys through
 * the same guarded authoring owner as the main action and shortcut. Options
 * also open with ArrowDown/Up, Shift+F10 or right-click. No duplicated command.
 */
export function SetKeyControls({ controls }: { controls: TimelineAuthoringControls }) {
  const key = shortcutRegistry.displayString('timeline.keyframe.set')
  const keyset = KEYSETS.find(item => item.value === controls.keyset)!.label
  return <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Set Key">
    <DropdownButton label="◆ Set Key" primaryAction={{ onSelect: () => controls.setKey(), disabled: controls.disabled || !controls.selectedCount,
      title: `Set keys${key ? ` (${key})` : ''} · ${keyset}. Hold for channels; ArrowDown or right-click opens options.`,
      className: 'px-3 py-1.5 whitespace-nowrap text-xs font-semibold rounded bg-amber-500 text-gray-950 hover:bg-amber-400 active:bg-amber-300 disabled:bg-gray-700 disabled:text-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
    }} sections={[
      { label: 'Keyset for click / shortcut', items: KEYSETS.map(item => ({ kind: 'action', label: `${item.value === controls.keyset ? '✓ ' : ''}${item.label}`,
        onSelect: () => controls.setKeyset(item.value) })) },
      { label: 'Set keys now', items: PRESETS.map(preset => ({ kind: 'action', label: preset.label, onSelect: () => controls.setKey(preset.paths) })) },
    ]} status={`Current keyset: ${keyset}`} />
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
