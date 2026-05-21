// ── Fit / View menu (opens upward from the zoom pill) ───────────────────────

export interface FitMenuActions {
  fitAll:          () => void
  fitWidth:        () => void
  fitHeight:       () => void
  actualSize:      () => void
  fitSelection:    () => void
  centreSelection: () => void
  zoom50:          () => void
  zoom200:         () => void
  zoom400:         () => void
  toggleFullscreen?: () => void
}

interface FitMenuProps {
  hasSelection: boolean
  fullscreen:   boolean
  actions: FitMenuActions
  onPick: (action: () => void) => void
}

export function FitMenu({ hasSelection, fullscreen, actions, onPick }: FitMenuProps) {
  type Item =
    | { kind: 'item'; label: string; kbd?: string; action: () => void; disabled?: boolean }
    | { kind: 'separator' }
    | { kind: 'heading'; label: string }

  const items: Item[] = [
    { kind: 'heading', label: 'Fit composition' },
    { kind: 'item', label: 'Fit to view',     kbd: 'F',  action: actions.fitAll },
    { kind: 'item', label: 'Fit width',                  action: actions.fitWidth },
    { kind: 'item', label: 'Fit height',                 action: actions.fitHeight },
    { kind: 'separator' },
    { kind: 'heading', label: 'Selection' },
    { kind: 'item', label: 'Fit selection',  kbd: '⇧2', action: actions.fitSelection,    disabled: !hasSelection },
    { kind: 'item', label: 'Centre selection',          action: actions.centreSelection, disabled: !hasSelection },
    { kind: 'separator' },
    { kind: 'heading', label: 'Zoom presets' },
    { kind: 'item', label: 'Actual size (100%)', kbd: '0', action: actions.actualSize },
    { kind: 'item', label: '50%',                          action: actions.zoom50 },
    { kind: 'item', label: '200%',                         action: actions.zoom200 },
    { kind: 'item', label: '400%',                         action: actions.zoom400 },
    ...(actions.toggleFullscreen ? [
      { kind: 'separator' as const },
      { kind: 'item' as const,
        label: fullscreen ? '⛶ Exit fullscreen' : '⛶ Fullscreen canvas',
        kbd: 'Esc / F11',
        action: actions.toggleFullscreen },
    ] : []),
  ]

  return (
    <div className="absolute bottom-full right-0 mb-1 min-w-[200px]
                    bg-gray-900 border border-gray-700 rounded shadow-xl
                    py-1 z-50 select-none">
      {items.map((it, i) => {
        if (it.kind === 'separator') return <div key={i} className="h-px bg-gray-800 my-1" />
        if (it.kind === 'heading') return (
          <div key={i} className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-gray-500 font-semibold">
            {it.label}
          </div>
        )
        return (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => !it.disabled && onPick(it.action)}
            className={`w-full flex items-center justify-between gap-6 px-3 py-1.5 text-xs
              ${it.disabled
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
          >
            <span>{it.label}</span>
            {it.kbd && <span className="text-[10px] text-gray-500 font-mono">{it.kbd}</span>}
          </button>
        )
      })}
    </div>
  )
}
