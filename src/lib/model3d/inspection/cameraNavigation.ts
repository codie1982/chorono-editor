/** Camera orientation in the Y-up presentation frame. Positive roll turns
 * the rendered image clockwise, matching a clockwise two-finger rotation. */
export interface NavigableCamera {
  yaw: number; pitch: number; roll?: number; distance: number; fov: number
  targetX: number; targetY: number; targetZ: number
  projection?: 'perspective' | 'orthographic'; orthoHeight?: number
}

/** Unit screen axes for a yaw/pitch/roll orbit camera. The pole formula stays
 * defined at exactly ±90° pitch; no mutable Three vectors are shared. */
export function cameraScreenAxes(camera: Pick<NavigableCamera, 'yaw' | 'pitch' | 'roll'>) {
  const yaw = camera.yaw * Math.PI / 180, pitch = camera.pitch * Math.PI / 180, roll = (camera.roll ?? 0) * Math.PI / 180
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) }
  const up = { x: -Math.sin(yaw) * Math.sin(pitch), y: Math.cos(pitch), z: -Math.cos(yaw) * Math.sin(pitch) }
  const c = Math.cos(roll), s = Math.sin(roll)
  return {
    right: { x: right.x * c + up.x * s, y: right.y * c + up.y * s, z: right.z * c + up.z * s },
    up: { x: up.x * c - right.x * s, y: up.y * c - right.y * s, z: up.z * c - right.z * s },
  }
}

/** Translate the camera target opposite a CSS-pixel view drag. When the
 * viewport height is known, scale follows the active projection; older mouse
 * callers retain their established distance-based fallback. */
export function panCamera<T extends NavigableCamera>(camera: T, dx: number, dy: number, heightPx?: number): T {
  const { right, up } = cameraScreenAxes(camera)
  const limit = (value: number) => Math.max(-1e6, Math.min(1e6, value))
  const step = heightPx && heightPx > 0
    ? camera.projection === 'orthographic' && camera.orthoHeight !== undefined
      ? camera.orthoHeight / heightPx
      : 2 * camera.distance * Math.tan(camera.fov * Math.PI / 360) / heightPx
    : camera.distance * .002
  return { ...camera,
    targetX: limit(camera.targetX + (-dx * right.x + dy * up.x) * step),
    targetY: limit(camera.targetY + (-dx * right.y + dy * up.y) * step),
    targetZ: limit(camera.targetZ + (-dx * right.z + dy * up.z) * step),
  }
}

/** Scale camera framing; factors above one zoom in. Both projection distances
 * are bounded so switching projection after a pinch retains usable framing. */
export function zoomCamera<T extends NavigableCamera>(camera: T, scale: number): T {
  // exp() can underflow/overflow for an extreme wheel delta; the clamps below
  // still give the intended far/near limit instead of losing the gesture.
  if (Number.isNaN(scale) || scale < 0) return { ...camera }
  return { ...camera,
    distance: Math.max(.1, Math.min(1000, camera.distance / scale)),
    ...(camera.orthoHeight === undefined ? {} : { orthoHeight: Math.max(.01, Math.min(10000, camera.orthoHeight / scale)) }),
  }
}

/** Apply clockwise screen-space roll in degrees, normalized to [-180, 180). */
export function rollCamera<T extends NavigableCamera>(camera: T, deltaDeg: number): T {
  if (!Number.isFinite(deltaDeg)) return { ...camera }
  const roll = (((camera.roll ?? 0) + deltaDeg + 180) % 360 + 360) % 360 - 180
  return { ...camera, roll }
}
