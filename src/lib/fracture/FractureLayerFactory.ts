import type { ChronoScene, Layer } from '@/lib/types'
import type { FractureGeneration } from '@/lib/types/fracture'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import { visualTransformFromRigidPose } from '@/lib/physics/RigidVisualTransform'
import { FractureAppearanceCompiler } from './FractureAppearanceCompiler'

/**
 * Builds editable path or textured Mesh2D layers for one fracture generation.
 *
 * Fragment geometry retains source-local polygon coordinates. Solid sources
 * produce paths; image and Mesh2D sources produce clipped Mesh2D triangles
 * with preserved source UVs. Anchors move to the uniform-density centroid while the initial transform
 * is compensated, so assembled fragments exactly overlay the source before
 * activation and later rotate around their physical centre. Returned layers
 * own detached portable appearance data and no runtime solver references.
 */
export class FractureLayerFactory {
  private readonly appearanceCompiler = new FractureAppearanceCompiler()

  create(scene: Pick<ChronoScene, 'layers' | 'assets'>, generation: FractureGeneration, recipe: RigidBodyBakeRecipe): Layer[] {
    const source = scene.layers.find(layer => layer.id === generation.source.ownerId)
    if (!source) throw new Error(`Fracture source layer is missing: ${generation.source.ownerId}`)
    const appearanceSnapshot = recipe.fractureAppearance?.sourceLayerId === source.id
      ? recipe.fractureAppearance
      : this.appearanceCompiler.snapshot(scene, source)
    const event = recipe.fractureEvents?.find(candidate => candidate.id === `${generation.generationId}:event`)
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
      const appearance = this.appearanceCompiler.createFragmentAppearance(
        scene,
        source,
        generation,
        fragment,
        appearanceSnapshot,
      )
      return {
        id: fragment.id,
        name: `${source.name} · Fragment ${index + 1}`,
        mode: '2danimation',
        ...appearance,
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
        blendMode: source.blendMode,
        startMs: source.startMs,
        endMs: source.endMs,
      }
    })
  }
}
