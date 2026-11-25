'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { modelWorkspaces, type ModelWorkspace } from './modelWorkspaces'
import styles from '../ItemDetailWorkspace.module.css'

/** Put the scoped workspace controls in the 3D header when one exists.
 * Standalone detail fixtures keep the same controls inline. No DOM ownership
 * or model state moves to the outer 2D editor. */
export function ModelWorkspaceNavigation({ workspace, onWorkspace }: { workspace: ModelWorkspace; onWorkspace(next: ModelWorkspace): void }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setHost(document.getElementById('model-detail-toolbar')) }, [])
  const navigation = <nav className={host ? styles.modelHeaderNavigation : styles.modelInlineNavigation} aria-label="3D workspace · Beta">
    <span className={styles.modelBetaLabel}>3D <span>Beta</span></span>
    {modelWorkspaces.map(item => <button key={item.id} type="button" className={`${styles.workspaceTab} ${workspace === item.id ? styles.activeWorkspaceTab : ''}`}
      aria-current={workspace === item.id ? 'page' : undefined} onClick={() => onWorkspace(item.id)}>{item.label}</button>)}
  </nav>
  return host ? createPortal(navigation, host) : navigation
}
