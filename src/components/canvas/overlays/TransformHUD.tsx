import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface TransformHUDProps {
  x: number; y: number
  label: string
  viewport: HTMLElement
}
/** Client-pixel feedback, portalled to the untransformed viewport. Fixed
 * positioning inside the panned artboard used its transformed containing block
 * and applied the window offset twice. Convert once to viewport-local pixels
 * and clamp the measured label inside it. No source/render/export ownership. */
export function TransformHUD({ x, y, label, viewport }: TransformHUDProps) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const bounds = viewport.getBoundingClientRect()
    element.style.left = `${Math.max(6, Math.min(x - bounds.left + 12, viewport.clientWidth - element.offsetWidth - 6))}px`
    element.style.top = `${Math.max(6, Math.min(y - bounds.top + 12, viewport.clientHeight - element.offsetHeight - 6))}px`
  }, [x, y, label, viewport])
  return createPortal(
    <div
      ref={ref} data-testid="transform-hud"
      className="absolute pointer-events-none z-[100] px-2 py-1 rounded text-[11px] font-mono
                 bg-gray-900/90 text-white border border-gray-700 shadow-lg whitespace-nowrap"
    >
      {label}
    </div>, viewport
  )
}
