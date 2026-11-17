'use client'
import { useEffect, type RefObject } from 'react'

/** Borrow one mounted native dialog and its invoking focus target. Show it on
 * mount, optionally focus an inner control, close on unmount, and explicitly
 * restore a still-connected invoker. Restoration also works when React removes
 * the dialog before passive cleanup, where native close alone loses focus.
 * Owns no source/history state. The caller owns cancel/dismiss behavior. */
export function useNativeModal(dialog: RefObject<HTMLDialogElement>, autofocus?: string): void {
  useEffect(() => {
    const previous = document.activeElement, element = dialog.current
    if (!element) return
    element.showModal()
    if (autofocus) element.querySelector<HTMLElement>(autofocus)?.focus()
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [dialog, autofocus])
}
