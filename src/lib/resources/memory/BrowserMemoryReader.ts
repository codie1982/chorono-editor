export interface MemoryPlatform {
  secure: boolean
  isolated: boolean
  heap?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
  measure?: () => Promise<{ bytes: number }>
}
export interface BrowserMemorySnapshot {
  heap: { used: number; allocated: number; limit: number } | null
  page: { status: 'unsupported' | 'ready' | 'pending' | 'complete' | 'error'; bytes: number | null; sampledAt: number | null; reason: string }
}

/** Reads capabilities without creating contexts or changing isolation/security headers. */
function currentPlatform(): MemoryPlatform {
  const perf = typeof performance === 'undefined' ? undefined : performance as Performance & {
    memory?: MemoryPlatform['heap']
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
  }
  return {
    secure: typeof isSecureContext !== 'undefined' && isSecureContext,
    isolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    heap: perf?.memory,
    measure: perf?.measureUserAgentSpecificMemory?.bind(perf),
  }
}

/**
 * Browser-scoped estimates, separate from owned-resource accounting. Legacy
 * Chromium heap can include/exclude other realms: it is not project/process RAM.
 * Expensive page measurement is explicit, single-flight and never polled.
 * Only aggregate bytes are retained; attribution URLs are deliberately discarded.
 * https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory
 */
export class BrowserMemoryReader {
  private page: BrowserMemorySnapshot['page'] | null = null
  private pending: Promise<void> | null = null
  constructor(private platform: () => MemoryPlatform = currentPlatform) {}

  /** Returns current cheap heap estimates and the last manually sampled page estimate. */
  getSnapshot(): BrowserMemorySnapshot {
    const platform = this.platform()
    const values = platform.heap
    const heap = values && [values.usedJSHeapSize, values.totalJSHeapSize, values.jsHeapSizeLimit]
      .every(n => Number.isFinite(n) && n >= 0)
      ? { used: values.usedJSHeapSize, allocated: values.totalJSHeapSize, limit: values.jsHeapSizeLimit } : null
    const available = platform.secure && platform.isolated && !!platform.measure
    return { heap, page: this.page ? { ...this.page } : {
      status: available ? 'ready' : 'unsupported', bytes: null, sampledAt: null,
      reason: available ? '' : 'Bu tarayıcı/bağlam sayfa bellek ölçümünü sağlamıyor; güvenli ve cross-origin isolated bağlam gerekir.',
    } }
  }

  /** Starts at most one platform measurement; failures remain diagnostics, never zero bytes. */
  requestSample(): Promise<void> {
    if (this.pending) return this.pending
    const platform = this.platform()
    if (!platform.secure || !platform.isolated || !platform.measure) return Promise.resolve()
    this.page = { status: 'pending', bytes: null, sampledAt: null, reason: '' }
    this.pending = Promise.resolve().then(() => platform.measure!()).then(result => {
      if (!Number.isFinite(result.bytes) || result.bytes < 0) throw new Error('Geçersiz bellek ölçümü')
      this.page = { status: 'complete', bytes: result.bytes, sampledAt: Date.now(), reason: '' }
    }).catch(() => {
      this.page = { status: 'error', bytes: null, sampledAt: null, reason: 'Tarayıcı bellek örneğini tamamlayamadı.' }
    }).finally(() => { this.pending = null })
    return this.pending
  }
}

export const browserMemoryReader = new BrowserMemoryReader()
