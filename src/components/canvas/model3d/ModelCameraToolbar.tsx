'use client'
import type { useModelCamera } from './useModelCamera'
/** Model-specific controls embedded in the existing viewport control strip.
 * This edits the saved output camera, not an inspection-only view. The group
 * owns its pointer events; toggling never creates a source/history edit. */
export function ModelCameraToolbar({ camera }: { camera: ReturnType<typeof useModelCamera> }) {
  if (!camera.visible) return null
  return <div data-viewport-cursor-block role="group" aria-label="3D camera controls"
    onPointerDown={event => event.stopPropagation()}
    className="flex flex-wrap items-center gap-2 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200">
    <button type="button" aria-pressed={camera.active} onClick={() => camera.setEnabled(!camera.enabled)}
      title="Edit the saved output camera. Keyframed or linked cameras are protected. Turn off to move or resize the 2D box."
      className={`rounded px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${camera.active ? 'bg-sky-700' : 'bg-gray-700'}`}>3D camera</button>
    {camera.active && <>
      <select aria-label="3D camera movement" className="bg-gray-800 rounded p-1" value={camera.mode} onChange={event => camera.setMode(event.target.value as typeof camera.mode)}>
        <option value="orbit">Orbit</option><option value="pan">Pan</option><option value="dolly">Dolly</option>
      </select>
      <button type="button" onClick={camera.reset} className="rounded bg-gray-700 px-2 py-1">Reset camera</button>
      <span>Saved camera · Esc cancels</span>
    </>}
  </div>
}
