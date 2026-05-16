'use client'
import { useRef, useState } from 'react'
import type { Layer } from '@/lib/types'
import { ANIMATION_PRESETS } from '@/lib/timeline/presets'

interface Props {
  layers: Layer[]
  selectedId: string | null
  selectedIds: Set<string>
  onSelect: (id: string, shiftHeld: boolean) => void
  onAdd: (kind: 'rect' | 'circle' | 'text') => void
  onAddImage: (file: File) => void
  onAddVideo: (file: File) => void
  onAddAudio: (file: File) => void
  onDelete: (id: string) => void
  onReorder: (from: number, to: number) => void
  onToggleFlag: (id: string, field: 'locked' | 'hidden' | 'solo') => void
  onApplyStagger?: (presetId: string, stepMs: number) => void
}

const LAYER_ICON: Record<string, string> = {
  rect:   '⬛',
  circle: '⭕',
  text:   '𝙏',
  image:  '🖼',
  video:  '▶',
  audio:  '♪',
}

export default function LayerPanel({
  layers, selectedId, selectedIds, onSelect, onAdd,
  onAddImage, onAddVideo, onAddAudio,
  onDelete, onReorder, onToggleFlag, onApplyStagger,
}: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const handleFilePicked = (handler: (file: File) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handler(file)
      e.target.value = ''  // allow re-uploading the same file
    }

  return (
    <aside className="flex flex-col h-full w-full bg-gray-900 border-r border-gray-700">
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Layers</span>
      </div>

      {/* Add buttons */}
      <div className="flex flex-col gap-1 p-2 border-b border-gray-700">
        <div className="flex gap-1">
          {(['rect', 'circle', 'text'] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => onAdd(kind)}
              className="flex-1 py-1 text-xs rounded bg-gray-700 hover:bg-blue-600 text-gray-200 transition-colors capitalize"
            >
              + {kind === 'rect' ? 'Rect' : kind === 'circle' ? 'Circle' : 'Text'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="py-1 text-xs rounded bg-gray-700 hover:bg-blue-600 text-gray-200 transition-colors"
          >+ Image</button>
          <button
            onClick={() => videoInputRef.current?.click()}
            className="py-1 text-xs rounded bg-gray-700 hover:bg-blue-600 text-gray-200 transition-colors"
          >+ Video</button>
          <button
            onClick={() => audioInputRef.current?.click()}
            className="py-1 text-xs rounded bg-gray-700 hover:bg-blue-600 text-gray-200 transition-colors"
          >+ Audio</button>
        </div>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePicked(onAddImage)} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleFilePicked(onAddVideo)} />
        <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFilePicked(onAddAudio)} />
      </div>

      {/* Layer list */}
      <ul className="flex-1 overflow-y-auto py-1">
        {layers.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-gray-600">
            No layers yet.<br />Add one above.
          </li>
        )}
        {[...layers].reverse().map((layer, displayIdx) => {
          const realIdx   = layers.length - 1 - displayIdx
          const isPrimary = layer.id === selectedId
          const isInSet   = selectedIds.has(layer.id)
          const canMoveUp   = realIdx < layers.length - 1   // not at the top of the stack
          const canMoveDown = realIdx > 0                    // not at the bottom of the stack
          return (
            <li
              key={layer.id}
              onClick={(e) => onSelect(layer.id, e.shiftKey)}
              className={`flex items-center gap-1 px-2 py-1.5 mx-1 my-0.5 rounded cursor-pointer group
                ${isPrimary ? 'bg-blue-600 text-white'
                  : isInSet  ? 'bg-blue-900/60 text-blue-100'
                  : 'text-gray-300 hover:bg-gray-700'}
                ${layer.hidden ? 'opacity-50' : ''}`}
            >
              {/* Lock / Hide / Solo flags */}
              <LayerFlag
                active={!!layer.locked}
                onChars="🔒" offChars="🔓"
                title="Lock"
                onClick={(e) => { e.stopPropagation(); onToggleFlag(layer.id, 'locked') }}
              />
              <LayerFlag
                active={!layer.hidden}
                onChars="👁" offChars="⊘"
                title="Visibility"
                onClick={(e) => { e.stopPropagation(); onToggleFlag(layer.id, 'hidden') }}
              />
              <LayerFlag
                active={!!layer.solo}
                onChars="S" offChars="s"
                title="Solo"
                onClick={(e) => { e.stopPropagation(); onToggleFlag(layer.id, 'solo') }}
                highlightClass={layer.solo ? 'text-amber-400 font-bold' : ''}
              />

              <span className="text-sm w-5 text-center shrink-0">
                {LAYER_ICON[layer.shape ?? layer.type] ?? '□'}
              </span>
              <span className="flex-1 truncate text-xs">{layer.name || layer.id}</span>
              {/* Reorder: ↑ brings layer toward top of stack (later in array) */}
              <button
                onClick={(e) => { e.stopPropagation(); if (canMoveUp) onReorder(realIdx, realIdx + 1) }}
                disabled={!canMoveUp}
                className={`opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded
                  disabled:opacity-20 ${isPrimary ? 'hover:bg-blue-500' : 'hover:bg-gray-600'}`}
                title="Bring forward (render on top)"
              >▲</button>
              <button
                onClick={(e) => { e.stopPropagation(); if (canMoveDown) onReorder(realIdx, realIdx - 1) }}
                disabled={!canMoveDown}
                className={`opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded
                  disabled:opacity-20 ${isPrimary ? 'hover:bg-blue-500' : 'hover:bg-gray-600'}`}
                title="Send backward (render below)"
              >▼</button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(layer.id) }}
                className={`opacity-0 group-hover:opacity-100 text-xs px-1 rounded
                  ${isPrimary ? 'hover:bg-blue-500 text-blue-200' : 'hover:bg-gray-600 text-gray-500'}`}
                title="Delete"
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>

      {/* Stagger picker — only visible with multi-selection */}
      {selectedIds.size > 1 && onApplyStagger && (
        <StaggerPicker
          count={selectedIds.size}
          onApply={onApplyStagger}
        />
      )}

      {layers.length > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-700 text-xs text-gray-500">
          {layers.length} layers{selectedIds.size > 1 ? ` · ${selectedIds.size} selected` : ''}
        </div>
      )}
    </aside>
  )
}

// ── Stagger picker (multi-select only) ───────────────────────────────────────

function StaggerPicker({ count, onApply }: { count: number; onApply: (presetId: string, stepMs: number) => void }) {
  const [stepMs, setStepMs] = useState(80)
  return (
    <div className="border-t border-gray-700 p-2 space-y-1.5 bg-gray-900/70">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
        Stagger ({count} layers)
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number" value={stepMs} min={0} step={10}
          onChange={(e) => setStepMs(Number(e.target.value))}
          className="w-14 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-[11px] text-gray-200
                     [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-gray-500">ms / layer</span>
      </div>
      <select
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onApply(e.target.value, stepMs); e.target.value = '' } }}
        className="w-full text-[11px] bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-purple-300
                   focus:outline-none focus:border-purple-500"
      >
        <option value="" disabled>✨ Apply preset (staggered)…</option>
        {ANIMATION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  )
}

// ── Tiny flag toggle ──────────────────────────────────────────────────────────

function LayerFlag(props: {
  active: boolean
  onChars: string
  offChars: string
  title: string
  highlightClass?: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      className={`text-[10px] w-3.5 h-3.5 leading-none flex items-center justify-center shrink-0
        ${props.active ? 'opacity-90' : 'opacity-40 hover:opacity-70'}
        ${props.highlightClass ?? ''}`}
    >
      {props.active ? props.onChars : props.offChars}
    </button>
  )
}
