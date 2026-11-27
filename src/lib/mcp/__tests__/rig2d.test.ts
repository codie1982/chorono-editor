import { expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { fakeEditor } from './support/fakeEditor'

it('binds at the displayed frame, respects preview and revision guards, and undoes a keep-pose detach atomically', async () => {
  const editor = fakeEditor()
  try {
    const layers = ['upper', 'lower', 'target'].map((id, i) => {
      const layer = newRectLayer()
      return { ...layer, id, transform: { ...layer.transform, x: i * 100, y: 0, anchorX: 0, anchorY: 0 } }
    })
    editor.replaceDocument({ ...emptyScene(), layers })
    let editingBlocked = false, targetX = 200
    editor.host.getDisplayedRig = () => ({ clock: null, editingBlocked, frame: evaluateSceneFrame(editor.host.editor.getScene(), 0,
      { baseOverrides: new Map([['layers.target.transform.x', targetX]]) }) })
    const upper = { upperLayerId: 'upper' }
    const link = { layerId: 'lower', driverLayerId: 'upper' }
    await expect(editor.rawCall('link_layer_pivots_2d', link)).rejects.toThrow()
    await editor.call('link_layer_pivots_2d', link)
    await expect(editor.call('link_layer_pivots_2d', { layerId: 'upper', driverLayerId: 'lower' })).rejects.toThrow(/cycle/)
    await editor.call('bind_two_bone_ik_2d', { ...upper, lowerLayerId: 'lower', targetLayerId: 'target' })
    targetX = 130
    const read = await editor.call('get_ik2d_diagnostics', upper)
    expect(read.chains[0].local.target.x).toBe(130)
    expect((await editor.call('get_ik2d_diagnostics', { ...upper, timeMs: 0 })).chains[0].local.target.x).toBe(200)
    const snapshot = editor.host.editor.getScene()
    const detach = { layerId: 'lower', mode: 'keepPose' }
    editingBlocked = true
    await expect(editor.call('unlink_layer_pivots_2d', detach)).rejects.toThrow(/Pause/)
    expect(editor.historyLength()).toBe(2)
    editingBlocked = false
    await editor.call('unlink_layer_pivots_2d', detach)
    const lower = editor.host.editor.getScene().layers[1]
    expect(lower.transform.x).toBeCloseTo(read.chains[0].local.elbow.x)
    expect(lower.pivotLink2d).toBeUndefined()
    expect((await editor.call('get_ik2d_diagnostics')).chains).toEqual([])
    await editor.call('undo')
    expect(editor.host.editor.getScene()).toEqual(snapshot)
  } finally { await editor.close() }
})
