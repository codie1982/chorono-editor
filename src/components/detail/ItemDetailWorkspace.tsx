'use client'
import { useMemo, useState } from 'react'
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

import { DRAFT_HISTORY, DetailWorkspaceShell } from './DetailWorkspaceShell'
import { ModelDetailWorkspace } from './ModelDetailWorkspace'

/** Shared one-level detail authoring host. Existing schema controls, bounded
 * editor history, media leases and native viewport are reused. The viewport
 * pans/inspects; outer 2D manipulation is deliberately unavailable here.
 * Model camera controls edit the draft's saved output camera, not the main
 * source. Shape and path content remain static in this adapter.
 * The mounted main dock remains untouched underneath this temporary surface.
 */
function StaticDetailWorkspace({ session, editor: main, timeMs, onClose }: {
  session: ItemDetailSession; editor: EditorStateReturn; timeMs: number; onClose(): void
}) {
  const draft = useEditorState(session.source, undefined, DRAFT_HISTORY)
  const assets = useAssetCache(draft.scene.assets, { managed: true }), snap = useSnapSettings()
  const [error, setError] = useState<string | null>(null)
  const layer = draft.scene.layers.find(item => item.id === session.layer.id)!
  const dirty = session.adapter.fields.some(key => layer[key] !== session.layer[key] && JSON.stringify(layer[key]) !== JSON.stringify(session.layer[key]))
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
  return <DetailWorkspaceShell session={session} main={main} draft={draft} dirty={dirty} draftError={error} onClose={onClose}>
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
        <fieldset disabled={session.document.aborted || main.getRevision() !== session.revision} className="flex flex-col gap-3 min-w-0">
          <SchemaPanel layer={layer} groups={groups} onLayerChange={update} disabledReason={schema => readOnlyReason(schema.path)} />
          {layer.type === 'path' && <DetailPathPoints layer={layer} reason={readOnlyReason('path')} onChange={update} />}
        </fieldset>
      </aside>
    </div>
  </DetailWorkspaceShell>
}

/** Route by actual detail capability; each context owns a separate hook lifetime. */
export function ItemDetailWorkspace(props: Parameters<typeof StaticDetailWorkspace>[0]) {
  return props.session.animation ? <ModelDetailWorkspace {...props} /> : <StaticDetailWorkspace {...props} />
}
