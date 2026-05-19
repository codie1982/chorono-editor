'use client'
// ── AssetsPanel ───────────────────────────────────────────────────────────────
// Browse all uploaded image / video / audio assets in the scene. Each row
// shows a thumbnail, name, type badge, and quick actions:
//
//   ➕ Add layer  — creates a new image / video / audio layer referencing
//                    this asset (so the same upload can be reused N times)
//   ✕  Delete    — removes the asset; any layers still referencing it are
//                    also removed (single batched undo step)
//
// The asset registry is `scene.assets`. Each upload via LayerPanel populates
// an Asset entry; this panel surfaces them in one place.

import { useMemo, useRef, useState } from 'react'
import type { ChronoScene, Asset, AssetType } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  newImageLayer, newVideoLayer, newAudioLayer,
} from '@/lib/defaults'
import { makeAddLayerCmd, makeDeleteLayerCmd } from '@/lib/editor/commands-layer'
import { makeBatchCmd } from '@/lib/editor/commands-batch'
import { toast } from '@/lib/toast/toast'
import ContextMenu, { useContextMenu } from '@/components/ui/ContextMenu'

interface Props {
  scene:  ChronoScene
  editor: EditorStateReturn
  /** Called with the new layer's id after "Add layer" so it can be selected. */
  onSelectLayer?: (id: string) => void
}

const TYPE_BADGES: Record<AssetType, { bg: string; fg: string; icon: string }> = {
  image: { bg: 'bg-sky-900/50',     fg: 'text-sky-300',     icon: '🖼' },
  video: { bg: 'bg-purple-900/50',  fg: 'text-purple-300',  icon: '▶' },
  audio: { bg: 'bg-emerald-900/50', fg: 'text-emerald-300', icon: '♪' },
}

export default function AssetsPanel({ scene, editor, onSelectLayer }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const ctxMenu = useContextMenu()
  const [ctxAssetId, setCtxAssetId] = useState<string | null>(null)

  // Track which layers reference each asset (so we know what gets deleted)
  const layersByAsset = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const l of scene.layers) {
      const aid = l.image?.assetId ?? l.video?.assetId ?? l.audio?.assetId
      if (!aid) continue
      const list = map.get(aid) ?? []
      list.push(l.id)
      map.set(aid, list)
    }
    return map
  }, [scene.layers])

  // ── Add layer from an existing asset ────────────────────────────────────
  const addLayerFromAsset = (a: Asset) => {
    let layer
    switch (a.type) {
      case 'image': layer = newImageLayer(a.id, a.width ?? 200, a.height ?? 150); break
      case 'video': layer = newVideoLayer(a.id, a.width ?? 320, a.height ?? 180, a.durationMs); break
      case 'audio': layer = newAudioLayer(a.id, a.durationMs); break
    }
    editor.dispatchCommand(makeAddLayerCmd(layer))
    onSelectLayer?.(layer.id)
    toast.success(`Added ${a.type} layer from ${a.name}`)
  }

  // ── Delete asset + cascade-delete referencing layers ───────────────────
  const deleteAsset = (a: Asset) => {
    const refLayerIds = layersByAsset.get(a.id) ?? []
    const refLayers   = scene.layers.filter(l => refLayerIds.includes(l.id))
    const layerCount  = refLayers.length

    if (layerCount > 0) {
      const ok = confirm(
        `Delete asset "${a.name}"?\n\n` +
        `${layerCount} layer${layerCount === 1 ? '' : 's'} referencing it will also be removed.`,
      )
      if (!ok) return
    }

    const cmds = [
      ...refLayers.map(l => makeDeleteLayerCmd(l)),
      {
        label: `Delete asset ${a.name}`,
        execute: (s: ChronoScene) => ({ ...s, assets: s.assets.filter(x => x.id !== a.id) }),
        undo:    (s: ChronoScene) => ({ ...s, assets: [...s.assets, a] }),
      },
    ]
    editor.dispatchCommand(makeBatchCmd(`Delete asset "${a.name}"`, cmds))
    toast.info(`Deleted asset "${a.name}"`, {
      detail: layerCount > 0 ? `${layerCount} layer(s) also removed` : undefined,
    })
    // Revoke blob URL to free memory (a.url may be a blob: URL from upload)
    try { if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url) } catch { /* no-op */ }
  }

  // ── Upload new asset directly from this panel ─────────────────────────
  // (We delegate to file input elements; actual asset creation flows
  //  through the same probeAndAddMedia in page.tsx which also adds a layer.
  //  For now we expose buttons that just delegate to LayerPanel-style flow
  //  via the parent's onAddImage / onAddVideo / onAddAudio — those are not
  //  wired here, so for V1 the panel is READ-ONLY: upload happens via the
  //  Layer panel's media buttons. A future iteration can lift those handlers
  //  up to the page level so this panel can also trigger uploads.)
  // For now, leave inputs as placeholders for future wiring.
  void imageInputRef; void videoInputRef; void audioInputRef

  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Assets
        </span>
        <span className="text-[10px] text-gray-500">
          {scene.assets.length} item{scene.assets.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* ── Empty state ── */}
      {scene.assets.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500 leading-relaxed">
          No assets yet.<br />
          Upload images, videos or audio via the Layers panel
          (<span className="text-gray-400">+ Add → Media</span>).
        </div>
      )}

      {/* ── Asset grid ── */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
        {scene.assets.map(a => {
          const refCount = layersByAsset.get(a.id)?.length ?? 0
          const badge    = TYPE_BADGES[a.type]
          return (
            <div
              key={a.id}
              className="border border-gray-700 rounded overflow-hidden bg-gray-900/50 group hover:border-blue-500/60 transition-colors"
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxAssetId(a.id)
                ctxMenu.open(e)
              }}
            >
              {/* Thumbnail */}
              <div className="relative aspect-square bg-gray-950 flex items-center justify-center overflow-hidden">
                {a.type === 'image' && (
                  <img
                    src={a.url}
                    alt={a.name}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                {a.type === 'video' && (
                  <video
                    src={a.url}
                    muted
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = 'none' }}
                  />
                )}
                {a.type === 'audio' && (
                  <div className="flex flex-col items-center text-gray-500">
                    <span className="text-3xl">♪</span>
                    <span className="text-[10px] mt-1">audio</span>
                  </div>
                )}
                {/* Type badge */}
                <span className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${badge.bg} ${badge.fg}`}>
                  {badge.icon} {a.type}
                </span>
                {/* Reference count */}
                {refCount > 0 && (
                  <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-blue-600/90 text-white text-[9px] font-bold">
                    {refCount}
                  </span>
                )}
              </div>

              {/* Info + actions */}
              <div className="p-1.5 space-y-1">
                <div className="truncate text-[11px] font-medium text-gray-200" title={a.name}>
                  {a.name}
                </div>
                <div className="text-[9px] text-gray-500 flex items-center gap-1">
                  {a.width && a.height && (
                    <span>{a.width}×{a.height}</span>
                  )}
                  {a.durationMs && (
                    <span>{Math.round(a.durationMs / 100) / 10}s</span>
                  )}
                  {refCount === 0 && (
                    <span className="ml-auto text-amber-500" title="No layer uses this asset">unused</span>
                  )}
                </div>
                <div className="flex gap-1 pt-0.5">
                  <button
                    onClick={() => addLayerFromAsset(a)}
                    className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors"
                    title="Add a new layer that uses this asset"
                  >
                    + Layer
                  </button>
                  <button
                    onClick={() => deleteAsset(a)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-red-700 text-gray-500 hover:text-white transition-colors"
                    title={refCount > 0
                      ? `Delete asset (and ${refCount} layer${refCount === 1 ? '' : 's'} using it)`
                      : 'Delete asset'}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Asset right-click context menu ─────────────────────────────────── */}
      {ctxMenu.isOpen && ctxAssetId && (() => {
        const asset = scene.assets.find(a => a.id === ctxAssetId)
        if (!asset) { ctxMenu.close(); return null }
        return (
          <ContextMenu
            x={ctxMenu.state!.x} y={ctxMenu.state!.y}
            items={[
              {
                kind: 'action', label: '+ Add Layer',
                onSelect: () => { addLayerFromAsset(asset); ctxMenu.close(); setCtxAssetId(null) },
              },
              { kind: 'separator' },
              {
                kind: 'action', label: 'Delete Asset',
                onSelect: () => { deleteAsset(asset); ctxMenu.close(); setCtxAssetId(null) },
              },
            ]}
            onClose={() => { ctxMenu.close(); setCtxAssetId(null) }}
          />
        )
      })()}
    </div>
  )
}
