/** Test-only native RAF accounting. Captures actual browser task ownership;
 * driver waits bypass the wrapper so their RAFs do not count as runtime work.
 * No production implementation imports this module. Pending handles are bounded
 * by observed tasks, removed before callbacks/cancellation, never kept forever. */
export function installRuntimeFrameProbe() {
  const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window)
  const active = new Set<number>()
  let requested = 0, completed = 0, maximum = 0
  window.requestAnimationFrame = callback => {
    let id = 0
    id = request(time => { active.delete(id); completed++; callback(time) })
    active.add(id); requested++; maximum = Math.max(maximum, active.size)
    return id
  }
  window.cancelAnimationFrame = id => { active.delete(id); cancel(id) }
  return {
    read: () => ({ active: active.size, requested, completed, maximum }),
    reset: () => { requested = 0; completed = 0; maximum = active.size },
    frames: async (count: number) => {
      for (let i = 0; i < count; i++) await new Promise<void>(resolve => request(() => resolve()))
    },
  }
}
