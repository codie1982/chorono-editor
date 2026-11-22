import { flushSync } from 'react-dom'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'

/** Private native-viewport acceptance: three gestures must share one stage,
 * keep the entry ghost unchanged and undo/redo individually. Never accesses a
 * connected document; the caller supplies the synthetic fixture's editor. */
export async function checkMeshEditSession(editor: EditorStateReturn, id: string): Promise<string> {
  const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const require = (value: unknown, message: string) => { if (!value) throw new Error(message) }
  const layer = () => editor.getScene().layers.find(item => item.id === id)!
  const ghost = () => {
    const path = document.querySelector('[data-edit-ghost]')
    require(path, 'Enter Edit mode first.')
    return path!.getAttribute('d') + '|' + path!.getAttribute('transform')
  }
  const snapshot = () => JSON.stringify({ geometry: layer().mesh2d!.geometry,
    modifiers: layer().modifierStack, transform: layer().transform })
  const initialGhost = ghost(), transform = JSON.stringify(layer().transform), history = [snapshot()]
  let modifierId = ''
  const assertSession = () => {
    require(ghost() === initialGhost, 'The entry ghost changed during editing or Undo.')
    require(JSON.stringify(layer().transform) === transform, 'Object transform changed during geometry editing.')
  }
  const click = async (label: string) => {
    const button = Array.from(document.querySelectorAll('nav button')).find(item => item.textContent === label) as HTMLButtonElement | undefined
    require(button, `Missing native button: ${label}`)
    flushSync(() => button!.click()); await frames()
  }
  const pointer = (target: EventTarget, type: string, p: { x: number; y: number }) => flushSync(() => {
    target.dispatchEvent(new PointerEvent(type, { pointerId: 95, pointerType: 'mouse', button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }))
  })
  try {
    for (const mode of ['move', 'rotate', 'scale']) {
      await click(mode)
      const source = layer(), scene = editor.getScene(), canvas = document.querySelector('canvas')!, rect = canvas.getBoundingClientRect()
      const mesh = source.mesh2d!.geometry, triangle = mesh.topology.triangleIndices.slice(0, 3)
      const point = triangle.reduce((p, vertex) => ({ x: p.x + mesh.positions[vertex * 2] / 3,
        y: p.y + mesh.positions[vertex * 2 + 1] / 3 }), { x: 0, y: 0 })
      const matrix = resolveLayerWorldMatrix(source, scene), world = matrix.applyToPoint(point)
      const origin = matrix.applyToPoint({ x: source.transform.anchorX, y: source.transform.anchorY })
      const client = (p: { x: number; y: number }) => ({ x: rect.left + p.x * rect.width / scene.composition.width,
        y: rect.top + p.y * rect.height / scene.composition.height })
      const start = client(world), pivot = client(origin), dx = start.x - pivot.x, dy = start.y - pivot.y, angle = Math.PI / 9
      const end = mode === 'move' ? { x: start.x + 30, y: start.y + 20 }
        : mode === 'scale' ? { x: pivot.x + dx * 1.15, y: pivot.y + dy * 1.15 }
        : { x: pivot.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: pivot.y + dx * Math.sin(angle) + dy * Math.cos(angle) }
      pointer(canvas, 'pointerdown', start); pointer(window, 'pointermove', end); await frames()
      assertSession()
      pointer(window, 'pointerup', end); await frames()
      require(!editor.isTransactionActive(), 'Gesture left a transaction open.')
      const edits = layer().modifierStack!.modifiers.filter(item => item.type === 'meshTransform')
      require(edits.length === 1, 'Each movement added another Edit Mesh modifier.')
      modifierId ||= edits[0].id
      require(edits[0].id === modifierId, 'Edit Mesh instance ID changed between tools.')
      assertSession(); require(snapshot() !== history.at(-1), `${mode} did not change geometry.`); history.push(snapshot())
    }
    for (let step = 2; step >= 0; step--) {
      await click('Undo'); require(snapshot() === history[step], 'Undo did not restore exactly one movement.'); assertSession()
    }
    for (let step = 1; step <= 3; step++) {
      await click('Redo'); require(snapshot() === history[step], 'Redo did not restore exactly one movement.'); assertSession()
    }
    return 'PASS · 3 gestures / 1 Edit Mesh · 3 separate Undo/Redo · entry ghost unchanged'
  } finally {
    if (editor.isTransactionActive()) pointer(window, 'pointercancel', { x: 0, y: 0 })
    await click('select')
  }
}
