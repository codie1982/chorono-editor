'use client'

export type ToolMode = 'select' | 'pan' | 'pen'

interface ToolGroupProps {
  mode:     ToolMode
  onChange: (m: ToolMode) => void
  /** When true, pen tool is auto-active because a path layer is selected. */
  penAuto?: boolean
}

interface ToolBtnProps {
  id:       ToolMode
  active:   boolean
  hint:     string
  shortcut: string
  onClick:  () => void
  children: React.ReactNode
}

function ToolBtn({ active, hint, shortcut, onClick, children }: ToolBtnProps) {
  return (
    <button
      onClick={onClick}
      title={`${hint} (${shortcut})`}
      className={`w-9 h-9 flex items-center justify-center rounded transition-colors text-base
        ${active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
    >
      {children}
    </button>
  )
}

/**
 * Three-button tool group: Select / Pan / Pen.
 * Selection is always default; Pan toggles canvas drag mode; Pen highlights
 * automatically when a path layer is selected (the actual Pen Tool wiring
 * lives in SceneCanvas — this is the visual indicator + manual toggle).
 */
export default function ToolGroup({ mode, onChange, penAuto }: ToolGroupProps) {
  const effectivePen = mode === 'pen' || penAuto
  return (
    <div className="flex items-center gap-1">
      <ToolBtn id="select" active={mode === 'select'} hint="Select" shortcut="V" onClick={() => onChange('select')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M2 1 L2 12 L5 9 L7 13 L9 12 L7 8 L11 8 Z" />
        </svg>
      </ToolBtn>
      <ToolBtn id="pan" active={mode === 'pan'} hint="Pan" shortcut="H" onClick={() => onChange(mode === 'pan' ? 'select' : 'pan')}>
        <span className="text-sm">✋</span>
      </ToolBtn>
      <ToolBtn id="pen" active={!!effectivePen} hint="Pen Tool" shortcut="P" onClick={() => onChange(mode === 'pen' ? 'select' : 'pen')}>
        <span className="text-sm">✎</span>
      </ToolBtn>
    </div>
  )
}
