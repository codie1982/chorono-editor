import type { ChronoScene, Layer } from '@/lib/types'
import type { FractureRegionGeneration } from '@/lib/types/fracture'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import { visualTransformFromRigidPose } from '@/lib/physics/RigidVisualTransform'
import { FractureAppearanceCompiler } from './FractureAppearanceCompiler'

/**
 * Builds editable Mesh2D layers for one portable FRACTURE1 generation.
 *
 * Every connected component receives one layer and one compound rigid body.
 * Render triangle/UV topology comes from the manifest; appearance provenance
 * is rechecked before publication. Returned layers own detached portable data
 * and no solver or decoded-media handles.
 */
export class FractureRegionLayerFactory {
  constructor(private readonly appearanceCompiler = new FractureAppearanceCompiler()) {}

  create(
    scene: Pick<ChronoScene, 'layers' | 'assets'>,
    generation: FractureRegionGeneration,
    recipe: RigidBodyBakeRecipe,
  ): Layer[] {
    const source = scene.layers.find(layer => layer.id === generation.source.ownerId)
    if (!source) throw new Error(`Fracture region source layer is missing: ${generation.source.ownerId}`)
    const snapshot = recipe.fractureAppearance?.sourceLayerId === source.id
      ? recipe.fractureAppearance
      : this.appearanceCompiler.snapshot(scene, source)
    const event = recipe.fractureEvents?.find(candidate => candidate.id === `${generation.generationId}:event`)
    if (!event || event.fragmentBodyIds.length !== generation.fragments.length) {
      throw new Error('Fracture region recipe does not match its generation')
    }
    const bodyByLayer = new Map(recipe.bodies.map(body => [body.layerId, body]))
    return generation.fragments.map((fragment, index) => {
      const body = bodyByLayer.get(fragment.id)
      if (!body || body.bodyId !== event.fragmentBodyIds[index] || body.collider !== 'compoundPolygon') {
        throw new Error(`Fracture region body mapping is invalid: ${fragment.id}`)
      }
      const transform = visualTransformFromRigidPose(body, {
        centerX: body.centerPx.x,
        centerY: body.centerPx.y,
        angleDeg: body.angleDeg,
      })
      const appearance = this.appearanceCompiler.createRegionFragmentAppearance(
        scene,
        source,
        generation.generationId,
        fragment,
        snapshot,
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
