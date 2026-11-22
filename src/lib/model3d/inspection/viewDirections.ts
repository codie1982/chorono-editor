import type { ModelViewCamera } from './types'

export interface ViewDirection { id: string; x: -1 | 0 | 1; y: -1 | 0 | 1; z: -1 | 0 | 1; label: string }

/** The 26 nonzero signed cube directions: six faces, twelve edges and eight
 * corners. Labels and coordinates share the editor's Y-up, +Z-front contract. */
export const VIEW_DIRECTIONS: readonly ViewDirection[] = ([-1, 0, 1] as const).flatMap(x =>
  ([-1, 0, 1] as const).flatMap(y => ([-1, 0, 1] as const).filter(z => x || y || z).map(z => ({
    id: `${x},${y},${z}`, x, y, z,
    label: [y ? y > 0 ? 'Top' : 'Bottom' : '', z ? z > 0 ? 'Front' : 'Back' : '', x ? x > 0 ? 'Right' : 'Left' : ''].filter(Boolean).join(' '),
  }))))

/** Snap the inspection orientation toward a signed cube direction. Target,
 * distance and projection are copied unchanged. At a pole, retaining yaw
 * makes the top/bottom screen-up direction deterministic. */
export function cameraForViewDirection(camera: ModelViewCamera, direction: ViewDirection): ModelViewCamera {
  const horizontal = Math.hypot(direction.x, direction.z)
  const requestedYaw = horizontal ? Math.atan2(direction.x, direction.z) * 180 / Math.PI : camera.yaw
  const delta = ((requestedYaw - camera.yaw + 540) % 360) - 180
  return { ...camera, yaw: camera.yaw + delta, pitch: Math.atan2(direction.y, horizontal) * 180 / Math.PI, roll: 0 }
}
