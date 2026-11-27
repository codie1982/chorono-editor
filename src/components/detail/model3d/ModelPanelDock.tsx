'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import DockLayout from '@/components/dock/DockLayout'
import DockOuterEdges from '@/components/dock/DockOuterEdges'
import { DockDragProvider } from '@/components/dock/dragContext'
import { findLeafOfPanel } from '@/components/dock/layoutOps'
import type { PanelRegistry } from '@/components/dock/registry'
import { useDockLayout } from '@/components/dock/useDockLayout'
import { createModelPanelLayout, MODEL_PANEL_IDS, MODEL_PANEL_STORAGE_KEY, REQUIRED_MODEL_PANELS } from './modelPanelLayout'
import type { ModelWorkspace } from './modelWorkspaces'
import styles from '../ItemDetailWorkspace.module.css'

/** Owns only the 3D editor's local arrangement. Source edits and selections
 * live in the model detail workspace; layout changes never enter scene Undo. */
export function ModelPanelDock({ registry, focused, workspace }: { registry: PanelRegistry; focused: boolean; workspace: ModelWorkspace }) {
  const ids = workspace === 'animation' ? [...MODEL_PANEL_IDS] : MODEL_PANEL_IDS.filter(id => id !== 'timeline')
  const createDefault = useCallback(() => createModelPanelLayout(workspace), [workspace])
  const dock = useDockLayout(ids, {
    storageKey: `${MODEL_PANEL_STORAGE_KEY}.${workspace}`, createDefault,
    requiredPanelIds: REQUIRED_MODEL_PANELS,
  })
  const ref = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const [compactPanel, setCompactPanel] = useState<string>('viewport')
  useEffect(() => {
    const host = ref.current
    if (!host) return
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 900))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])
  const visiblePanels = ids.filter(id => !!findLeafOfPanel(dock.layout, id))
  const activeCompactPanel = visiblePanels.includes(compactPanel as typeof MODEL_PANEL_IDS[number]) ? compactPanel : 'viewport'
  return <section className={styles.modelDock} aria-label="3D panel workspace" ref={ref}>
    {!focused && <div className={styles.modelPanelToolbar}>
      <span className="text-[11px] uppercase tracking-wide text-slate-400">3D panels</span>
      <div className="flex-1" />
      <details className={styles.modelPanelMenu}>
        <summary aria-label="Manage 3D panels">Panels ▾</summary>
        <div className={styles.modelPanelMenuBody}>
          {ids.map(id => {
            const present = visiblePanels.includes(id)
            return <button type="button" key={id} aria-label={`${present ? 'Hide' : 'Show'} ${registry.get(id)?.title ?? id}`} aria-pressed={present} disabled={id === 'viewport' || id === 'explorer'}
              onClick={() => present ? dock.dispatchClosePanel(id) : dock.dispatchRestorePanel(id, id === 'properties' || id === 'timeline' ? 'viewport' : 'explorer')}>
              <span aria-hidden="true">{present ? '☑' : '☐'}</span> {registry.get(id)?.title ?? id}
            </button>
          })}
          <button type="button" onClick={dock.resetLayout}>Reset panel layout</button>
        </div>
      </details>
    </div>}
    {focused ? <div className="min-h-0 flex-1">{registry.get('viewport')?.render()}</div>
      : compact ? <>
        <div className={styles.modelCompactTabs} role="tablist" aria-label="3D panels">
          {visiblePanels.map(id => <button key={id} type="button" role="tab" aria-selected={id === activeCompactPanel}
            className={id === activeCompactPanel ? styles.modelCompactTabActive : ''} onClick={() => setCompactPanel(id)}>{registry.get(id)?.title ?? id}</button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel" aria-label={registry.get(activeCompactPanel)?.title}>
          {registry.get(activeCompactPanel)?.render()}
        </div>
      </> : <DockDragProvider onDrop={dock.dispatchDrop} theme="model3d">
        <div className="relative min-h-0 flex-1 h-full">
          <ModelDockTree registry={registry} dock={dock} />
        </div>
      </DockDragProvider>}
  </section>
}

/** Gives the outer edge detector a ref to the actual split canvas. */
function ModelDockTree({ registry, dock }: { registry: PanelRegistry; dock: ReturnType<typeof useDockLayout> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  return <div ref={containerRef} className="relative h-full min-h-0">
    <DockOuterEdges containerRef={containerRef} theme="model3d" />
    <DockLayout node={dock.layout} registry={registry} onTabSelect={dock.dispatchTab}
      onClosePanel={dock.dispatchClosePanel} onResize={dock.dispatchResize}
      onCollapse={dock.dispatchCollapse} theme="model3d" />
  </div>
}
