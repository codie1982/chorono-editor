'use client'
// ── useWireModal (BL-05) ──────────────────────────────────────────────────────
// Single open/close state machine for WireParameterModal. Hosted in page.tsx
// (the editor root), then the returned `open*` callbacks are passed down to
// PropertiesPanel / WiringListPanel / Timeline so they can request the modal
// without their own state.
//
// Three open modes:
//   - openNew()        — empty modal, user picks source + target manually
//   - openForTarget()  — empty modal but target prefilled (inspector 🔗 click)
//   - openForEdit()    — load existing wire for editing

import { useCallback, useState } from 'react'
import type { ParameterRef, ParameterWire } from '@/lib/types'

export interface WireModalState {
  isOpen: boolean
  editWire: ParameterWire | null
  newTarget: ParameterRef | null
}

export interface WireModalReturn extends WireModalState {
  openNew: () => void
  openForTarget: (target: ParameterRef) => void
  openForEdit: (wire: ParameterWire) => void
  close: () => void
}

export function useWireModal(): WireModalReturn {
  const [state, setState] = useState<WireModalState>({
    isOpen: false, editWire: null, newTarget: null,
  })

  const openNew = useCallback(() => {
    setState({ isOpen: true, editWire: null, newTarget: null })
  }, [])

  const openForTarget = useCallback((target: ParameterRef) => {
    setState({ isOpen: true, editWire: null, newTarget: target })
  }, [])

  const openForEdit = useCallback((wire: ParameterWire) => {
    setState({ isOpen: true, editWire: wire, newTarget: null })
  }, [])

  const close = useCallback(() => {
    setState({ isOpen: false, editWire: null, newTarget: null })
  }, [])

  return { ...state, openNew, openForTarget, openForEdit, close }
}
