'use client'

export type ToolMode =
  | 'select' | 'pan' | 'pen'
  | 'move' | 'rotate' | 'scale' | 'anchor'
  // BL-60 Faz 3 — Canvas selection tools (drag a shape, select layers inside)
  | 'selection-box' | 'selection-lasso' | 'selection-circle' | 'selection-paint'

/** True for any of the four canvas-shape selection tools. */
export function isSelectionTool(m: ToolMode): boolean {
  return m === 'selection-box' || m === 'selection-lasso'
      || m === 'selection-circle' || m === 'selection-paint'
}

interface ToolGroupProps {
  mode:     ToolMode
  onChange: (m: ToolMode) => void
  /** When true, pen tool is auto-active because a path layer is selected. */
  penAuto?: boolean
}

interface ToolBtnProps {
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

function Divider() {
  return <div className="w-px h-5 bg-gray-700 mx-0.5" />
}

/**
 * Tool group — 3DS Max-style isolated transform modes plus the legacy
 * Select / Pan / Pen utilities. Move/Rotate/Scale/Anchor each hide all
 * other gizmos so the user always sees only the handles relevant to the
 * current operation.
 */
export default function ToolGroup({ mode, onChange, penAuto }: ToolGroupProps) {
  const effectivePen = mode === 'pen' || penAuto
  return (
    <div className="flex items-center gap-1">
      <ToolBtn active={mode === 'select'} hint="Select" shortcut="V" onClick={() => onChange('select')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M2 1 L2 12 L5 9 L7 13 L9 12 L7 8 L11 8 Z" />
        </svg>
      </ToolBtn>
      <ToolBtn active={mode === 'pan'} hint="Pan" shortcut="H" onClick={() => onChange(mode === 'pan' ? 'select' : 'pan')}>
        <span className="text-sm">✋</span>
      </ToolBtn>
      <ToolBtn active={!!effectivePen} hint="Pen Tool" shortcut="P" onClick={() => onChange(mode === 'pen' ? 'select' : 'pen')}>
        <span className="text-sm">✎</span>
      </ToolBtn>

      <Divider />

      {/* 3DS Max-style transform tools — each shows only its own gizmo */}
      <ToolBtn active={mode === 'move'} hint="Move" shortcut="G" onClick={() => onChange('move')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1 L8 15 M1 8 L15 8 M8 1 L6 3 M8 1 L10 3 M8 15 L6 13 M8 15 L10 13 M1 8 L3 6 M1 8 L3 10 M15 8 L13 6 M15 8 L13 10" />
        </svg>
      </ToolBtn>
      <ToolBtn active={mode === 'rotate'} hint="Rotate" shortcut="R" onClick={() => onChange('rotate')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 8 A5 5 0 1 1 8 3" />
          <path d="M8 1 L8 5 L12 5" />
        </svg>
      </ToolBtn>
      <ToolBtn active={mode === 'scale'} hint="Scale" shortcut="S" onClick={() => onChange('scale')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="6" height="6" />
          <rect x="9" y="9" width="4" height="4" strokeDasharray="1 1" />
          <path d="M9 9 L13 13 M9 13 L13 13 L13 9" />
        </svg>
      </ToolBtn>
      <ToolBtn active={mode === 'anchor'} hint="Anchor / Pivot" shortcut="A" onClick={() => onChange('anchor')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1 L8 4 M8 12 L8 15 M1 8 L4 8 M12 8 L15 8" strokeLinecap="round" />
        </svg>
      </ToolBtn>

      <Divider />

      {/* BL-60 Faz 3 — Canvas selection tools */}
      <ToolBtn active={mode === 'selection-box'} hint="Box Select" shortcut="B" onClick={() => onChange('selection-box')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2.5" y="2.5" width="11" height="11" strokeDasharray="2 1.5" />
        </svg>
      </ToolBtn>
      <ToolBtn active={mode === 'selection-lasso'} hint="Lasso Select" shortcut="L" onClick={() => onChange('selection-lasso')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6 Q2 2 7 2 Q12 2 13 6 Q13 11 7 11 Q4 11 4 13 L6 14" strokeDasharray="1.5 1" />
        </svg>
      </ToolBtn>
      <ToolBtn active={mode === 'selection-circle'} hint="Circle Select" shortcut="O" onClick={() => onChange('selection-circle')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" strokeDasharray="2 1.5" />
        </svg>
      </ToolBtn>
      <ToolBtn active={mode === 'selection-paint'} hint="Paint Select" shortcut="W" onClick={() => onChange('selection-paint')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 13 L10 6 L11 5 L13 7 L12 8 L5 15 L2 14 Z" fill="currentColor" fillOpacity="0.15" />
        </svg>
      </ToolBtn>
    </div>
  )
}
