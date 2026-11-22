'use client'
import { createContext, useContext, type ReactNode } from 'react'

export interface ModelAnimationKeyActions {
  readonly canKey: ReadonlySet<string>
  readonly keyed: ReadonlySet<string>
  setKey(path: string): void
}

const Context = createContext<ModelAnimationKeyActions | null>(null)

/** Keep per-property key controls tied to the private 3D clip. Without an
 * active clip, inspectors remain ordinary static property editors. */
export function ModelAnimationKeyProvider({ value, children }: { value: ModelAnimationKeyActions | null; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** A keyboard-accessible key diamond. Color is paired with an explicit title
 * and pressed state so the current-time state is not conveyed by color alone. */
export function ModelKeyButton({ path }: { path: string }) {
  const actions = useContext(Context)
  if (!actions?.canKey.has(path)) return null
  const active = actions.keyed.has(path)
  return <button type="button" aria-label={`${active ? 'Update' : 'Set'} key for ${path.split('.').slice(-2).join(' ')}`}
    aria-pressed={active} title={active ? 'Key at playhead · update' : 'Set key at playhead'}
    onClick={() => actions.setKey(path)}
    className={`h-6 w-6 shrink-0 rounded border text-sm leading-none focus-visible:outline-2 focus-visible:outline-cyan-300 ${active
      ? 'border-amber-300 bg-amber-700 text-white' : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>◆</button>
}
