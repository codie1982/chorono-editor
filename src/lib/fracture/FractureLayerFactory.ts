import { pathFromPoints, type Layer } from '@/lib/types'
import type { FractureGeneration } from '@/lib/types/fracture'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import { visualTransformFromRigidPose } from '@/lib/physics/RigidVisualTransform'

/**
 * Builds editable path layers for one prepared fracture generation.
 *
 * Fragment paths retain source-local polygon coordinates. Their anchors move
 * to the uniform-density centroid while the initial transform is compensated,
 * so the assembled fragments exactly overlay the source before activation and
 * later rotate around their physical centre. Returned layers own cloned style
 * data and have no runtime solver references.
 */
export class FractureLayerFactory {
  create(sceneLayers: readonly Layer[], generation: FractureGeneration, recipe: RigidBodyBakeRecipe): Layer[] {
    const source = sceneLayers.find(layer => layer.id === generation.source.ownerId)
    if (!source) throw new Error(`Fracture source layer is missing: ${generation.source.ownerId}`)
    const event = recipe.fractureEvents?.[0]
    if (!event || event.fragmentBodyIds.length !== generation.fragments.length) {
      throw new Error('Fracture recipe does not match its generation')
    }
    const bodyByLayer = new Map(recipe.bodies.map(body => [body.layerId, body]))
    return generation.fragments.map((fragment, index) => {
      const body = bodyByLayer.get(fragment.id)
      if (!body || body.bodyId !== event.fragmentBodyIds[index] || body.collider !== 'convexPolygon') {
        throw new Error(`Fracture body mapping is invalid: ${fragment.id}`)
      }
      const transform = visualTransformFromRigidPose(body, {
        centerX: body.centerPx.x,
        centerY: body.centerPx.y,
        angleDeg: body.angleDeg,
      })
      return {
        id: fragment.id,
        name: `${source.name} · Fragment ${index + 1}`,
        mode: '2danimation',
        type: 'path',
        path: pathFromPoints(fragment.polygon.map(point => [point.x, point.y])),
        transform: {
          x: transform.x,
          y: transform.y,
          scaleX: body.visual.uniformScale,
          scaleY: body.visual.uniformScale,
          rotationDeg: transform.rotationDeg,
          anchorX: body.visual.anchorX,
          anchorY: body.visual.anchorY,
        },
        opacity: 1,
        style: source.style ? structuredClone(source.style) : undefined,
        blendMode: source.blendMode,
        startMs: source.startMs,
        endMs: source.endMs,
      }
    })
  }
}
