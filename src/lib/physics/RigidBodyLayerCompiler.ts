import type { ChronoScene, Layer } from '@/lib/types'
import type { FractureBounds2D, FracturePoint2D } from '@/lib/types/fracture'
import type { RigidBodyAuthoring, RigidBodySnapshot } from '@/lib/types/physics'
import { rigidCenterFromLocalPoint, rigidCenterFromVisual } from './RigidVisualTransform'

const TRANSFORM_PATHS = new Set([
  'transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY',
  'transform.rotationDeg', 'transform.anchorX', 'transform.anchorY',
])

/** Prepared convex collider geometry in layer-local composition pixels. */
export interface PreparedConvexColliderGeometry {
  readonly polygon: readonly FracturePoint2D[]
  readonly centroidPx: FracturePoint2D
  readonly boundsPx: FractureBounds2D
}

/**
 * Compiles one visual layer and authored material into a solver snapshot.
 *
 * Rectangle adaptation preserves the historical rigid contract. Prepared
 * convex geometry is accepted only from an owning geometry compiler and is
 * centred on its uniform-density centroid. Common hierarchy, transform-writer,
 * material and unit validation is shared by both paths. Instances are
 * stateless and never retain scene or geometry buffers.
 */
export class RigidBodyLayerCompiler {
  compile(
    scene: ChronoScene,
    authoring: RigidBodyAuthoring,
    convex?: PreparedConvexColliderGeometry,
  ): RigidBodySnapshot {
    const layer = scene.layers.find(candidate => candidate.id === authoring.layerId)
    if (!layer) throw new Error(`Rigid body layer does not exist: ${authoring.layerId}`)
    this.assertCommon(scene, layer, authoring)
    if (authoring.collider === 'rectangle') return this.rectangle(layer, authoring)
    if (!convex || convex.polygon.length < 3) {
      throw new Error(`Convex rigid body ${layer.id} requires prepared collider geometry`)
    }
    return this.convex(layer, authoring, convex)
  }

  private rectangle(layer: Layer, authoring: RigidBodyAuthoring): RigidBodySnapshot {
    if (!isRectangleVisualLayer(layer)) throw new Error(`Rigid body ${layer.id} must be a rectangle shape or image layer`)
    const size = layer.size
    if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
      throw new RangeError(`Rigid body ${layer.id} requires positive finite rectangle dimensions`)
    }
    const center = rigidCenterFromVisual({
      x: layer.transform.x, y: layer.transform.y, angleDeg: layer.transform.rotationDeg,
      widthPx: size.width, heightPx: size.height, anchorX: layer.transform.anchorX,
      anchorY: layer.transform.anchorY, uniformScale: layer.transform.scaleX,
    })
    return this.snapshot(authoring, layer, center, size.width * layer.transform.scaleX,
      size.height * layer.transform.scaleX, { widthPx: size.width, heightPx: size.height })
  }

  private convex(
    layer: Layer,
    authoring: RigidBodyAuthoring,
    geometry: PreparedConvexColliderGeometry,
  ): RigidBodySnapshot {
    const scale = layer.transform.scaleX
    const center = rigidCenterFromLocalPoint({
      x: layer.transform.x, y: layer.transform.y, angleDeg: layer.transform.rotationDeg,
      localX: geometry.centroidPx.x, localY: geometry.centroidPx.y,
      anchorX: layer.transform.anchorX, anchorY: layer.transform.anchorY, uniformScale: scale,
    })
    const width = geometry.boundsPx.maxX - geometry.boundsPx.minX
    const height = geometry.boundsPx.maxY - geometry.boundsPx.minY
    return this.snapshot(authoring, layer, center, width * scale, height * scale, {
      widthPx: layer.size?.width ?? width,
      heightPx: layer.size?.height ?? height,
      centerOfMassLocalPx: { ...geometry.centroidPx },
      colliderVerticesPx: geometry.polygon.map(point => ({
        x: (point.x - geometry.centroidPx.x) * scale,
        y: (point.y - geometry.centroidPx.y) * scale,
      })),
    })
  }

  private snapshot(
    authoring: RigidBodyAuthoring,
    layer: Layer,
    centerPx: { readonly x: number; readonly y: number },
    widthPx: number,
    heightPx: number,
    visual: { readonly widthPx: number; readonly heightPx: number; readonly centerOfMassLocalPx?: FracturePoint2D; readonly colliderVerticesPx?: readonly FracturePoint2D[] },
  ): RigidBodySnapshot {
    return {
      ...authoring,
      material: { ...authoring.material },
      initialVelocityPxPerSecond: { ...authoring.initialVelocityPxPerSecond },
      bodyId: `rigid:${layer.id}`,
      centerPx,
      angleDeg: layer.transform.rotationDeg,
      widthPx,
      heightPx,
      ...(visual.colliderVerticesPx ? { colliderVerticesPx: visual.colliderVerticesPx } : {}),
      visual: {
        widthPx: visual.widthPx,
        heightPx: visual.heightPx,
        anchorX: layer.transform.anchorX,
        anchorY: layer.transform.anchorY,
        uniformScale: layer.transform.scaleX,
        ...(visual.centerOfMassLocalPx ? { centerOfMassLocalPx: visual.centerOfMassLocalPx } : {}),
      },
    }
  }

  private assertCommon(scene: ChronoScene, layer: Layer, authoring: RigidBodyAuthoring): void {
    if (layer.parentId || layer.instanceOf) throw new Error(`Rigid body ${layer.id} cannot use hierarchy or live instances yet`)
    if (layer.motionPath || layer.followPath) throw new Error(`Rigid body ${layer.id} cannot use a motion/follow path`)
    Object.entries(layer.transform).forEach(([field, value]) => assertFinite(value, `Rigid body ${layer.id} transform.${field}`))
    if (layer.transform.scaleX <= 0 || layer.transform.scaleY <= 0
      || Math.abs(layer.transform.scaleX - layer.transform.scaleY) > 1e-9) {
      throw new Error(`Rigid body ${layer.id} requires positive uniform scale`)
    }
    this.assertNoTransformWriter(scene, layer)
    assertMaterial(authoring, layer.id)
    assertFinite(authoring.initialVelocityPxPerSecond.x, `Rigid body ${layer.id} velocity x`)
    assertFinite(authoring.initialVelocityPxPerSecond.y, `Rigid body ${layer.id} velocity y`)
    assertFinite(authoring.initialAngularVelocityDegPerSecond, `Rigid body ${layer.id} angular velocity`)
  }

  private assertNoTransformWriter(scene: ChronoScene, layer: Layer): void {
    const prefix = `layers.${layer.id}.`
    const track = scene.timelines.flatMap(timeline => timeline.tracks).find(candidate => (
      candidate.target.startsWith(prefix) && TRANSFORM_PATHS.has(candidate.target.slice(prefix.length))
      && (candidate.keyframes.length > 0 || candidate.controller !== undefined)
    ))
    if (track) throw new Error(`Rigid body ${layer.id} transform is already animated: ${track.target}`)
    if (Object.keys(layer.propertyExpressions?.fields ?? {}).some(path => TRANSFORM_PATHS.has(path))) {
      throw new Error(`Rigid body ${layer.id} transform has a live expression`)
    }
    if (Object.keys(layer.paramBindings ?? {}).some(path => TRANSFORM_PATHS.has(path))) {
      throw new Error(`Rigid body ${layer.id} transform has a parameter binding`)
    }
    if (scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id
      && !!binding.target.property && TRANSFORM_PATHS.has(binding.target.property))) {
      throw new Error(`Rigid body ${layer.id} transform has a scene binding`)
    }
    if (scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id
      && TRANSFORM_PATHS.has(wire.target.propertyPath))) {
      throw new Error(`Rigid body ${layer.id} transform has an enabled parameter wire`)
    }
  }
}

/** Reports whether a layer can be offered by rectangular rigid-body pickers. */
export function isRigidRectangleLayerCandidate(layer: Layer): boolean {
  return isRectangleVisualLayer(layer) && !!layer.size
    && Number.isFinite(layer.size.width) && layer.size.width > 0
    && Number.isFinite(layer.size.height) && layer.size.height > 0
    && !layer.parentId && !layer.instanceOf
    && Number.isFinite(layer.transform.scaleX) && layer.transform.scaleX > 0
    && Number.isFinite(layer.transform.scaleY)
    && Math.abs(layer.transform.scaleX - layer.transform.scaleY) <= 1e-9
}

function isRectangleVisualLayer(layer: Layer): boolean {
  return (layer.type === 'shape' && (layer.shapeKind ?? layer.shape ?? 'rect') === 'rect')
    || (layer.type === 'image' && !!layer.image)
}

function assertMaterial(authoring: RigidBodyAuthoring, layerId: string): void {
  const material = authoring.material
  if (!material || !Number.isFinite(material.densityKgPerSquareMeter) || material.densityKgPerSquareMeter <= 0) {
    throw new RangeError(`Rigid body ${layerId} density must be positive and finite`)
  }
  for (const [field, value] of [['friction', material.friction], ['restitution', material.restitution]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`Rigid body ${layerId} ${field} must be between 0 and 1`)
  }
  if (!Number.isFinite(material.airFriction) || material.airFriction < 0 || material.airFriction >= 1) {
    throw new RangeError(`Rigid body ${layerId} air friction must be in [0, 1)`)
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`)
}
