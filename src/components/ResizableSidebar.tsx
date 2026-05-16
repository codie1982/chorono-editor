'use client'
import { useResizablePanel } from '@/app/hooks/useResizablePanel'

interface Props {
  /** Which side the panel lives on — determines which edge gets the drag handle. */
  side: 'left' | 'right'
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
  children: React.ReactNode
}

/**
 * Generic horizontal-resize wrapper for the editor's side panels.
 * Drag handle sits on the interior edge (right for left-side, left for right-side).
 * Width persists to localStorage via the storageKey.
 */
export default function ResizableSidebar({
  side, storageKey, defaultWidth, minWidth, maxWidth, children,
}: Props) {
  // For a LEFT-side panel, the handle is on its RIGHT edge → dragging right grows it
  // For a RIGHT-side panel, the handle is on its LEFT edge → dragging left grows it
  const resize = useResizablePanel({
    storageKey,
    defaultHeight: defaultWidth,
    minHeight: minWidth,
    maxHeight: maxWidth,
    direction: side === 'left' ? 'right' : 'left',
  })

  return (
    <div
      className="relative h-full shrink-0"
      style={{ width: `${resize.height}px` }}
    >
      {children}
      <div
        onPointerDown={resize.onDragHandlePointerDown}
        title="Drag to resize"
        className={`absolute top-0 bottom-0 w-1 cursor-col-resize z-30
          ${side === 'left' ? 'right-0' : 'left-0'}
          ${resize.isResizing ? 'bg-blue-500' : 'hover:bg-blue-500/50'}`}
      />
    </div>
  )
}
