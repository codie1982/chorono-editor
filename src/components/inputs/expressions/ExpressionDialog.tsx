'use client'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import type { DocumentationTopic } from '@/components/help/documentation'

/** Shared native modal/focus lifecycle for source recipes and explicit one-off
 * calculations. Escape cancels, keyboard events stay out of editor shortcuts,
 * and closing restores a still-connected original control. The caller chooses
 * a typed guide for its formula or calculation workflow. No source commit. */
export function ExpressionDialog({ title, helpTopic, onClose, children }: { title: string; helpTopic: DocumentationTopic; onClose(): void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId()
  useEffect(() => {
    const previous = document.activeElement, element = dialog.current!
    element.showModal(); element.querySelector<HTMLElement>('[data-expression-autofocus]')?.focus()
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return createPortal(<dialog ref={dialog} aria-labelledby={heading} className="max-h-[90vh] w-[min(520px,90vw)] overflow-auto rounded-lg border border-gray-600 bg-gray-900 p-4 text-gray-100 shadow-2xl backdrop:bg-black/50"
    onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => event.stopPropagation()}>
    <div className="flex items-center justify-between gap-2"><h2 id={heading} className="text-sm font-semibold">{title}</h2><DocumentationHelp topic={helpTopic} compact /></div>{children}
  </dialog>, document.body)
}
