/**
 * Editor-only visibility choices for fracture diagnostics drawn over Canvas.
 *
 * The state is deliberately kept outside `ChronoScene`: it is a local viewport
 * preference, is not part of undo/save/export and never changes the rendered
 * project. `recordId` selects one applied fracture bake; a missing or stale id
 * is resolved to the newest compatible record by the controls and renderer.
 */
export interface PhysicsViewportOverlaySettings {
  readonly enabled: boolean
  readonly recordId: string | null
  readonly fragments: boolean
  readonly colliders: boolean
  readonly centroids: boolean
  readonly triangles: boolean
}

/** Safe, low-noise defaults; diagnostics appear only after explicit opt-in. */
export const DEFAULT_PHYSICS_VIEWPORT_OVERLAY_SETTINGS: PhysicsViewportOverlaySettings = Object.freeze({
  enabled: false,
  recordId: null,
  fragments: true,
  colliders: true,
  centroids: true,
  triangles: false,
})
