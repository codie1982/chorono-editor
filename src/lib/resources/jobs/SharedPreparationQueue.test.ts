import { expect, it, vi } from 'vitest'
import { SharedPreparationQueue } from './SharedPreparationQueue'

it('keeps delivery protected through successful and throwing synchronous projections and releases each input once', async () => {
  const value = {}, release = vi.fn(), inputRelease = vi.fn(), prepare = vi.fn(async () => value)
  const queue = new SharedPreparationQueue<object>({ label: 'Test', release })
  const one = queue.request('same', prepare, result => { expect(release).not.toHaveBeenCalled(); return result }, undefined, () => inputRelease)
  const two = queue.request('same', prepare, () => { expect(release).not.toHaveBeenCalled(); throw new Error('projection failed') })
  const rejected = expect(two).rejects.toThrow('projection failed')
  expect(await one).toBe(value); await rejected
  expect(prepare).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledExactlyOnceWith(value)
  expect(inputRelease).toHaveBeenCalledOnce(); expect(queue.size).toBe(0)
  queue.dispose()
})
