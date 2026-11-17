import { openDocumentFilePicker } from '@/components/import/DocumentFilePicker'

interface AddLayerHandlers {
  onAdd: (kind: string) => boolean | void
  getDocumentSignal?: () => AbortSignal
  onAddImage: (file: File) => void; onAddVideo: (file: File) => void; onAddAudio: (file: File) => void
  onImportSvg?: (file: File) => void; onImportModel?: (file: File) => void
}

/** Authoritative Add-item UI dispatcher for palette and context menus. Media
 * routes through the existing document-lifetime picker and native import owner;
 * all other kinds use the existing registry/drawing command. It creates no
 * second layer factory or placement session. Returns whether an inline palette
 * should remain open for a persistent creation tool. Context menus close normally.
 * Native file selection is synchronous with activation; cancel/stale results
 * follow DocumentFilePicker's existing no-source-mutation policy.
 */
export function activateAddLayerItem(kind: string, handlers: AddLayerHandlers): boolean {
  const media: Record<string, { accept: string; onFile?: (file: File) => void }> = {
    image: { accept: 'image/*', onFile: handlers.onAddImage },
    video: { accept: 'video/*', onFile: handlers.onAddVideo },
    audio: { accept: 'audio/*', onFile: handlers.onAddAudio },
    svgImport: { accept: '.svg,image/svg+xml', onFile: handlers.onImportSvg },
    model3d: { accept: '.glb,.gltf,model/gltf-binary,model/gltf+json', onFile: handlers.onImportModel },
  }
  const route = Object.hasOwn(media, kind) ? media[kind] : undefined
  if (!route) return handlers.onAdd(kind) === true
  openDocumentFilePicker({ accept: route.accept, getDocumentSignal: handlers.getDocumentSignal,
    onFiles: files => { if (files[0]) route.onFile?.(files[0]) } })
  return false
}
