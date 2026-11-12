'use client'
import { useEffect, useRef, useState } from 'react'
import type { PanelRegistry } from '@/components/dock/registry'
import type { DockNode } from '@/components/dock/types'
import { exportMenuItems } from './exportMenuItems'

interface FileMenuProps {
  /** Current scene filename (composition.id by default). */
  filename: string
  onRename:        (next: string) => void
  onNewScene:      () => void
  /** Open a file picker for the universal import pipeline (images, SVG, media, fonts, Lottie). */
  onImportFile?:   () => void
  /** Open the remote-URL import flow. */
  onImportUrl?:    () => void
  /** Import an image from the clipboard. */
  onImportClipboard?: () => void
  /** Open the sprite-sheet grid import flow. */
  onImportSpriteSheet?: () => void
  onOpenSceneJson: () => void
  onSaveSceneJson: () => void
  onExportRuntime: () => void
  /** BL-80 — open the raster image export dialog (PNG / WEBP / JPEG). */
  onExportImage?:  () => void
  /** BL-84 — open the SVG (vector) export dialog. */
  onExportSvg?:    () => void
  /** BL-83 — open the image sequence (PNG/JPEG/WEBP → ZIP) export dialog. */
  onExportSequence?: () => void
  /** Standalone self-playing HTML (CDN runtime + embedded scene). */
  onExportHtml?:   () => void
  onCopySceneJson: () => void
  onShowShortcuts: () => void
  /** Reopens the welcome screen while preserving the current scene. */
  onShowWelcome?: () => void
  /** Focuses or restores the existing resource monitor dock panel. */
  onShowResources?: () => void
  onResetLayout:   () => void
  panelRegistry?:  PanelRegistry
  dockLayout?:     DockNode
  onRestorePanel?: (panelId: string) => void
}

/**
 * Hamburger dropdown (Rive-style File menu). Stays mounted; visibility
 * controlled by local state. Closes on outside click + Esc.
 */
export default function FileMenu(props: FileMenuProps) {
  const { filename, panelRegistry, dockLayout, onRestorePanel } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Helper: get set of panel ids currently visible in the layout
  function getVisiblePanelIds(): Set<string> {
    const visible = new Set<string>()
    if (!dockLayout) return visible

    function walk(node: any) {
      if (node.kind === 'leaf' && Array.isArray(node.panels)) {
        node.panels.forEach((p: string) => visible.add(p))
      } else if (node.kind === 'split' && Array.isArray(node.children)) {
        node.children.forEach((child: any) => walk(child))
      }
    }
    walk(dockLayout)
    return visible
  }

  // ── Close on outside click / Esc ────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown',   esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown',   esc)
    }
  }, [open])

  const item =
    "w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-blue-600 hover:text-white rounded transition-colors"
  const itemDanger =
    "w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-600 hover:text-white rounded transition-colors"
  const sectionLabel =
    "px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-gray-500"
  const divider = "h-px bg-gray-700 my-1 mx-2"

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-9 h-9 flex flex-col justify-center items-center gap-[3px] rounded
          ${open ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'} transition-colors`}
      >
        <span className="w-4 h-[2px] bg-gray-300" />
        <span className="w-4 h-[2px] bg-gray-300" />
        <span className="w-4 h-[2px] bg-gray-300" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 w-64 bg-gray-900 border border-gray-700 rounded-lg
                     shadow-2xl z-50 py-1.5 animate-[dock-leaf-in_180ms_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Filename ── */}
          <div className="px-3 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Filename</div>
            <input
              type="text"
              value={filename}
              onChange={(e) => props.onRename(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200
                         focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className={divider} />

          {/* ── Import (universal pipeline) ── */}
          {(props.onImportFile || props.onImportUrl || props.onImportClipboard) && (
            <>
              <div className={sectionLabel}>Import</div>
              {props.onImportFile && (
                <button className={item} onClick={() => { setOpen(false); props.onImportFile!() }}>
                  ⤓ From File…
                </button>
              )}
              {props.onImportUrl && (
                <button className={item} onClick={() => { setOpen(false); props.onImportUrl!() }}>
                  🔗 From URL…
                </button>
              )}
              {props.onImportClipboard && (
                <button className={item} onClick={() => { setOpen(false); props.onImportClipboard!() }}>
                  📋 Paste from Clipboard
                </button>
              )}
              {props.onImportSpriteSheet && (
                <button className={item} onClick={() => { setOpen(false); props.onImportSpriteSheet!() }}>
                  ⊞ Sprite Sheet…
                </button>
              )}
              <div className={divider} />
            </>
          )}

          {/* ── File ops ── */}
          <button className={item} onClick={() => { setOpen(false); props.onNewScene() }}>
            ＋ New Scene
          </button>
          <button className={item} onClick={() => { setOpen(false); props.onOpenSceneJson() }}>
            ⇪ Open Scene JSON…
          </button>
          <button className={item} onClick={() => { setOpen(false); props.onSaveSceneJson() }}>
            ⤓ Save Scene JSON
          </button>

          <div className={divider} />

          {/* ── Export ── */}
          <div className={sectionLabel}>Export</div>
          {exportMenuItems(props).map(action => <button key={action.label} className={item}
            onClick={() => { setOpen(false); action.onSelect() }}>{action.label}</button>)}
          <button className={item} onClick={() => { setOpen(false); props.onCopySceneJson() }}>
            ⧉ Copy Scene JSON to clipboard
          </button>

          <div className={divider} />

          {/* ── View / Panels ── */}
          {panelRegistry && dockLayout && (
            <>
              <div className={sectionLabel}>View</div>
              {props.onShowResources && (
                <button className={item} onClick={() => { setOpen(false); props.onShowResources!() }}>
                  Resources & Performance
                </button>
              )}
              {(() => {
                const visible = getVisiblePanelIds()
                const hiddenPanels: Array<{ id: string; title: string }> = []
                panelRegistry.forEach((def) => {
                  if (!visible.has(def.id) && !(def.id === 'resourceMonitor' && props.onShowResources)) {
                    hiddenPanels.push({ id: def.id, title: def.title })
                  }
                })

                if (hiddenPanels.length === 0) {
                  return (
                    <div className="px-3 py-1.5 text-xs text-gray-500">
                      All panels visible
                    </div>
                  )
                }

                return hiddenPanels.map((panel) => (
                  <button
                    key={panel.id}
                    className={item}
                    onClick={() => {
                      setOpen(false)
                      onRestorePanel?.(panel.id)
                    }}
                  >
                    + {panel.title}
                  </button>
                ))
              })()}

              <div className={divider} />

              {/* ── Layout ── */}
              <div className={sectionLabel}>Layout</div>
              <button className={item} onClick={() => { setOpen(false); props.onResetLayout() }}>
                ⊞ Reset Panel Layout
              </button>

              <div className={divider} />
            </>
          )}
          {(!panelRegistry || !dockLayout) && (
            <>
              {/* ── Layout ── */}
              <div className={sectionLabel}>Layout</div>
              <button className={item} onClick={() => { setOpen(false); props.onResetLayout() }}>
                ⊞ Reset Panel Layout
              </button>

              <div className={divider} />
            </>
          )}

          {/* ── Help ── */}
          <div className={sectionLabel}>Help</div>
          {props.onShowWelcome && <button className={item + ' min-h-[44px]'} onClick={() => { setOpen(false); props.onShowWelcome!() }}>
            Welcome screen
          </button>}
          <button className={item} onClick={() => { setOpen(false); props.onShowShortcuts() }}>
            ⌨ Show Shortcuts (Cmd+/)
          </button>
          <a
            href="https://github.com/anthropics/claude-code"
            target="_blank" rel="noopener noreferrer"
            className={item + ' block'}
            onClick={() => setOpen(false)}
          >
            📖 Documentation
          </a>
        </div>
      )}
    </div>
  )
}
