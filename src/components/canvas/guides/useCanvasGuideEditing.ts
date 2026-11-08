import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { makeSceneGuidesCmd, readSceneGuides, assertCurrentSceneGuide, type SceneGuide } from '@/lib/editor/guides/SceneGuides'
import { canvasPointerWorld } from '../interactions/canvasCoordinates'
import { GuideDragSession } from './GuideDragSession'
import { guideDragPosition } from './guideDragPosition'

interface Options {
  scene: ChronoScene
  editor: EditorStateReturn
  canvasRef: RefObject<HTMLCanvasElement>
  enabled: boolean
  onWarning?: (message: string) => void
}

/** Validate the rendered editing scope before accepting a stale DOM event.
 * This also rejects a document replacement that happens to reuse source refs. */
function currentGuideScene(current: Options & { document: AbortSignal }): ChronoScene {
  const scene = current.editor.getScene()
  if (current.document.aborted || current.document !== current.editor.getDocumentSignal() || current.scene !== scene) {
    throw new Error('The scene or document changed. Start the guide edit again from the current viewport.')
  }
  return scene
}

/** Own transient guide selection and pointer sessions. Persisted guide records
 * belong to the scene; cursor/selection and DOM handles never enter history.
 * Numeric operations and pointer commits share one canonical command. Source
 * or document replacement cancels safely via EditorPointerSession. Guide edits
 * do not change layer selection, parent relations, keys or render source. */
export function useCanvasGuideEditing(options: Options) {
  const document = options.editor.getDocumentSignal()
  const snapshot = { ...options, document }
  const latest = useRef(snapshot); latest.current = snapshot
  const session = useRef<GuideDragSession | null>(null)
  const [selectedId, select] = useState<string | null>(null)
  const [open, setOpen] = useState(false), [error, setError] = useState('')
  const read = readSceneGuides(options.scene)
  useEffect(() => () => { session.current?.cancel(); session.current = null }, [options.enabled, document])
  const warn = useCallback((message: string) => { setError(message); latest.current.onWarning?.(message) }, [])
  const close = useCallback(() => { session.current?.cancel(); select(null); setOpen(false); setError('') }, [])
  const dispatch = useCallback((guideId: string | null, change: (guides: readonly SceneGuide[]) => readonly SceneGuide[], label: string) => {
    const current = latest.current
    if (!current.enabled || current.editor.isTransactionActive()) return false
    try {
      const base = currentGuideScene(current), existing = readSceneGuides(base)
      if (existing.error) throw new Error(existing.error)
      current.editor.dispatchCommand(makeSceneGuidesCmd(base, change(existing.guides), label))
      select(guideId); setError(''); return true
    } catch (failure) { warn(failure instanceof Error ? failure.message : String(failure)); return false }
  }, [warn])
  const add = useCallback((axis: 'v' | 'h', position: number) => {
    const id = `guide_${crypto.randomUUID()}`
    if (dispatch(id, guides => [...guides, { id, axis, position }], 'Add guide')) setOpen(true)
  }, [dispatch])
  const update = useCallback((guide: SceneGuide, patch: Partial<Pick<SceneGuide, 'position' | 'locked' | 'hidden'>>) => {
    return dispatch(guide.id, guides => {
      assertCurrentSceneGuide(guides, guide)
      return guides.map(item => item.id === guide.id ? { ...item, ...patch } : item)
    }, 'Edit guide')
  }, [dispatch])
  const remove = useCallback((guide: SceneGuide) => dispatch(null, guides => {
    assertCurrentSceneGuide(guides, guide)
    return guides.filter(item => item.id !== guide.id)
  }, 'Delete guide'), [dispatch])
  const begin = useCallback((axis: 'v' | 'h', event: React.PointerEvent<HTMLElement>, existing?: SceneGuide) => {
    const current = latest.current, canvas = current.canvasRef.current
    if (!current.enabled || event.button !== 0 || !canvas || session.current || current.editor.isTransactionActive()) return
    event.preventDefault(); event.stopPropagation(); setOpen(true); setError('')
    try {
      const source = readSceneGuides(currentGuideScene(current))
      if (source.error) throw new Error(source.error)
      if (existing) assertCurrentSceneGuide(source.guides, existing)
    } catch (failure) { warn(failure instanceof Error ? failure.message : String(failure)); return }
    if (existing?.locked) { select(existing.id); return }
    const origin = canvasPointerWorld(canvas, event.clientX, event.clientY)
    const id = existing?.id ?? `guide_${crypto.randomUUID()}`
    select(id)
    current.editor.beginTransaction()
    session.current = new GuideDragSession({ startClientX: event.clientX, startClientY: event.clientY }, {
      getEditor: () => latest.current.editor, eventTarget: window,
      preview: (base, sample) => {
        const point = canvasPointerWorld(canvas, sample.clientX, sample.clientY)
        const position = guideDragPosition(axis, origin, point, existing?.position), guides = readSceneGuides(base)
        if (guides.error) throw new Error(guides.error)
        const next = existing ? guides.guides.map(guide => guide.id === id ? { ...guide, position } : guide)
          : [...guides.guides, { id, axis, position }]
        const command = makeSceneGuidesCmd(base, next, existing ? 'Move guide' : 'Add guide')
        return { scene: command.execute(base), command, changed: !existing || Math.abs(position - existing.position) > 1e-9 }
      },
      show: () => {}, commit: (_base, preview) => latest.current.editor.commitTransaction(preview.command),
      clear: () => { session.current = null }, warning: warn,
    }, { pointerId: event.pointerId, currentTarget: event.currentTarget })
  }, [warn])
  return { guides: read.guides, error: error || read.error, selectedId, open, setOpen, select, close,
    selected: read.guides.find(guide => guide.id === selectedId), add, update, remove, begin, reportError: warn }
}

export type CanvasGuideEditing = ReturnType<typeof useCanvasGuideEditing>
