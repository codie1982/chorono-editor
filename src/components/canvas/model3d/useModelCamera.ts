'use client'
import { cameraIsDriven } from '@/lib/model3d/source/cameraDrivers'
import { useEffect, useRef, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ChronoScene } from '@/lib/types'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { modelDefaults } from '@/lib/model3d/source/modelDefaults'
import { cameraGesture } from '@/lib/model3d/source/cameraGesture'
import { EditorPointerSession, type EditorPointerSessionHost, type EditorPointerStart } from '../interactions/EditorPointerSession'

interface Preview { scene: ChronoScene; command: ReturnType<typeof makeUpdateLayerCmd>; changed: boolean }
const DRIVEN_CAMERA_WARNING = 'Camera animation or a driver is preserved. Direct camera placement is disabled; isolated 3D editing is planned.'
/** Camera-specific source transaction; native capture/up/cancel/stale ownership
 * remains in the same lifecycle used by 2D object and guide gestures. */
class CameraSession extends EditorPointerSession<Preview> {
  constructor(x: number, y: number, host: EditorPointerSessionHost<Preview>, pointer: EditorPointerStart) {
    super({ startClientX: x, startClientY: y }, host, pointer)
  }
}
/** Transient camera tool for exactly one selected model. No camera edits occur
 * while disabled. Explicit camera gestures change saved output framing in one
 * Undo; ordinary 2D transforms, keys and child relations remain untouched.
 * Driven cameras are refused rather than silently replacing animation. */
export function useModelCamera(scene: ChronoScene, selectedId: string | null, editor: EditorStateReturn, available: boolean, warning: (message: string) => void) {
  const [enabled, setEnabled] = useState(false), [mode, setMode] = useState<'orbit' | 'pan' | 'dolly'>('orbit')
  const latest = useRef({ scene, selectedId, editor, warning }); latest.current = { scene, selectedId, editor, warning }
  const session = useRef<CameraSession | null>(null)
  const document = editor.getDocumentSignal()
  useEffect(() => { setEnabled(false); return () => { session.current?.cancel(false, 'camera-scope-change'); session.current = null } }, [selectedId, document, available])
  useEffect(() => { if (!enabled) session.current?.cancel(false, 'camera-toggle-off') }, [enabled])
  const layer = scene.layers.find(item => item.id === selectedId)
  const visible = available && layer?.type === 'model3d' && !!layer.model3d && !layer.instanceOf && !layer.locked && !layer.frozen && !layer.hidden
  /** Capture primary drags only when explicitly enabled; all other events retain
   * their existing 2D routing. Source identity is checked before transaction start. */
  const begin = (event: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!visible || !enabled || event.button !== 0) return false
    event.preventDefault(); event.stopPropagation()
    const current = latest.current, base = current.editor.getScene(), source = base.layers.find(item => item.id === current.selectedId)
    if (session.current || current.editor.isTransactionActive()) return true
    if (base !== current.scene || !source?.model3d) { current.warning('Scene changed. Start the camera gesture again.'); return true }
    if (cameraIsDriven(base, source)) { current.warning(DRIVEN_CAMERA_WARNING); return true }
    const x = event.clientX, y = event.clientY
    current.editor.beginTransaction()
    try {
      session.current = new CameraSession(x, y, {
        getEditor: () => latest.current.editor, eventTarget: window,
        diagnostics: { owner: 'model-camera', details: { layerId: source.id, mode } },
        preview: (snapshot, sample) => {
          const data = cameraGesture(source.model3d!, sample.clientX - x, sample.clientY - y, mode)
          const command = makeUpdateLayerCmd(source.id, { model3d: data }, source)
          return { scene: command.execute(snapshot), command, changed: JSON.stringify(data.camera) !== JSON.stringify(source.model3d!.camera) }
        }, hasChanges: preview => preview.changed, show: () => {},
        commit: (_base, preview) => latest.current.editor.commitTransaction(preview.command),
        clear: () => { session.current = null }, warning: message => latest.current.warning(message),
      }, { pointerId: event.pointerId, currentTarget: event.currentTarget })
    } catch (error) { current.editor.cancelTransaction(); current.warning(String(error)) }
    return true
  }
  /** Explicit Reset restores the default camera, never the original imported tree.
   * Same refusal policy as mouse controls prevents hidden animation overwrite. */
  const reset = () => {
    if (!layer?.model3d || editor.isTransactionActive() || editor.getScene() !== scene || !visible) return
    if (cameraIsDriven(scene, layer)) { warning(DRIVEN_CAMERA_WARNING); return }
    editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { model3d: { ...layer.model3d, camera: modelDefaults().camera } }, layer))
  }
  return { visible, active: visible && enabled, enabled, setEnabled, mode, setMode, begin, reset }
}
