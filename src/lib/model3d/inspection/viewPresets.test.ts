import { describe, expect, it } from 'vitest'
import { modelDefaults } from '../source/modelDefaults'
import { inspectionPointerMode, modelViewPreset, modelViewPresetForKey } from './viewPresets'
import { cameraGesture } from '../source/cameraGesture'
import type { ModelViewCamera } from './types'
import { model3dShortcutDefinitions } from './viewShortcuts'
import { modelViewportToolForKey } from './viewportTools'

const camera = (): ModelViewCamera => ({ ...modelDefaults().camera, projection: 'perspective', orthoHeight: 2.8 })

describe('3D viewport shortcuts and projection presets', () => {
  it('keeps axis views in the current projection and makes isometric truly orthographic', () => {
    const input = camera(), before = structuredClone(input)
    expect(modelViewPreset(input, 'top')).toMatchObject({ pitch: 90, projection: 'perspective' })
    expect(modelViewPreset(input, 'bottom')).toMatchObject({ pitch: -90, projection: 'perspective' })
    expect(modelViewPreset(input, 'left')).toMatchObject({ yaw: -90, projection: 'perspective' })
    expect(modelViewPreset(input, 'isometric')).toMatchObject({ projection: 'orthographic', targetX: 0, distance: 3.5 })
    expect(modelViewPreset(modelViewPreset(input, 'isometric'), 'perspective').projection).toBe('perspective')
    expect(input).toEqual(before)
  })
  it('maps only focused viewport keys and tilts without changing yaw or source', () => {
    expect(['F', 'T', 'L', 'B', 'P', 'U', 'Z', 'I'].map(modelViewPresetForKey)).toEqual(['front', 'top', 'left', 'bottom', 'perspective', 'orthographic', 'frame', 'isometric'])
    expect(modelViewPresetForKey('x')).toBeUndefined()
    expect([inspectionPointerMode(0, false, false), inspectionPointerMode(0, true, false), inspectionPointerMode(1, false, false),
      inspectionPointerMode(1, false, true), inspectionPointerMode(1, false, true, true),
      inspectionPointerMode(0, false, true), inspectionPointerMode(2, false, false), inspectionPointerMode(2, true, false)]).toEqual(['orbit', 'pan', 'pan', 'orbit', 'dolly', 'tilt', 'tilt', 'roll'])
    for (const def of model3dShortcutDefinitions) {
      if (def.binding.type === 'keyboard' && !def.id.startsWith('model3d.selection.')) {
        expect(modelViewPresetForKey(def.binding.key) ?? modelViewportToolForKey(def.binding.key)).toBeDefined()
      }
      expect(def.contexts).toEqual(['model3d'])
    }
    expect(model3dShortcutDefinitions.filter(def => def.id.startsWith('model3d.selection.')).map(def => def.binding)).toEqual([
      { type: 'keyboard', key: 'a', meta: true },
      { type: 'keyboard', key: 'delete' },
      { type: 'keyboard', key: 'backspace' },
      { type: 'keyboard', key: 'f10', shift: true },
    ])
    expect(['V', 'G', 'R', 'S', 'H', 'O'].map(modelViewportToolForKey)).toEqual(['select', 'move', 'rotate', 'scale', 'pan', 'orbit'])
    expect(modelViewportToolForKey('p')).toBeUndefined()
    const dolly = cameraGesture(sourceCamera(), 0, 20, 'dolly').camera
    expect(dolly.distance).toBeGreaterThan(camera().distance)
    expect('orthoHeight' in dolly && typeof dolly.orthoHeight === 'number' && dolly.orthoHeight > camera().orthoHeight).toBe(true)
    const source = modelDefaults(), before = structuredClone(source)
    const tilted = cameraGesture(source, 1000, 50, 'tilt')
    expect(tilted.camera.yaw).toBe(source.camera.yaw)
    expect(tilted.camera.pitch).toBe(35)
    expect(cameraGesture(source, 100, 50, 'roll').camera).toMatchObject({ yaw: source.camera.yaw, pitch: source.camera.pitch, roll: 40 })
    expect(source).toEqual(before)
  })
})

function sourceCamera() { return { ...modelDefaults(), camera: camera() } }
