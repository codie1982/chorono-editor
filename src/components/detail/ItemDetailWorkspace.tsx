'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { detailDrivenReason, type ItemDetailSession } from '@/lib/editor/detail'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { projectIsolationView } from '@/lib/scene/visibility/isolationView'
import type { Layer } from '@/lib/types'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import SceneCanvas from '@/components/SceneCanvas'
import { DetailPathPoints } from './DetailPathPoints'
import styles from './ItemDetailWorkspace.module.css'

const DRAFT_HISTORY = Object.freeze({ maxSteps: 20, maxBytes: 16 * 1024 ** 2, maxNodes: 100000 })
const button = 'rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-xs text-gray-100 hover:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50'

/** Shared one-level detail authoring host. Existing schema controls, bounded
 * editor history, media leases and native viewport are reused. The viewport
 * pans/inspects; outer 2D manipulation is deliberately unavailable here.
 * Model camera controls edit the draft's saved output camera, not the main
 * source. No inner Timeline/rig/video editor is advertised by this first slice.
 * The mounted main dock remains untouched underneath this temporary surface.
 */
export function ItemDetailWorkspace({ session, editor: main, timeMs, onClose }: {
  session: ItemDetailSession; editor: EditorStateReturn; timeMs: number; onClose(): void
}) {
  const draft = useEditorState(session.source, undefined, DRAFT_HISTORY)
  const assets = useAssetCache(draft.scene.assets, { managed: true }), snap = useSnapSettings()
  const [error, setError] = useState<string | null>(null), [confirmExit, setConfirmExit] = useState(false), [focus, setFocus] = useState(false)
  const backRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { backRef.current?.focus({ preventScroll: true }) }, [])
  const layer = draft.scene.layers.find(item => item.id === session.layer.id)!
  const dirty = session.adapter.fields.some(key => layer[key] !== session.layer[key] && JSON.stringify(layer[key]) !== JSON.stringify(session.layer[key]))
  const stale = main.getRevision() !== session.revision || main.getDocumentSignal() !== session.document || session.document.aborted
  const display = useMemo(() => {
    const view = projectIsolationView(draft.scene, [session.layer.id])
    return { ...view.scene, layers: view.scene.layers.map(item => view.scope?.has(item.id) ? { ...item, hidden: false } : item) }
  }, [draft.scene, session])
  const groups = session.adapter.groups(layer)
  const readOnlyReason = (path: string) => detailDrivenReason(session.source, session.layer, path.split('.')[0])
  /** Validate before publishing even a local draft. Main source remains untouched. */
  const update = (next: Layer) => {
    try {
      session.validate(next)
      draft.dispatchCommand(makeUpdateLayerCmd(layer.id, next, layer)); setError(null)
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  /** Atomic source commit with synchronous revision/document/gesture checks. */
  const apply = () => {
    try {
      if (draft.isTransactionActive()) throw new Error('Finish the current detail pointer gesture first.')
      session.assertCurrent(main.getRevision(), main.getDocumentSignal(), main.isTransactionActive())
      const command = session.prepareApply(draft.getCommittedScene(), main.getCommittedScene(), main.getRevision(), main.getDocumentSignal())
      if (command) main.dispatchCommand(command)
      onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  const requestExit = () => { if (draft.isTransactionActive()) { setError('Finish or cancel the current gesture first.'); return }; dirty ? setConfirmExit(true) : onClose() }
  return <section aria-label="Item detail editor" data-panel="itemDetail" className={`${styles.workspace} ${focus ? styles.focus : ''}`}
    onKeyDown={event => {
      // Detail owns source shortcuts while main dispatch is suspended. Native
      // text inputs retain their browser Undo. Escape never discards a draft.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault(); event.stopPropagation()
        if (!draft.isTransactionActive()) event.shiftKey ? draft.redo() : draft.undo()
      }
      if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('[role="menu"], [role="dialog"]')) {
        if (draft.isTransactionActive()) return
        event.preventDefault(); confirmExit ? setConfirmExit(false) : requestExit()
      }
      if (!draft.isTransactionActive()) event.stopPropagation()
    }}>
    <header className={styles.header}>
      <button ref={backRef} type="button" className={button} onClick={requestExit}>← Back</button>
      <nav className={styles.crumbs} aria-label="Detail breadcrumb">
        <button type="button" className={button} onClick={requestExit}>Scene</button><span aria-hidden="true">›</span>
        <span aria-current="page" className={styles.name}>{session.layer.name}</span>
      </nav>
      <div className={styles.actions}>
        <span className="text-xs text-gray-300" role="status">{dirty ? 'Unsaved detail' : session.adapter.label}</span>
        <button type="button" className={button} disabled={!draft.canUndo || draft.isTransactionActive()} onClick={draft.undo}>Undo</button>
        <button type="button" className={button} disabled={!draft.canRedo || draft.isTransactionActive()} onClick={draft.redo}>Redo</button>
        <button type="button" className={button} aria-pressed={focus} onClick={() => setFocus(!focus)}>Focus view</button>
        <button type="button" className={button} onClick={requestExit}>Cancel</button>
        <button type="button" className={`${button} !bg-sky-700`} disabled={stale || draft.isTransactionActive()} onClick={apply}>Apply &amp; return</button>
      </div>
    </header>
    {confirmExit && <div role="group" aria-label="Unsaved detail changes" className={styles.decision}>
      <span className="text-sm">Keep your detail changes?</span>
      <button type="button" className={button} disabled={stale} onClick={apply}>Apply &amp; return</button>
      <button type="button" className={button} onClick={onClose}>Discard &amp; return</button>
      <button type="button" className={button} onClick={() => { setConfirmExit(false); backRef.current?.focus() }}>Stay</button>
    </div>}
    {stale && <div role="alert" className={styles.notice}>The scene changed while this detail was open. Cancel and reopen it before applying; newer edits are preserved.</div>}
    {error && <div role="alert" className={styles.notice}>{error}</div>}
    <div className={styles.body}>
      <aside className={styles.tree} aria-label="Detail content"><p className="text-xs text-gray-400 mb-3">CONTENT</p>
        <p className="text-sm break-words">{layer.name}</p><p className="text-xs text-gray-400 mt-2">{session.adapter.label}</p>
        <p className="text-xs text-gray-400 mt-4">Outer position, hierarchy and existing animations remain in the main scene.</p>
      </aside>
      <div className={styles.preview}><div className={styles.canvas}>
        <SceneCanvas scene={draft.scene} displayScene={display} editor={draft} timeMs={timeMs} selectedLayerId={layer.id}
          selectedLayerIds={new Set([layer.id])} onSelectLayer={() => {}} assets={assets} snap={snap} panMode toolMode="pan" contentInspection />
      </div></div>
      <aside className={styles.inspector} aria-label="Detail properties">
        <h2 className="text-sm">{session.adapter.label}</h2>
        <fieldset disabled={stale} className="flex flex-col gap-3 min-w-0">
          <SchemaPanel layer={layer} groups={groups} onLayerChange={update} disabledReason={schema => readOnlyReason(schema.path)} />
          {layer.type === 'path' && <DetailPathPoints layer={layer} reason={readOnlyReason('path')} onChange={update} />}
        </fieldset>
      </aside>
    </div>
    <footer className={styles.footer}><span>Draft only · Apply creates one main Undo step</span><span>Static content controls · existing keys are preserved</span>
      <span>History: up to 20 steps / 16 MiB policy · {draft.historyBudget.retainedSteps} retained</span></footer>
  </section>
}
