'use client'

interface Props {
  onClose: () => void
}

interface ShortcutRow {
  keys: string
  description: string
}

interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const META = isMac ? '⌘' : 'Ctrl'

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Playback',
    rows: [
      { keys: 'Space',       description: 'Play / pause' },
      { keys: '←  /  →',     description: 'Step back / forward one frame' },
      { keys: 'Shift + ← / →', description: 'Step back / forward ten frames' },
    ],
  },
  {
    title: 'History',
    rows: [
      { keys: `${META} + Z`,         description: 'Undo' },
      { keys: `${META} + Shift + Z`, description: 'Redo' },
    ],
  },
  {
    title: 'Selection & Editing',
    rows: [
      { keys: 'Click keyframe',      description: 'Select (replace selection)' },
      { keys: 'Shift + click',        description: 'Toggle keyframe in selection' },
      { keys: `${META} + drag`,       description: 'Disable snap while dragging' },
      { keys: `${META} + C`,          description: 'Copy selected keyframes' },
      { keys: `${META} + V`,          description: 'Paste at playhead' },
      { keys: `${META} + D`,          description: 'Duplicate selected layer' },
      { keys: 'Delete / Backspace',   description: 'Delete selected keyframes (or layer)' },
      { keys: 'Esc (while dragging)', description: 'Cancel drag' },
    ],
  },
  {
    title: 'Viewport',
    rows: [
      { keys: 'Scroll',         description: 'Zoom around cursor' },
      { keys: 'Shift + scroll', description: 'Pan horizontally' },
    ],
  },
  {
    title: 'Help',
    rows: [
      { keys: `${META} + /`, description: 'Open this dialog' },
    ],
  },
]

/**
 * Static keyboard-shortcut reference. Triggered by Cmd+/ — closes on outer
 * click, Escape, or the X button.
 */
export default function ShortcutHelpModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-lg w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
            Keyboard Shortcuts
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-semibold">
                {g.title}
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-800 last:border-0">
                      <td className="py-1.5 pr-3 w-32">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono text-[11px]">
                          {r.keys}
                        </span>
                      </td>
                      <td className="py-1.5 text-gray-400">{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
