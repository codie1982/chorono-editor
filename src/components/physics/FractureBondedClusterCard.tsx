import type { RigidBodyBakeRecipe } from '@/lib/types/physics'

/** Read-only summary of one committed FRACTURE2 graph and realized breaks. */
export default function FractureBondedClusterCard({ recipe }: { readonly recipe: RigidBodyBakeRecipe }) {
  const cluster = recipe.fractureClusters?.[0]
  if (!cluster) return null
  const graph = cluster.graph
  const breaks = recipe.fractureBondBreakEvents ?? []
  const splitCount = breaks.filter(event => event.componentIds.length > 1).length
  const manualCount = graph.bonds.filter(bond => bond.origin === 'manual').length
  const unbreakableCount = graph.bonds.filter(bond => bond.unbreakable).length
  return <section className="mt-3 rounded border border-cyan-800/70 bg-cyan-950/20 p-2"
    aria-label="Bonded cluster">
    <div className="flex items-center justify-between gap-2">
      <h5 className="text-[10px] font-medium text-cyan-100">Bonded cluster</h5>
      <span className="rounded border border-cyan-800 px-1.5 py-0.5 text-[9px] text-cyan-200">
        {breaks.length ? `${breaks.length} broken` : 'All intact'}
      </span>
    </div>
    <p className="mt-1 truncate font-mono text-[9px] text-cyan-400/80" title={graph.graphId}>{graph.graphId}</p>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] tabular-nums">
      <dt className="text-gray-500">Strategy</dt><dd className="text-right text-gray-300">Compound body</dd>
      <dt className="text-gray-500">Fragments / bonds</dt><dd className="text-right text-gray-300">{graph.fragmentIds.length} / {graph.bonds.length}</dd>
      <dt className="text-gray-500">Manual / unbreakable</dt><dd className="text-right text-gray-300">{manualCount} / {unbreakableCount}</dd>
      <dt className="text-gray-500">Impulse / damage</dt><dd className="text-right text-gray-300">{format(graph.defaults.impulseStrength)} / {format(graph.defaults.damageThreshold)}</dd>
      <dt className="text-gray-500">Breaks / component splits</dt><dd className="text-right text-gray-300">{breaks.length} / {splitCount}</dd>
    </dl>
    {breaks.length > 0 && <ol className="mt-2 space-y-1 border-t border-cyan-900/70 pt-2 text-[9px] leading-4 text-cyan-100">
      {breaks.slice(0, 4).map(event => <li key={event.bondId} className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate" title={event.bondId}>{event.reason} · {event.bondId}</span>
        <span className="shrink-0 font-mono text-cyan-300">{format(event.timeMs)} ms</span>
      </li>)}
      {breaks.length > 4 && <li className="text-cyan-400">+{breaks.length - 4} more break events</li>}
    </ol>}
    <p className="mt-2 text-[9px] leading-4 text-gray-500">Break events are solver-realized and portable. Bond diagnostics are editor-only and never appear in final render or export.</p>
  </section>
}

function format(value: number): string {
  return Number(value.toFixed(3)).toString()
}
