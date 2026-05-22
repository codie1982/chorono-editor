'use client'
import type { ReactNode } from 'react'

/** Labelled section used inside export dialogs. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
      {children}
    </div>
  )
}

interface Props {
  title: string
  onClose: () => void
  /** Block overlay + ✕ close (e.g. while an export is running). */
  closeDisabled?: boolean
  /** Panel max-width utility class. Default 'max-w-md'. */
  maxWidth?: string
  /** Dialog body (Fields, options…). */
  children: ReactNode
  /** Right-aligned action buttons (Cancel / Export…). */
  footer: ReactNode
}

/**
 * Shared modal shell for export dialogs (raster / SVG / sequence): backdrop,
 * centred panel, header with ✕, body, and a right-aligned footer. Each dialog
 * supplies only its own options + action buttons.
 */
export default function BaseExportDialog({
  title, onClose, closeDisabled = false, maxWidth = 'max-w-md', children, footer,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={closeDisabled ? undefined : onClose}
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-lg shadow-2xl ${maxWidth} w-full mx-4 p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">{title}</h2>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {children}

        <div className="flex justify-end gap-2 pt-3">{footer}</div>
      </div>
    </div>
  )
}
