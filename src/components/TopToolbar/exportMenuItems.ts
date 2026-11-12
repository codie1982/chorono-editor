import type { MenuActionItem } from '@/components/ui/ContextMenu'

export interface ExportActions {
  onExportRuntime: () => void
  onExportImage?: () => void
  onExportSvg?: () => void
  onExportSequence?: () => void
  onExportHtml?: () => void
}

/** One action catalog for File and toolbar Export menus. Only available
 * callbacks are exposed; all serialization/download work stays with the
 * existing caller. Building the catalog never invokes an export. */
export function exportMenuItems(actions: ExportActions): MenuActionItem[] {
  const choices: Array<[string, (() => void) | undefined]> = [
    ['Image (PNG / WEBP / JPEG)…', actions.onExportImage],
    ['SVG (vector)…', actions.onExportSvg],
    ['Image Sequence (ZIP)…', actions.onExportSequence],
    ['Standalone HTML (self-playing)', actions.onExportHtml],
    ['Runtime JSON (lean)', actions.onExportRuntime],
  ]
  return choices.flatMap(([label, onSelect]) => onSelect ? [{ kind: 'action' as const, label, onSelect }] : [])
}
