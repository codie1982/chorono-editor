import type { AgentHandoffContext } from './prompt'

/** An ephemeral focus record owned by this browser tab. Scene source is always read live via MCP. */
export class AgentHandoffStore {
  private readonly records = new Map<string, { context: AgentHandoffContext; expiresAt: number }>()

  constructor(private readonly now: () => number = Date.now, private readonly ttlMs = 10 * 60_000, private readonly maxRecords = 32) {}

  create(context: AgentHandoffContext): string {
    this.prune()
    const id = crypto.randomUUID()
    this.records.set(id, { context: {
      ...context,
      compositionSize: { ...context.compositionSize },
      layers: context.layers.map(layer => ({ ...layer })),
      ...(context.point ? { point: { ...context.point } } : {}),
    }, expiresAt: this.now() + this.ttlMs })
    while (this.records.size > this.maxRecords) this.records.delete(this.records.keys().next().value!)
    return id
  }

  get(id: string): AgentHandoffContext | undefined {
    this.prune()
    const record = this.records.get(id)
    if (!record) return undefined
    return {
      ...record.context,
      compositionSize: { ...record.context.compositionSize },
      layers: record.context.layers.map(layer => ({ ...layer })),
      ...(record.context.point ? { point: { ...record.context.point } } : {}),
    }
  }

  private prune(): void {
    const now = this.now()
    this.records.forEach((record, id) => { if (record.expiresAt <= now) this.records.delete(id) })
  }
}

export const agentHandoffStore = new AgentHandoffStore()
