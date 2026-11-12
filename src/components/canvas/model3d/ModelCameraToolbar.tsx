'use client'
import type { useModelCamera } from './useModelCamera'
/** Explicit tool state, with numeric alternatives in Properties. Toolbar owns
 * its pointer events; toggling never creates a source/history edit. */
export function ModelCameraToolbar({ camera }: { camera: ReturnType<typeof useModelCamera> }) {
  if (!camera.visible) return null
  return <div data-viewport-cursor-block role="toolbar" aria-label="3D camera controls"
    onPointerDown={event => event.stopPropagation()}
    className="absolute bottom-3 left-3 z-30 flex flex-wrap items-center gap-2 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-200">
    <button type="button" aria-pressed={camera.active} onClick={() => camera.setEnabled(!camera.enabled)}
      className={`rounded px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${camera.active ? 'bg-sky-700' : 'bg-gray-700'}`}>Edit 3D camera</button>
    {camera.active && <>
      <select aria-label="3D camera movement" className="bg-gray-800 rounded p-1" value={camera.mode} onChange={event => camera.setMode(event.target.value as typeof camera.mode)}>
        <option value="orbit">Orbit</option><option value="pan">Pan</option><option value="dolly">Dolly</option>
      </select>
      <button type="button" onClick={camera.reset} className="rounded bg-gray-700 px-2 py-1">Reset camera</button>
      <span>Drag to adjust · Esc cancels</span>
    </>}
  </div>
}
