/** Test-page-only wrapper around the real native observer. Counts observed
 * instances, not renderer memory. Disconnected observers leave the strong test
 * set; panel switching can therefore detect missing disconnect calls. The
 * production browser constructor is never changed outside this isolated origin. */
export function installResizeObserverProbe(): () => number {
  const Native = window.ResizeObserver, live = new Set<ResizeObserver>()
  window.ResizeObserver = class extends Native {
    private readonly observed = new Set<Element>()
    observe(target: Element, options?: ResizeObserverOptions): void {
      super.observe(target, options); this.observed.add(target); live.add(this)
    }
    unobserve(target: Element): void {
      super.unobserve(target); this.observed.delete(target)
      if (!this.observed.size) live.delete(this)
    }
    disconnect(): void { super.disconnect(); this.observed.clear(); live.delete(this) }
  }
  return () => live.size
}
