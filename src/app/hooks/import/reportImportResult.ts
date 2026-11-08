import type { ImportResult } from '@/lib/import/types'
import { toast } from '@/lib/toast/toast'

/** Report an adopted current-document result. Has no source ownership or state
 * mutation; callers must suppress stale/cancelled results before invoking it. */
export function reportImportResult(result: ImportResult, label: string): void {
  const { assets, layers } = result.report.created
  const parts = []
  if (layers) parts.push(`${layers} layer${layers === 1 ? '' : 's'}`)
  if (assets) parts.push(`${assets} asset${assets === 1 ? '' : 's'}`)
  const summary = parts.join(', ') || 'no editable content'
  if (result.warnings.length) {
    const count = result.warnings.length
    toast.warning(`Imported ${label} (${summary})`, { detail: `${count} warning${count === 1 ? '' : 's'} — see import report` })
    console.info(`[import] ${label} warnings:`, result.warnings)
  } else toast.success(`Imported ${label}`, { detail: summary })
}
