import type { ChronoScene, Layer, ParameterRef } from '../../types'
import { isTimelineTargetInScope } from '../../timeline/authoring/timelinePropertyScope'
import { sameScriptValue } from './ScriptDataChanges'

export const SCRIPT_TRANSFORM_FIELDS = ['x', 'y', 'scaleX', 'scaleY', 'rotationDeg', 'anchorX', 'anchorY'] as const

/** Discoverable script-write contract; native tools have their own capabilities. */
export const SCRIPT_AUTHORING_CAPABILITIES = Object.freeze({ version: 1, scope: '2D',
  protectedSubtrees: ['model3d', 'model3dInputValues'], boxed3DOuter2DFields: true,
  staticWrites: 'reject-animated-or-driven-fields', locks: 'layer-and-ancestors',
  set: 'shallow-replacement', patch: 'recursive-record-merge-arrays-replace',
  validation: 'changed-fields-no-coercion', unchangedLegacyData: 'preserved',
  unlock: 'separate-flag-only-edit', nativeTools: 'separate-domain-policy' })

/** Scripts own the outer 2D presentation only. Existing boxed 3D payloads may be
 * read/preserved, but neither their creation/deletion nor their internal edits
 * are authorized by this facade. Paths are layer-relative, not string values. */
export function assertScript2DPath(path: string): void {
  if (/^(?:model3d|model3dInputValues)(?:\.|$)/.test(path)) throw new Error('Script edits are limited to 2D fields; use native 3D tools for internal content.')
  if (path.startsWith('transform.') && !SCRIPT_TRANSFORM_FIELDS.some(field => path === `transform.${field}`)) throw new Error('Only 2D transform fields are supported by scripts.')
}

/** Validate changed references without interpreting arbitrary labels/formulas as
 * property paths. The same rule applies to a wire source and its destination. */
function reference(ref: ParameterRef | undefined): void {
  if (ref?.layerId) assertScript2DPath(ref.propertyPath)
}

/** Pure source-transition admission. Runs before publishing each command, and
 * protects legacy internal tracks/references even when a whole timeline/entity
 * is removed. Unchanged old data is never rewritten or revalidated. */
export function assertScript2DTransition(before: ChronoScene, after: ChronoScene): void {
  if (after.mode && after.mode !== '2danimation') throw new Error('Scripts edit only 2D scenes.')
  if (before.mode !== after.mode || before.formatVersion !== after.formatVersion) throw new Error('Scripts cannot change the scene mode or format.')
  const previous = new Map(before.layers.map(layer => [layer.id, layer]))
  const current = new Map(after.layers.map(layer => [layer.id, layer]))
  for (const id of Array.from(new Set([...Array.from(previous.keys()), ...Array.from(current.keys())]))) {
    const a = previous.get(id), b = current.get(id)
    if ((!a || !b) && (a?.type === 'model3d' || b?.type === 'model3d' || a?.model3d || b?.model3d)) throw new Error('Scripts cannot create, copy or delete 3D content.')
    if (!a || !b || a === b) continue
    for (const key of ['model3d', 'model3dInputValues'] as const) {
      const read = (layer: Layer) => (layer as unknown as Record<string, unknown>)[key]
      if (!sameScriptValue(read(a), read(b))) assertScript2DPath(key)
    }
    if (a.type !== b.type && (a.type === 'model3d' || b.type === 'model3d')) throw new Error('Scripts cannot replace the 3D layer type.')
  }
  for (const layer of [...before.layers, ...after.layers]) {
    const old = (before.layers.includes(layer) ? current : previous).get(layer.id)
    if (!sameScriptValue(old?.propertyExpressions, layer.propertyExpressions)) for (const [path, expression] of Object.entries(layer.propertyExpressions?.fields ?? {})) {
      if (!sameScriptValue(expression, old?.propertyExpressions?.fields[path])) {
        assertScript2DPath(path); Object.values(expression.sources).forEach(reference)
      }
    }
    if (!sameScriptValue(old?.inputExpressions, layer.inputExpressions)) for (const [path, value] of Object.entries(layer.inputExpressions?.fields ?? {})) if (!sameScriptValue(value, old?.inputExpressions?.fields[path])) assertScript2DPath(path)
    if (!sameScriptValue(old?.paramBindings, layer.paramBindings)) for (const [path, value] of Object.entries(layer.paramBindings ?? {})) if (value !== old?.paramBindings?.[path]) assertScript2DPath(path)
  }
  const allowedTarget = (target: string) => {
    const match = /^layers\.[^.]+\.(.+)$/.exec(target)
    if (match) assertScript2DPath(match[1])
    if (!isTimelineTargetInScope([...before.layers, ...after.layers], target)) throw new Error('Internal content tracks are read-only in 2D scripts.')
  }
  for (const timeline of [...before.timelines, ...after.timelines]) {
    const opposite = (before.timelines.includes(timeline) ? after : before).timelines.find(item => item.id === timeline.id)
    for (const track of timeline.tracks) if (!sameScriptValue(track, opposite?.tracks.find(item => item.target === track.target))) allowedTarget(track.target)
  }
  for (const wire of [...before.parameterWires ?? [], ...after.parameterWires ?? []]) {
    const other = (before.parameterWires?.includes(wire) ? after : before).parameterWires?.find(item => item.id === wire.id)
    if (!sameScriptValue(wire, other)) { reference(wire.source); reference(wire.target) }
  }
  for (const binding of [...before.bindings, ...after.bindings]) {
    const other = (before.bindings.includes(binding) ? after : before).bindings.find(item => item.id === binding.id)
    if (!sameScriptValue(binding, other)) {
      if (binding.target.type === 'layerProperty') assertScript2DPath(binding.target.property ?? '')
      if (binding.source.type === 'layerProperty') assertScript2DPath(binding.source.property ?? '')
    }
  }
}
