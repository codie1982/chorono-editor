import { validateBakeOptions, type BakeOptions } from './BakeOptions'

/** One bounded exact-end schedule for every value family. A trusted synchronous
 * sampler owns type/domain validation; exceptions abort the complete job.
 * Returned samples are private job data, never implicit scene/Undo payloads. */
export function sampleBakeSignal<T>(sample: (timeMs: number) => T, options: BakeOptions): { timeMs: number; value: T }[] {
  const intervals = validateBakeOptions(options)
  return Array.from({ length: intervals + 1 }, (_, index) => {
    if (options.signal?.aborted) throw new Error('Bake cancelled')
    const timeMs = index === intervals ? options.endMs : Math.min(options.endMs, options.startMs + index * 1000 / options.fps)
    return { timeMs, value: sample(timeMs) }
  })
}
