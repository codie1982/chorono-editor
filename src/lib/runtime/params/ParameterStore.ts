// ── ParameterStore ────────────────────────────────────────────────────────────
//
// Runtime key-value store for SceneParameter values. Single source of truth
// for "current parameter values" — both the host (setParam from native code)
// and the BindingResolver read/write here.
//
// Includes a subscription mechanism so the renderer / preview UI can re-render
// when a value changes without polling.

export type RuntimeValue = string | number | boolean

export type ParameterListener = (name: string, value: RuntimeValue | undefined) => void

export class ParameterStore {
  private values    = new Map<string, RuntimeValue>()
  private listeners = new Set<ParameterListener>()

  // ── R/W ─────────────────────────────────────────────────────────────────

  set(name: string, value: RuntimeValue): void {
    if (this.values.get(name) === value) return     // no-change short circuit
    this.values.set(name, value)
    this.notify(name, value)
  }

  get(name: string): RuntimeValue | undefined {
    return this.values.get(name)
  }

  has(name: string): boolean {
    return this.values.has(name)
  }

  delete(name: string): void {
    if (!this.values.delete(name)) return
    this.notify(name, undefined)
  }

  /** Snapshot — useful for renderer to pass to ParamValueMap. */
  snapshot(): Map<string, RuntimeValue> {
    return new Map(this.values)
  }

  /** Set many at once with a single notification per key. */
  setMany(entries: Record<string, RuntimeValue>): void {
    for (const [k, v] of Object.entries(entries)) this.set(k, v)
  }

  clear(): void {
    const keys = Array.from(this.values.keys())
    this.values.clear()
    for (const k of keys) this.notify(k, undefined)
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  subscribe(listener: ParameterListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(name: string, value: RuntimeValue | undefined): void {
    this.listeners.forEach(fn => fn(name, value))
  }
}

export const parameterStore = new ParameterStore()
