import { useEffect, useRef } from 'react'
import type { GradientFill } from '@/lib/types'
import { buildGradient } from '@/lib/render/buildGradient'

/** Preview the exact Canvas paint, including non-CSS diamond/reflection and
 * alpha. This component owns one small DOM canvas and releases it on unmount. */
export function GradientSwatch({ gradient }: { gradient: GradientFill }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = buildGradient(context, gradient, canvas.width, canvas.height) ?? 'transparent'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }, [gradient])
  return <canvas ref={ref} aria-label="Gradient preview" width={256} height={24} className="h-6 w-full rounded border border-gray-600"
    style={{ background: 'repeating-conic-gradient(#475569 0% 25%,#1e293b 0% 50%) 0/12px 12px' }} />
}
