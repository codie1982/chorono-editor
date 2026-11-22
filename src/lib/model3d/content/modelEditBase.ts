import type { Layer } from '../../types'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { isPrimitiveChannel } from '../animation/modelPrimitiveChannels'
import { modelChannelPaths, modelChannels, readModelChannelValue, writeModelChannelValue } from '../animation/modelChannels'
/** Separate an explicit inspector/gizmo edit from sampled sibling values. Every
 * unchanged typed channel returns to its authored fallback, including
 * leaves driven by exposed parameters or native time. With a local clip, changed
 * keyable leaves also remain at base here: their values belong in native keys.
 * The elapsed render clock is always omitted. No source object is mutated. */
export function modelEditBase(next: Layer, base: Layer, sampled: Layer, withClip: boolean): Layer {
  let result = next
  const keyable = new Set(modelChannels(next.model3d))
  for (const path of modelChannelPaths(base.model3d)) {
    const value = readModelChannelValue(next, path)
    if (value === undefined) continue // Explicit removal of an unkeyed assembly slot.
    const unchanged = readModelChannelValue(next, path) === readModelChannelValue(sampled, path)
    if (!unchanged && !keyable.has(path)) throw new Error('This 3D channel is driven. Edit its exposed input or native clip instead.')
    if (unchanged || withClip && keyable.has(path)) result = writeModelChannelValue(result, path,
      isPrimitiveChannel(path) ? readModelChannelValue(base, path) : readPropertyPath(base, path))
  }
  if (result.model3d?.content) {
    const { timeMs: _sample, ...content } = result.model3d.content
    result = { ...result, model3d: { ...result.model3d, content } }
  }
  return result
}
