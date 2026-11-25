import { useRef } from 'react'
import { buildSplineData, type AnchorSpec } from '@/lib/spline/util/buildSplineData'
import { translateSplineData } from '@/lib/spline'
import { shouldAutoClose } from '@/lib/spline/creation/autoClose'
import { useSplineBoxDrawing } from './useSplineBoxDrawing'
import type { SplinePathData } from '@/lib/types/spline'
type Point = { x: number; y: number }
type DrawingKind = 'custom' | 'freehand'

/** Pen clicks create corners and drags place symmetric handles. Freehand
 * samples in screen pixels and completes on release. The transient gesture
 * owns its pointer and anchor list; only finish hands a full path to history. */
export function useSplineStrokeDrawing(options: {
  enabled: boolean
  element(): Element | null
  point(sample: { clientX: number; clientY: number }): Point | null
  zoom(): number
  autoClose(): boolean
  preview(value: { d: string; fill: boolean } | null): void
  commit(data: SplinePathData, x: number, y: number, open: boolean, name: string): void
  cancelSession(): void
  warning(message: string): void
}) {
  const anchors = useRef<AnchorSpec[]>([]),
    kind = useRef<DrawingKind>('custom')
  const press = useRef<Point | null>(null)
  const clear = () => {
    press.current = null
    anchors.current = []
    options.preview(null)
  }
  const show = (hover?: Point) => {
    const points = anchors.current
    if (!points.length) return
    let d = 'M ' + points[0].x + ' ' + points[0].y
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        c = a.out ?? a,
        e = b.in ?? b
      d +=
        a.out || b.in
          ? ' C ' + c.x + ' ' + c.y + ' ' + e.x + ' ' + e.y + ' ' + b.x + ' ' + b.y
          : ' L ' + b.x + ' ' + b.y
    }
    const end = points[points.length - 1]
    if (hover && kind.current === 'custom' && !press.current) {
      const out = end.out ?? end
      d += ' C ' + out.x + ' ' + out.y + ' ' + hover.x + ' ' + hover.y + ' ' + hover.x + ' ' + hover.y
    } else if (press.current && end.in && end.out)
      d += ' M ' + end.in.x + ' ' + end.in.y + ' L ' + end.out.x + ' ' + end.out.y
    options.preview({ d, fill: false })
  }
  const finish = (closed: boolean) => {
    const points = anchors.current
    clear()
    if (points.length < 2) {
      options.cancelSession()
      return
    }
    closed = closed && points.length >= 3
    const name = kind.current === 'custom' ? 'Pen' : 'Freehand'
    const data = buildSplineData({ kind: kind.current, source: 'drawn', name, contours: [{ anchors: points, closed }] })
    Object.values(data.subShapes)[0].editable = true
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y)
    const x = (Math.min(...xs) + Math.max(...xs)) / 2,
      y = (Math.min(...ys) + Math.max(...ys)) / 2
    options.commit(translateSplineData(data, -x, -y), x, y, !closed, name + ' Spline')
  }
  const sample = (p: Point, final = false) => {
    const last = anchors.current.at(-1)
    if (!last) return
    const distance = Math.hypot(p.x - last.x, p.y - last.y) * options.zoom()
    if (kind.current === 'freehand') {
      if (distance > (final ? 0.25 : 2)) {
        if (anchors.current.length >= 8192) {
          clear()
          options.cancelSession()
          options.warning('Freehand exceeds 8192 samples. Draw a shorter contour.')
          return
        }
        anchors.current.push({ ...p, type: 'corner' })
      }
    } else if (press.current && Math.hypot(p.x - press.current.x, p.y - press.current.y) * options.zoom() >= 2) {
      p = { x: last.x + p.x - press.current.x, y: last.y + p.y - press.current.y }
      last.type = 'bezier'
      last.out = p
      last.in = { x: 2 * last.x - p.x, y: 2 * last.y - p.y }
    } else {
      last.type = 'corner'
      delete last.in
      delete last.out
    }
  }
  const gesture = useSplineBoxDrawing({
    enabled: options.enabled,
    element: options.element,
    move(e) {
      const p = options.point(e)
      if (p) {
        sample(p)
        show()
      }
    },
    up(e) {
      const p = options.point(e)
      if (p) sample(p, true)
      if (kind.current === 'freehand') {
        const pts = anchors.current,
          close = !!p && options.autoClose() && pts.length >= 4 && shouldAutoClose(pts, pts[0], p, options.zoom())
        if (close) pts.pop()
        finish(close)
      } else {
        press.current = null
        show()
      }
    },
    cancel: () => {
      clear()
      options.cancelSession()
    },
  })
  return {
    hover(p: Point) {
      if (!anchors.current.length || press.current) return false
      show(p)
      return true
    },
    down(tool: DrawingKind, p: Point, pointerId: number, raw: Point) {
      kind.current = tool
      if (
        tool === 'custom' &&
        options.autoClose() &&
        anchors.current.length &&
        shouldAutoClose(anchors.current, anchors.current[0], p, options.zoom())
      ) {
        finish(true)
        return
      }
      if (tool === 'freehand') anchors.current = []
      const last = anchors.current.at(-1)
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-7) return
      if (anchors.current.length >= 8192) {
        options.warning('Pen contour exceeds 8192 anchors. Finish the current contour.')
        return
      }
      press.current = raw
      anchors.current.push({ ...p, type: 'corner' })
      show()
      gesture.start(pointerId)
    },
    finish(closed: boolean) {
      if (!anchors.current.length) return false
      finish(closed)
      return true
    },
    backspace() {
      if (!anchors.current.length) return false
      anchors.current.pop()
      if (anchors.current.length) show()
      else clear()
      return true
    },
    cancel() {
      gesture.cancel()
      clear()
    },
  }
}
