'use client'
// ── ImportPreviewModal (BL-09) ────────────────────────────────────────────────
// Shows preflight analysis for a single file before committing the import:
// what will be created, detected features, unsupported features and warnings.

import { FileTypeDetector } from '@/lib/import/FileTypeDetector'
import type { ImportPreflight } from '@/lib/import/types'

interface Props {
  fileName:  string
  preflight: ImportPreflight
  onConfirm: () => void
  onCancel:  () => void
}

function bytes(n: number): string {
  if (n <= 0) return '—'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

export default function ImportPreviewModal({ fileName, preflight, onConfirm, onCancel }: Props) {
  const s = preflight.summary
  const createdAll: Array<[string, number]> = [
    ['Layers', s.estimatedLayers],
    ['Assets', s.estimatedAssets],
    ['Groups', s.estimatedGroups],
    ['Tracks', s.estimatedTracks],
  ]
  const created = createdAll.filter(([, n]) => n > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[460px] max-h-[80vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-100 truncate" title={fileName}>Import {fileName}</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0 ml-2">×</button>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">
          {FileTypeDetector.label(preflight.format)} · {preflight.kind}
        </div>

        {/* Will create */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Will create</div>
          {created.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {created.map(([label, n]) => (
                <span key={label} className="px-2 py-0.5 rounded bg-gray-800 text-[11px] text-gray-200">
                  {n} {label.toLowerCase()}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-gray-500">No editable layers (asset stored in library)</div>
          )}
          {s.estimatedMemoryBytes > 0 && (
            <div className="mt-1 text-[10px] text-gray-500">≈ {bytes(s.estimatedMemoryBytes)} in memory</div>
          )}
        </div>

        {/* Detected features */}
        {s.detectedFeatures.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Detected</div>
            <div className="flex flex-wrap gap-1.5">
              {s.detectedFeatures.map((f, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-sky-900/40 text-sky-300 text-[11px]">{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* Unsupported features */}
        {s.unsupportedFeatures.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-amber-500/80 mb-1">Not fully supported</div>
            <ul className="space-y-0.5">
              {s.unsupportedFeatures.map((f, i) => (
                <li key={i} className="text-[11px] text-amber-400/90">• {f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {preflight.warnings.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-rose-500/80 mb-1">Warnings</div>
            <ul className="space-y-0.5">
              {preflight.warnings.map((w, i) => (
                <li key={i} className="text-[11px] text-rose-400/90">• {w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="text-[11px] px-3 py-1 rounded text-gray-300 hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
