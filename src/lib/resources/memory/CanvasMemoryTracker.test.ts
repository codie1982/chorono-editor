import { expect, it } from 'vitest'
import { CanvasMemoryTracker } from './CanvasMemoryTracker'

it('counts each live canvas once at current dimensions, including detached and WebGL backing', () => {
  const tracker = new CanvasMemoryTracker()
  const canvas = { width: 100, height: 50 }, gl = { width: 20, height: 10 }
  tracker.track(canvas); tracker.track(canvas); tracker.track(gl, 'webgl')
  expect(tracker.getSnapshot()).toMatchObject({ canvas2dBytes: 20000, canvas2dCount: 1, webglBytes: 800, webglCount: 1 })
  canvas.width = 0
  expect(tracker.getSnapshot()).toMatchObject({ canvas2dBytes: 0, canvas2dCount: 0, webglBytes: 800 })
  gl.width = 40
  expect(tracker.getSnapshot().webglBytes).toBe(1600)
})
