import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { emptyScene } from '@/lib/defaults'
import { useCurveDrag } from './useCurveDrag'

describe('curve drag focus and snapshot ordering', () => {
  it('preserves the value committed by an input blur when the first curve key is grabbed', () => {
    const originalKey = { id: 'middle', timeMs: 500, value: 0.5, easing: { type: 'linear' as const } }
    const target = 'layers.probe.opacity'
    let scene = { ...emptyScene(), timelines: [{ id: 'curve', durationMs: 1000, autoplay: false, loop: false,
      tracks: [{ target, keyframes: [originalKey] }] }] }
    const previewTransaction = vi.fn()
    const editor = { getScene: () => scene, beginTransaction: vi.fn(), previewTransaction,
      cancelTransaction: vi.fn(), commitTransaction: vi.fn() } as unknown as EditorStateReturn
    let drag!: ReturnType<typeof useCurveDrag>
    function Capture() {
      drag = useCurveDrag({ editor, timelineId: 'curve', clientToLocal: (x, y) => ({ x, y }),
        getTrackViewport: () => ({ startMs: 0, endMs: 1000, range: { min: 0, max: 1 }, widthPx: 600, heightPx: 300 }) })
      return null
    }
    renderToStaticMarkup(createElement(Capture))
    const focus = vi.fn(() => {
      // A real chart focus blurs the inspector/inline field, whose onBlur
      // commits the pending value synchronously through editor.getScene().
      scene = { ...scene, timelines: [{ ...scene.timelines[0], tracks: [{ target,
        keyframes: [{ ...originalKey, value: 0.7 }] }] }] }
    })
    drag.begin({ button: 0, pointerId: 1, clientX: 300, clientY: 150,
      currentTarget: { ownerSVGElement: { focus }, setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
      preventDefault: vi.fn(), stopPropagation: vi.fn() } as never, originalKey, target)
    drag.move({ pointerId: 1, clientX: 300, clientY: 150, ctrlKey: true } as PointerEvent)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    const preview = previewTransaction.mock.calls[0][0]
    expect(preview.timelines[0].tracks[0].keyframes[0].value).toBe(0.7)
    expect(scene.timelines[0].tracks[0].keyframes[0].value).toBe(0.7)
    drag.cancel()
  })
})
