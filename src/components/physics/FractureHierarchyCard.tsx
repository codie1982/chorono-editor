import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import { Fragment } from 'react'

/** Shows persisted FRACTURE3 lineage and admission usage without editing it. */
export default function FractureHierarchyCard({ recipe }: { readonly recipe: RigidBodyBakeRecipe }) {
  const hierarchy = recipe.fractureHierarchy
  if (!hierarchy) return null
  const rows = [
    ['Depth', hierarchy.usage.depth, hierarchy.limits.maxDepth],
    ['Generations', hierarchy.usage.generations, hierarchy.limits.maxGenerations],
    ['Fragments', hierarchy.usage.fragments, hierarchy.limits.maxFragments],
    ['Triangles', hierarchy.usage.triangles, hierarchy.limits.maxTriangles],
    ['Portable bytes', hierarchy.usage.portableBytes, hierarchy.limits.maxPortableBytes],
  ] as const
  return <section aria-label="Recursive fracture hierarchy"
    className="mt-3 rounded border border-fuchsia-800/70 bg-fuchsia-950/20 p-2">
    <div className="flex items-center justify-between gap-2">
      <h5 className="text-[10px] font-medium text-fuchsia-100">Recursive hierarchy</h5>
      <span className="rounded border border-fuchsia-700/70 px-1.5 py-0.5 text-[9px] text-fuchsia-200">
        {hierarchy.entries.length} generations
      </span>
    </div>
    <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-[9px] tabular-nums">
      <dt className="text-fuchsia-300/70">Resource</dt><dd className="text-right text-fuchsia-200">Used</dd><dd className="text-right text-fuchsia-200">Limit</dd>
      {rows.map(([label, used, limit]) => <Fragment key={label}>
        <dt className="text-fuchsia-300/70">{label}</dt><dd className="text-right text-fuchsia-100">{used}</dd><dd className="text-right text-fuchsia-100">{limit}</dd>
      </Fragment>)}
    </dl>
    <ul className="mt-2 space-y-1 text-[9px] leading-4 text-fuchsia-200">
      {hierarchy.entries.map(entry => <li key={entry.generationId} className="break-all font-mono">
        g{entry.generationIndex} · {entry.generationId}{entry.parentFragmentId ? ` ← ${entry.parentFragmentId}` : ' · root'}
      </li>)}
    </ul>
  </section>
}
