import type { KeyCollisionPolicy } from '@/lib/timeline/authoring/keyframeBatch'

/** Explicit opt-in to destination overwrite, shared by all key editors. */
export function BulkEditPolicyControl({ policy, onChange }: { policy: KeyCollisionPolicy; onChange: (policy: KeyCollisionPolicy) => void }) {
  return <label className="flex items-center gap-1 text-[10px] text-gray-300 shrink-0" title="Replace untouched keys at destinations. Edited members still cannot collide.">
    <input type="checkbox" checked={policy === 'overwrite'} onChange={event => onChange(event.target.checked ? 'overwrite' : 'reject')} />Overwrite collisions
  </label>
}
