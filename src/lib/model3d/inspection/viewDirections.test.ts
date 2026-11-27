import { describe, expect, it } from 'vitest'
import { modelDefaults } from '../source/modelDefaults'
import { cameraForViewDirection, VIEW_DIRECTIONS } from './viewDirections'
import type { ModelViewCamera } from './types'

const base = (): ModelViewCamera => ({ ...modelDefaults().camera, projection: 'perspective', orthoHeight: 2.8 })

describe('3D view cube directions', () => {
  it('defines six faces, twelve edges and eight corners with unique names', () => {
    expect(VIEW_DIRECTIONS).toHaveLength(26)
    expect(new Set(VIEW_DIRECTIONS.map(item => item.id)).size).toBe(26)
    expect(new Set(VIEW_DIRECTIONS.map(item => item.label)).size).toBe(26)
    expect(VIEW_DIRECTIONS.filter(item => [item.x, item.y, item.z].filter(Boolean).length === 1)).toHaveLength(6)
    expect(VIEW_DIRECTIONS.filter(item => [item.x, item.y, item.z].filter(Boolean).length === 2)).toHaveLength(12)
  })
  it('snaps exact poles while retaining projection, framing and pole yaw', () => {
    const camera = base(), top = VIEW_DIRECTIONS.find(item => item.label === 'Top')!
    const snapped = cameraForViewDirection(camera, top)
    expect(snapped).toEqual({ ...camera, pitch: 90 })
    expect(cameraForViewDirection(camera, VIEW_DIRECTIONS.find(item => item.label === 'Bottom')!).pitch).toBe(-90)
    expect(cameraForViewDirection(camera, VIEW_DIRECTIONS.find(item => item.label === 'Right')!).yaw).toBe(90)
    expect(cameraForViewDirection(camera, VIEW_DIRECTIONS.find(item => item.label === 'Top Front Right')!).pitch).toBeCloseTo(35.26438968)
  })
  it('chooses the shortest equivalent yaw and leaves source data untouched', () => {
    const camera = { ...base(), yaw: 170, projection: 'orthographic' as const }, before = structuredClone(camera)
    const back = VIEW_DIRECTIONS.find(item => item.label === 'Back')!
    expect(cameraForViewDirection(camera, back).yaw).toBe(180)
    expect(camera).toEqual(before)
  })
  it('levels a rolled view when snapping to a cube direction', () => {
    const camera = { ...base(), roll: 67 }
    expect(cameraForViewDirection(camera, VIEW_DIRECTIONS.find(item => item.label === 'Front')!).roll).toBe(0)
    expect(camera.roll).toBe(67)
  })
})
