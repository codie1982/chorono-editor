import DropdownButton from '@/components/TopToolbar/DropdownButton'
import type { TimelineNavigation } from '@/lib/timeline/authoring/timelineNavigation'

const actions = [
  { side: 'previous', intent: 'start', label: '|◀', title: 'Timeline start (Home)',
    options: [['start', 'Timeline start (Home)'], ['firstKey', 'First keyframe (Shift+Home)']] },
  { side: 'previous', intent: 'previousFrame', label: '◀', title: 'Previous frame (Left)',
    options: [['previousFrame', 'Previous frame (Left)'], ['previousKey', 'Previous keyframe (,)']] },
  { side: 'next', intent: 'nextFrame', label: '▶', title: 'Next frame (Right)',
    options: [['nextFrame', 'Next frame (Right)'], ['nextKey', 'Next keyframe (.)']] },
  { side: 'next', intent: 'end', label: '▶|', title: 'Timeline end (End)',
    options: [['end', 'Timeline end (End)'], ['lastKey', 'Last keyframe (Shift+End)']] },
] as const

/** Four navigation triggers flank Play as one aligned five-button transport.
 * Short click performs the common frame/boundary action; hold, right-click or
 * ArrowDown opens related key navigation. Existing keyboard shortcuts and the
 * single domain navigation owner remain authoritative. Scope is explained in
 * each menu/tooltip rather than adding a second toolbar text row.
 */
export function TimelineTransport({ onNavigate, disabled, scope, side }: {
  onNavigate: (intent: TimelineNavigation) => void; disabled: boolean; scope: string
  side?: 'previous' | 'next'
}) {
  return <div className="flex items-center gap-1 shrink-0" role="group" aria-label={side ? `${side} Timeline navigation` : 'Timeline transport'}>
    {actions.filter(action => !side || action.side === side).map(action => <DropdownButton key={action.intent}
      label={action.label} ariaLabel={action.title} primaryAction={{ onSelect: () => onNavigate(action.intent), disabled,
        title: `${action.title} · Hold for related actions · Keys: ${scope}`,
        className: 'h-9 min-w-7 px-1.5 inline-flex items-center justify-center rounded border border-gray-600 bg-gray-800 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400',
      }} sections={[{ label: 'Navigate', items: action.options.map(([intent, label]) => ({
        kind: 'action', label, onSelect: () => onNavigate(intent),
      })) }]} status={`Keys: ${scope}`} />)}
  </div>
}
