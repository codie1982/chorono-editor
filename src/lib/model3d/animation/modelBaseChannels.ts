/** Exact stable placement/camera scalar leaves in presentation units/degrees. */
export const MODEL_CONTENT_PATHS: readonly string[] = Object.freeze([
  ...['position', 'rotation'].flatMap(field => ['x', 'y', 'z'].map(axis => `model3d.${field}.${axis}`)),
  'model3d.scale',
  ...['yaw', 'pitch', 'roll', 'distance', 'fov', 'targetX', 'targetY', 'targetZ'].map(field => `model3d.camera.${field}`),
])
