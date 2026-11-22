import { ADD_LAYER_GROUPS } from '@/lib/icons/iconMap'
import { openDocumentFilePicker } from '@/components/import/DocumentFilePicker'
import type { MenuItem } from '@/components/ui/ContextMenu'

export interface LayerAdditionActions {
  onAdd: (kind: string) => boolean | void
  onAddImage: (file: File) => void
  onAddVideo: (file: File) => void
  onAddAudio: (file: File) => void
  onImportSvg?: (file: File) => void
  getDocumentSignal?: () => AbortSignal
}

/** Activate the same native tool or document-scoped media picker from any Add
 * surface. True keeps an inline palette open for a persistent creation tool;
 * context-menu callers close their own menu independently. No source geometry
 * is created here; the editor's existing add/import handlers own that work. */
export function activateLayerAddition(kind: string, actions: LayerAdditionActions): boolean {
  const media = kind === 'image' ? { accept: 'image/*', run: actions.onAddImage }
    : kind === 'video' ? { accept: 'video/*', run: actions.onAddVideo }
    : kind === 'audio' ? { accept: 'audio/*', run: actions.onAddAudio }
    : kind === 'svgImport' ? { accept: '.svg,image/svg+xml', run: actions.onImportSvg } : null
  if (!media) return actions.onAdd(kind) === true
  if (media.run) openDocumentFilePicker({ accept: media.accept, getDocumentSignal: actions.getDocumentSignal,
    onFiles: files => media.run?.(files[0]) })
  return false
}

/** Available categories/items from the authoritative Layers Add catalogue.
 * Unavailable entries are omitted; ordering/labels stay identical to + Add.
 * Each action captures its own kind and delegates insertion to the host. */
export function buildAddLayerMenu(onAdd: (kind: string) => void): MenuItem[] {
  return ADD_LAYER_GROUPS.flatMap(group => {
    const items: MenuItem[] = group.items.filter(item => item.available).map(item => ({
      kind: 'action', label: item.label, onSelect: () => onAdd(item.type),
    }))
    return items.length ? [{ kind: 'submenu' as const, label: group.title, items }] : []
  })
}
