import type { ArraySettings } from '@/lib/array/ArrayTypes'
import type { ArrayAuthoringController } from './useArrayAuthoring'

export type ArrayHandleKind = 'step' | 'column' | 'row' | 'center'
export interface ArrayHandlePoint { kind: ArrayHandleKind; label: string; world: { x: number; y: number } }
type Reference = NonNullable<ArrayAuthoringController['plan']>['reference']

/** Handle positions use exactly the native plan's selected coordinate frame.
 * Linear total-span handle edits the entered span, not a hidden divided step.
 * Radial center is an absolute point; move/spacing fields are vectors. */
export function arrayHandlePoints(settings: ArraySettings, reference: Reference): ArrayHandlePoint[] {
  const vector = (value: { x: number; y: number }) => {
    const delta = reference.spaceToWorld.applyToVector(value)
    return { x: reference.pivotWorld.x + delta.x, y: reference.pivotWorld.y + delta.y }
  }
  if (settings.pattern === 'linear') return [{ kind: 'step', label: 'Array move handle', world: vector(settings.move) }]
  if (settings.pattern === 'grid') return [{ kind: 'column', label: 'Array column handle', world: vector(settings.columnMove) },
    { kind: 'row', label: 'Array row handle', world: vector(settings.rowMove) }]
  if (settings.pattern === 'radial') return [{ kind: 'center', label: 'Array center handle', world: reference.spaceToWorld.applyToPoint(settings.center) }]
  return []
}

/** Convert an edited world handle back to its numeric field without touching
 * the source scene. Degenerate/non-finite pointer samples refuse explicitly. */
export function arraySettingsFromHandle(settings: ArraySettings, reference: Reference,
  kind: ArrayHandleKind, world: { x: number; y: number }): ArraySettings {
  if (![world.x, world.y].every(Number.isFinite)) throw new Error('Array handle coordinates must be finite.')
  const point = kind === 'center' ? reference.worldToSpace.applyToPoint(world)
    : reference.worldToSpace.applyToVector({ x: world.x - reference.pivotWorld.x, y: world.y - reference.pivotWorld.y })
  if (![point.x, point.y].every(Number.isFinite)) throw new Error('The Array coordinate frame is not invertible.')
  if (settings.pattern === 'linear' && kind === 'step') return { ...settings, move: point }
  if (settings.pattern === 'grid' && kind === 'column') return { ...settings, columnMove: point }
  if (settings.pattern === 'grid' && kind === 'row') return { ...settings, rowMove: point }
  if (settings.pattern === 'radial' && kind === 'center') return { ...settings, center: point }
  return settings
}
