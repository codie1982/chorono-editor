'use client'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
// ── WiringListPanel (BL-05) ───────────────────────────────────────────────────
// All-wires-at-a-glance view. Lives as a dock panel ("Wires") alongside
// Bindings / Properties / etc. Each wire is a card with toggle / edit /
// delete plus a broken-wire warning when source or target no longer exists.

import type { ChronoScene, ParameterWire } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  makeUpdateParameterWireCmd, makeDeleteParameterWireCmd,
} from '@/lib/editor/commands-interactive'
import { formatParameterRef, isWireBroken } from '@/lib/wiring/helpers'

interface Props {
  scene: ChronoScene
  wireErrors?: ReadonlyMap<string, string>
  editor: EditorStateReturn
  /** Open a wire in the editor modal. */
  onEditWire:   (wire: ParameterWire) => void
  /** Open a blank wire-editor modal (no prefilled target). */
  onCreateWire: () => void
}

export default function WiringListPanel({
  scene, editor, onEditWire, onCreateWire, wireErrors,
}: Props) {
  const wires = scene.parameterWires ?? []

  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Wires
          {wires.length > 0 && (
            <span className="ml-1.5 px-1 rounded text-[9px] bg-gray-800 text-gray-500">{wires.length}</span>
          )}
        </span>
        <DocumentationHelp topic="editor/state-machines/wires" className="ml-auto mr-1" />
        <button
          className="text-[11px] px-2 py-0.5 rounded bg-sky-800 hover:bg-sky-700 text-white"
          onClick={onCreateWire}
        >
          + New Wire
        </button>
      </div>

      {wires.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
          <div>
            <p>No wires yet.</p>
            <p className="mt-2 text-gray-600">
              Click 🔗 on any property in the Properties panel, or use{' '}
              <b>+ New Wire</b> above.
            </p>
            <p className="mt-2 text-gray-600 italic">
              Wires drive a property via formula:{' '}
              <code className="text-amber-400">map(source, 0, 1, 0, 360)</code>,{' '}
              <code className="text-amber-400">sin(source * 6.28) * 0.5 + 0.5</code>
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {wires.map((wire) => (
            <WireCard
              key={wire.id}
              wire={wire}
              scene={scene} error={wireErrors?.get(wire.id)}
              editor={editor}
              onEdit={() => onEditWire(wire)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire card
// ─────────────────────────────────────────────────────────────────────────────

function WireCard({
  wire, scene, editor, onEdit, error,
}: {
  wire: ParameterWire
  scene: ChronoScene
  editor: EditorStateReturn
  onEdit: () => void
  error?: string
}) {
  const broken = isWireBroken(wire, scene)
  const sourceLabel = formatParameterRef(wire.source, scene)
  const targetLabel = formatParameterRef(wire.target, scene)

  function toggle() {
    editor.dispatchCommand(makeUpdateParameterWireCmd(
      wire.id, wire,
      { ...wire, enabled: !wire.enabled, updatedAt: Date.now() },
    ))
  }
  function del() {
    if (!window.confirm('Delete this wire? Can be undone with ⌘Z.')) return
    editor.dispatchCommand(makeDeleteParameterWireCmd(wire))
  }

  return (
    <div className={`px-3 py-2 border-b border-gray-800 ${
      !wire.enabled ? 'opacity-50' : ''
    } ${broken ? 'border-l-2 border-l-red-500/60 pl-[10px] bg-red-950/10' : ''}`}>
      {/* Enable + warn + actions row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-gray-400">
            <input
              type="checkbox"
              checked={wire.enabled}
              onChange={toggle}
            />
            {wire.enabled ? 'Enabled' : 'Disabled'}
          </label>
          {broken && (
            <span className="text-[10px] text-red-400 bg-red-950/40 border border-red-800/40 px-1 rounded"
                  title="Source or target no longer exists">
              ⚠ broken
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onEdit}
            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
            title="Edit this wire"
          >✏ Edit</button>
          <button
            onClick={del}
            className="text-[10px] text-red-400 hover:text-red-300"
            title="Delete this wire"
          >🗑</button>
        </div>
      </div>

      {error && <p role="status" className="text-[10px] text-red-300 my-1">{error}</p>}
      {/* Source → Target labels */}
      <div className="space-y-0.5 text-[11px] font-mono">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] uppercase text-amber-400 w-12 shrink-0">source</span>
          <span className="text-amber-200 truncate">{sourceLabel}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] uppercase text-emerald-400 w-12 shrink-0">target</span>
          <span className="text-emerald-200 truncate">{targetLabel}</span>
        </div>
      </div>

      {/* Expression */}
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[9px] uppercase text-sky-400 w-12 shrink-0">expr</span>
        <code className="text-[10px] text-sky-200 truncate">{wire.expression}</code>
      </div>

      {/* Clamp indicator (compact) */}
      {wire.clamp?.enabled && (
        <div className="mt-1 text-[9px] text-gray-500 font-mono">
          clamp [{wire.clamp.min ?? '−∞'} … {wire.clamp.max ?? '+∞'}]
        </div>
      )}
    </div>
  )
}
