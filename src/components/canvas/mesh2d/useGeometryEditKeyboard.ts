import { useEffect, type RefObject } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { ShortcutContext } from '@/lib/shortcuts'
import { hasVisibleKeyboardScope } from '@/lib/shortcuts/keyboardScope'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { makeTransformMeshGeometryCmd, makeExecuteModifierStackCmd } from '@/lib/editor/modifiers/commands'
import { uid } from '@/lib/spline/util/uid'

/** Capture geometry-mode keys before layer shortcuts. Mesh nudges edit local
 * geometry through native stack commands; copy/delete/group never accidentally
 * target the whole layer. Input fields, modal scopes, transactions and inactive
 * canvas scopes retain their existing owners. Listeners release on mode exit. */
export function useGeometryEditKeyboard(options: {
  active: boolean; layer: Layer | null; editor: EditorStateReturn; timeMs: number; overrides?: OverrideMap
  canvasRef: RefObject<HTMLCanvasElement>; getContext?: () => ShortcutContext
  exit?: () => void; warning(message: string): void
}) {
  useEffect(() => {
    if (!options.active) return
    const keydown = (event: KeyboardEvent) => {
      const { editor, layer } = options, target = event.target instanceof Element ? event.target : null
      if (!layer || editor.isTransactionActive() || hasVisibleKeyboardScope() || options.canvasRef.current?.closest('[inert]')
        || target?.closest('input,textarea,select,[contenteditable=true]') || options.getContext && options.getContext() !== 'canvas') return
      const navigation = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      const sourceAction = (event.ctrlKey || event.metaKey) && ['d', 'c', 'v', 'x', 'g'].includes(event.key.toLowerCase())
      if (!navigation && !sourceAction && !['Escape', 'Delete', 'Backspace'].includes(event.key)) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.key === 'Escape') { options.exit?.(); return }
      if (!navigation || layer.type !== 'mesh2d') { options.warning('Exit Edit mode to use layer commands.'); return }
      try {
        const scene = editor.getScene(), step = event.shiftKey ? 10 : 1
        const matrix = resolveLayerWorldMatrix(layer, scene, options.timeMs, options.overrides)
        if (Math.abs(matrix.determinant()) < 1e-9) throw new Error('The mesh transform is singular.')
        const delta = matrix.invert().applyToVector({ x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 })
        const last = layer.modifierStack?.modifiers.at(-1)
        // Adjacent nudges update one stage, avoiding an instance per key repeat.
        const command = last?.type === 'meshTransform' && last.enabled
          ? makeExecuteModifierStackCmd(scene, layer.id, { [last.id]: { x: Number(last.settings.x) + delta.x, y: Number(last.settings.y) + delta.y } })
          : makeTransformMeshGeometryCmd(scene, layer.id, uid('mesh-edit'), { x: delta.x, y: delta.y,
            rotation: 0, scaleX: 1, scaleY: 1, pivotX: layer.transform.anchorX, pivotY: layer.transform.anchorY })
        editor.dispatchCommand(command)
      } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [options.active, options.layer, options.editor, options.timeMs, options.overrides, options.getContext, options.exit])
}
