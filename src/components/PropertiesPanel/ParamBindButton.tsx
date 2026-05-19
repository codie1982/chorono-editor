'use client'
import { useEffect, useRef, useState } from 'react'
import type { Layer, SceneParameter, SceneParameterType } from '@/lib/types'

// BL-69 — Direct parameter binding UI.
//
// Wraps a property's input. When `layer.paramBindings[propertyPath]` resolves
// to a parameter, hides the children and shows a pill button that opens a
// popover for switching/removing the binding. Otherwise renders children
// untouched plus a 📎 icon next to the label.
//
// Distinct from BL-05 WireableField (🔗): that one creates a ParameterWire
// with an expression. This one is the simple direct binding pathway and is
// the only mechanism that supports string/color parameters end-to-end.

const TYPE_BADGE: Record<SceneParameterType, { bg: string; fg: string }> = {
  string:  { bg: 'bg-sky-900',     fg: 'text-sky-300'     },
  number:  { bg: 'bg-emerald-900', fg: 'text-emerald-300' },
  boolean: { bg: 'bg-amber-900',   fg: 'text-amber-300'   },
  color:   { bg: 'bg-pink-900',    fg: 'text-pink-300'    },
  image:   { bg: 'bg-violet-900',  fg: 'text-violet-300'  },
}

interface Props {
  label: string
  layer: Layer
  propertyPath: string
  acceptedTypes: SceneParameterType[]
  parameters: SceneParameter[]
  onBind: (paramId: string | null) => void
  children: React.ReactNode
}

export default function ParamBindButton({
  label, layer, propertyPath, acceptedTypes, parameters, onBind, children,
}: Props) {
  const boundParamId = layer.paramBindings?.[propertyPath]
  const boundParam   = boundParamId ? parameters.find((p) => p.id === boundParamId) : undefined

  const [open, setOpen] = useState(false)
  const popRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const compatible = parameters.filter((p) => acceptedTypes.includes(p.type))

  function pick(paramId: string) {
    onBind(paramId)
    setOpen(false)
  }
  function unbind() {
    onBind(null)
    setOpen(false)
  }

  // Intentionally NOT a <label>: when the wrapped child is an
  // <input type="color">, label semantics would activate the native
  // color picker whenever the user clicks anywhere inside the wrapper
  // (including parameter items inside the popover).
  return (
    <div className="flex flex-col gap-0.5 relative">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
        <span className="flex-1">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={boundParam
            ? `Bound to ${boundParam.name} — click to change or unbind`
            : 'Bind this property to a parameter'}
          className={`text-[10px] leading-none w-4 h-4 flex items-center justify-center rounded transition-colors ${
            boundParam
              ? 'text-amber-300 bg-amber-900/50 hover:bg-amber-800/70'
              : 'text-gray-600 hover:text-amber-300 hover:bg-gray-800'
          }`}
        >
          📎
        </button>
      </span>

      {boundParam ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left bg-amber-900/20 border border-amber-800/40 rounded px-2 py-1 text-[11px] text-amber-200 font-mono truncate hover:bg-amber-900/40 flex items-center gap-1.5"
          title="Bound parameter — click to change or unbind"
        >
          <span aria-hidden>📎</span>
          <span className="truncate">{boundParam.name}</span>
          <span className={`ml-auto shrink-0 text-[9px] px-1 rounded ${TYPE_BADGE[boundParam.type].bg} ${TYPE_BADGE[boundParam.type].fg}`}>
            {boundParam.type}
          </span>
        </button>
      ) : children}

      {open && (
        <div
          ref={popRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded shadow-xl py-1 max-h-64 overflow-y-auto"
        >
          {boundParam && (
            <>
              <button
                type="button"
                onClick={unbind}
                className="w-full text-left px-2 py-1.5 text-[11px] text-red-300 hover:bg-red-900/30 flex items-center gap-1.5"
              >
                <span aria-hidden>✕</span> Unbind parameter
              </button>
              <div className="border-t border-gray-700 my-1" />
            </>
          )}
          {compatible.length === 0 ? (
            <div className="px-2 py-2 text-[10px] text-gray-500 leading-snug">
              No compatible parameters.
              <br />
              Add a{' '}
              <span className="text-gray-300 font-mono">
                {acceptedTypes.join(' / ')}
              </span>{' '}
              parameter from the Parameters panel.
            </div>
          ) : (
            compatible.map((p) => {
              const isBound = p.id === boundParamId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p.id)}
                  className={`w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-1.5 transition-colors ${
                    isBound
                      ? 'bg-amber-900/30 text-amber-200'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="truncate flex-1 font-mono">{p.name}</span>
                  <span className={`shrink-0 text-[9px] px-1 rounded ${TYPE_BADGE[p.type].bg} ${TYPE_BADGE[p.type].fg}`}>
                    {p.type}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
