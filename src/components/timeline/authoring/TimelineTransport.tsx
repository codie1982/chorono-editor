import type { TimelineNavigation } from '@/lib/timeline/authoring/timelineNavigation'

const actions: readonly [TimelineNavigation, string, string][] = [
  ['start', '|◀', 'Timeline start (Home)'], ['previousFrame', '◀F', 'Previous frame (Left)'],
  ['previousKey', '◀◆', 'Previous keyframe (,)'], ['firstKey', '|◆', 'First keyframe (Shift+Home)'],
  ['lastKey', '◆|', 'Last keyframe (Shift+End)'], ['nextKey', '◆▶', 'Next keyframe (.)'],
  ['nextFrame', 'F▶', 'Next frame (Right)'], ['end', '▶|', 'Timeline end (End)'],
]

/** Compact, labelled keyboard-accessible navigation. Native buttons preserve
 * Space/Enter activation; time/scope policy belongs solely to the domain. */
export function TimelineTransport({ onNavigate, disabled, scope }: {
  onNavigate: (intent: TimelineNavigation) => void; disabled: boolean; scope: string
}) {
  return <div className="flex flex-col shrink-0 gap-0.5" aria-label="Timeline navigation">
    <div className="flex items-center rounded border border-gray-600" role="group" aria-label="Timeline transport">
      {actions.map(([intent, label, title]) => <button key={intent} aria-label={title} title={title} disabled={disabled}
        onClick={() => onNavigate(intent)} className="min-w-6 h-6 px-1 text-[10px] text-gray-200 hover:bg-gray-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">{label}</button>)}
    </div><span className="text-[9px] text-gray-400">Keys: {scope}</span>
  </div>
}
