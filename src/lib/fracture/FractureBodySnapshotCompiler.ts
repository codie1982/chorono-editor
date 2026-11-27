import type {
  AnyFractureGeneration,
  FractureRegionFragmentGeometry,
  FragmentGeometry,
} from '@/lib/types/fracture'
import type { RigidBodySnapshot } from '@/lib/types/physics'

/**
 * Converts realized fragment geometry into delayed rigid-body snapshots.
 *
 * The source may be a root body or a fragment activated by an earlier event.
 * Geometry remains in the source layer's local pixel space; offsets are
 * measured from the source centre of mass, scaled once and rotated only when
 * deriving the initial composition pose. The Matter backend later recomputes
 * the offset from the source's live event pose. Instances are stateless.
 */
export class FractureBodySnapshotCompiler {
  /** Compile every fragment in manifest order for one atomic event. */
  compile(
    source: RigidBodySnapshot,
    generation: AnyFractureGeneration,
    eventId: string,
  ): readonly RigidBodySnapshot[] {
    return generation.schemaVersion === 1
      ? generation.fragments.map(fragment => compileConvexFragment(source, fragment, eventId))
      : generation.fragments.map(fragment => compileRegionFragment(source, fragment, eventId))
  }
}

function compileConvexFragment(
  source: RigidBodySnapshot,
  fragment: FragmentGeometry,
  eventId: string,
): RigidBodySnapshot {
  const metrics = fragmentMetrics(source, fragment.centroidPx)
  return Object.freeze({
    ...commonSnapshot(source, fragment.id, eventId, metrics),
    collider: 'convexPolygon' as const,
    colliderVerticesPx: fragment.polygon.map(point => Object.freeze({
      x: (point.x - fragment.centroidPx.x) * metrics.scale,
      y: (point.y - fragment.centroidPx.y) * metrics.scale,
    })),
    widthPx: (fragment.boundsPx.maxX - fragment.boundsPx.minX) * metrics.scale,
    heightPx: (fragment.boundsPx.maxY - fragment.boundsPx.minY) * metrics.scale,
  })
}

function compileRegionFragment(
  source: RigidBodySnapshot,
  fragment: FractureRegionFragmentGeometry,
  eventId: string,
): RigidBodySnapshot {
  if (!fragment.colliderParts.length || fragment.colliderParts.length > 256
    || fragment.colliderParts.reduce((sum, part) => sum + part.length, 0) > 4096) {
    throw new Error(`Fracture region collider budget exceeded: ${fragment.id}`)
  }
  const metrics = fragmentMetrics(source, fragment.centroidPx)
  return Object.freeze({
    ...commonSnapshot(source, fragment.id, eventId, metrics),
    collider: 'compoundPolygon' as const,
    colliderPartsPx: fragment.colliderParts.map(part => part.map(point => Object.freeze({
      x: (point.x - fragment.centroidPx.x) * metrics.scale,
      y: (point.y - fragment.centroidPx.y) * metrics.scale,
    }))),
    widthPx: (fragment.boundsPx.maxX - fragment.boundsPx.minX) * metrics.scale,
    heightPx: (fragment.boundsPx.maxY - fragment.boundsPx.minY) * metrics.scale,
  })
}

function fragmentMetrics(source: RigidBodySnapshot, centroidPx: { readonly x: number; readonly y: number }) {
  const scale = source.visual.uniformScale
  const sourceCenterLocal = source.visual.centerOfMassLocalPx ?? {
    x: source.visual.widthPx / 2,
    y: source.visual.heightPx / 2,
  }
  const sourceLocalOffsetPx = {
    x: (centroidPx.x - sourceCenterLocal.x) * scale,
    y: (centroidPx.y - sourceCenterLocal.y) * scale,
  }
  const worldOffset = rotate(sourceLocalOffsetPx, source.angleDeg)
  return { scale, sourceLocalOffsetPx, worldOffset, centroidPx }
}

function commonSnapshot(
  source: RigidBodySnapshot,
  layerId: string,
  eventId: string,
  metrics: ReturnType<typeof fragmentMetrics>,
) {
  return {
    layerId,
    bodyId: `rigid:${layerId}`,
    motionType: 'dynamic' as const,
    activation: {
      kind: 'fractureFragment' as const,
      eventId,
      sourceBodyId: source.bodyId,
      sourceLocalOffsetPx: metrics.sourceLocalOffsetPx,
    },
    material: { ...source.material },
    initialVelocityPxPerSecond: { ...source.initialVelocityPxPerSecond },
    initialAngularVelocityDegPerSecond: source.initialAngularVelocityDegPerSecond,
    centerPx: {
      x: source.centerPx.x + metrics.worldOffset.x,
      y: source.centerPx.y + metrics.worldOffset.y,
    },
    angleDeg: source.angleDeg,
    visual: {
      widthPx: source.visual.widthPx,
      heightPx: source.visual.heightPx,
      anchorX: metrics.centroidPx.x,
      anchorY: metrics.centroidPx.y,
      uniformScale: metrics.scale,
      centerOfMassLocalPx: { ...metrics.centroidPx },
    },
  }
}

function rotate(point: { x: number; y: number }, angleDeg: number): { x: number; y: number } {
  const radians = angleDeg * Math.PI / 180
  const cosine = Math.cos(radians), sine = Math.sin(radians)
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y }
}
