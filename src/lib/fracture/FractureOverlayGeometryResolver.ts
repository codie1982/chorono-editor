import type { OverrideMap } from '@/lib/evaluator'
import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'
import type { ChronoScene, Layer } from '@/lib/types'
import type { FractureGeneration, FracturePoint2D } from '@/lib/types/fracture'
import type { FractureRegionGeneration } from '@/lib/types/fracture'
import type { Mesh2DGeometry, Mesh2DTopology } from '@/lib/types/mesh2d'
import type { RigidBakeRecord, RigidBodySnapshot } from '@/lib/types/physics'
import { Mesh2DBoundaryRingExtractor, Mesh2DTopologyHasher } from '@/lib/geometry/mesh2d'
import { isRigidBodyVisibleAtTime } from '@/lib/physics/RigidPoseTrackCompiler'

export interface FractureOverlayPolygon {
  readonly id: string
  readonly points: readonly FracturePoint2D[]
  readonly centroid: FracturePoint2D
  /** Convex fan indices used only by the editor diagnostic overlay. */
  readonly triangleIndices: readonly number[]
}

export interface FractureOverlayFrame {
  readonly recordId: string
  readonly generationId: string
  readonly phase: 'source' | 'fragments'
  readonly eventTimeMs: number
  readonly eventTick: number
  readonly atEvent: boolean
  readonly fragments: readonly FractureOverlayPolygon[]
  /** Current visible source/fragment boundaries, excluding static colliders. */
  readonly renderPolygons: readonly FractureOverlayPolygon[]
  /** Actual active rigid-body colliders, excluding static environment bodies. */
  readonly dynamicColliderPolygons: readonly FractureOverlayPolygon[]
  /** Actual active dynamic and static rigid-body colliders. */
  readonly colliderPolygons: readonly FractureOverlayPolygon[]
}

const overlayRingExtractor = new Mesh2DBoundaryRingExtractor()
const overlayTopologyHasher = new Mesh2DTopologyHasher()

/**
 * Prepares renderer-independent world-space geometry for fracture diagnostics.
 *
 * Source-local Voronoi polygons use the source layer transform before the
 * topology event and each generated fragment layer transform afterwards. The
 * same evaluated override map as Canvas is consumed, so animated x/y/rotation,
 * parent transforms and authored scale stay aligned with the visible pixels.
 * The convex fan is deterministic and diagnostic only; it does not claim to
 * be the future appearance/UV fragment mesh contract. Missing legacy output
 * returns `null` rather than drawing an approximate or misleading overlay.
 */
export class FractureOverlayGeometryResolver {
  resolve(
    scene: ChronoScene,
    recordId: string | null,
    timeMs: number,
    overrides?: OverrideMap,
  ): FractureOverlayFrame | null {
    const record = resolveRecord(scene, recordId)
    const event = record?.recipe.fractureEvents?.[0]
    const generationId = record?.fractureGeneration?.generationId
    if (!record || !event || !generationId) return null
    const generation = scene.physics?.fractureGenerations?.find(item => item.generationId === generationId)
    const sourceLayer = scene.layers.find(layer => layer.id === generation?.source.ownerId)
    if (!generation || !sourceLayer) return null
    if (record.recipe.fractureHierarchy) {
      return resolveRecursiveFrame(scene, record, sourceLayer, timeMs, overrides)
    }
    if (generation.schemaVersion === 2) {
      return resolveRegionFrame(scene, record, event, generation, sourceLayer, timeMs, overrides)
    }

    const eventTimeMs = record.recipe.startTimeMs + event.timeMs
    const phase = timeMs < eventTimeMs ? 'source' : 'fragments'
    const layerById = new Map(scene.layers.map(layer => [layer.id, layer]))
    const resolveMatrix = createLayerWorldMatrixResolver(scene, timeMs, overrides)
    const bodyByLayer = new Map(record.recipe.bodies.map(body => [body.layerId, body]))
    const bodyById = new Map(record.recipe.bodies.map(body => [body.bodyId, body]))
    const fragments: FractureOverlayPolygon[] = []

    for (const fragment of generation.fragments) {
      const layer = phase === 'source' ? sourceLayer : layerById.get(fragment.id)
      if (!layer) return null
      const matrix = resolveMatrix(layer)
      fragments.push({
        id: fragment.id,
        points: fragment.polygon.map(point => matrix.applyToPoint(point)),
        centroid: matrix.applyToPoint(fragment.centroidPx),
        triangleIndices: convexFan(fragment.polygon.length),
      })
    }

    const renderPolygons = phase === 'source'
      ? [polygonFromPoints(sourceLayer.id, generation.source.polygon, sourceLayer, resolveMatrix)]
      : generation.fragments.flatMap(fragment => {
        const layer = layerById.get(fragment.id)
        const polygon = layer && renderPolygonFromLayer(layer, fragment, resolveMatrix)
        return polygon ? [polygon] : []
      })
    const activeDynamicBodies = phase === 'source'
      ? [bodyById.get(event.sourceBodyId)].filter((body): body is RigidBodySnapshot => !!body)
      : event.fragmentBodyIds.map(bodyId => bodyById.get(bodyId)).filter((body): body is RigidBodySnapshot => !!body)
    const dynamicColliderPolygons = activeDynamicBodies.flatMap(body => {
      const layer = layerById.get(body.layerId)
      const polygon = layer && bodyColliderPolygon(body, layer, resolveMatrix)
      return polygon ? [polygon] : []
    })
    const colliderPolygons = [...dynamicColliderPolygons]
    for (const body of record.recipe.bodies) {
      if (body.motionType !== 'static') continue
      const layer = layerById.get(body.layerId)
      const polygon = layer && bodyColliderPolygon(body, layer, resolveMatrix)
      if (polygon) colliderPolygons.push(polygon)
    }

    return {
      recordId: record.id,
      generationId,
      phase,
      eventTimeMs,
      eventTick: event.tick,
      atEvent: Math.abs(timeMs - eventTimeMs) <= 1e-6,
      fragments,
      renderPolygons,
      dynamicColliderPolygons,
      colliderPolygons,
    }
  }
}

/** Resolve the mixed active root/child topology after a recursive event. */
function resolveRecursiveFrame(
  scene: ChronoScene,
  record: RigidBakeRecord,
  sourceLayer: Layer,
  timeMs: number,
  overrides?: OverrideMap,
): FractureOverlayFrame | null {
  const hierarchy = record.recipe.fractureHierarchy
  const events = record.recipe.fractureEvents ?? []
  const rootEvent = events[0]
  if (!hierarchy || !rootEvent) return null
  const generationById = new Map((scene.physics?.fractureGenerations ?? [])
    .filter((item): item is FractureGeneration => item.schemaVersion === 1)
    .map(item => [item.generationId, item]))
  const generations = hierarchy.entries.map(entry => generationById.get(entry.generationId))
  if (generations.some(generation => !generation)) return null
  const fragments = generations.flatMap(generation => generation!.fragments)
  const fragmentById = new Map(fragments.map(fragment => [fragment.id, fragment]))
  const layerById = new Map(scene.layers.map(layer => [layer.id, layer]))
  const resolveMatrix = createLayerWorldMatrixResolver(scene, timeMs, overrides)
  const rootTimeMs = record.recipe.startTimeMs + rootEvent.timeMs
  const phase = timeMs < rootTimeMs ? 'source' as const : 'fragments' as const
  const localTimeMs = timeMs - record.recipe.startTimeMs
  const activeBodies = record.recipe.bodies.filter(body => body.motionType === 'dynamic'
    && isRigidBodyVisibleAtTime(record.recipe, body.bodyId, localTimeMs))

  const activeFragments = phase === 'source'
    ? generations[0]!.fragments.map(fragment => ({ fragment, layer: sourceLayer }))
    : activeBodies.flatMap(body => {
      const fragment = fragmentById.get(body.layerId)
      const layer = layerById.get(body.layerId)
      return fragment && layer ? [{ fragment, layer }] : []
    })
  const diagnosticFragments = activeFragments.map(({ fragment, layer }) => {
    const matrix = resolveMatrix(layer)
    return {
      id: fragment.id,
      points: fragment.polygon.map(point => matrix.applyToPoint(point)),
      centroid: matrix.applyToPoint(fragment.centroidPx),
      triangleIndices: convexFan(fragment.polygon.length),
    }
  })
  const renderPolygons = phase === 'source'
    ? [polygonFromPoints(sourceLayer.id, generations[0]!.source.polygon, sourceLayer, resolveMatrix)]
    : activeFragments.flatMap(({ fragment, layer }) => {
      const polygon = renderPolygonFromLayer(layer, fragment, resolveMatrix)
      return polygon ? [polygon] : []
    })
  const dynamicColliderPolygons = activeBodies.flatMap(body => {
    const layer = layerById.get(body.layerId)
    return layer ? bodyColliderPolygons(body, layer, resolveMatrix) : []
  })
  const colliderPolygons = [...dynamicColliderPolygons]
  record.recipe.bodies.filter(body => body.motionType === 'static').forEach(body => {
    const layer = layerById.get(body.layerId)
    if (layer) colliderPolygons.push(...bodyColliderPolygons(body, layer, resolveMatrix))
  })
  const latestEvent = [...events].reverse().find(event => localTimeMs + 1e-7 >= event.timeMs) ?? rootEvent
  const latestGenerationId = latestEvent.id.replace(/:event$/, '')
  const eventTimeMs = record.recipe.startTimeMs + latestEvent.timeMs
  return {
    recordId: record.id,
    generationId: latestGenerationId,
    phase,
    eventTimeMs,
    eventTick: latestEvent.tick,
    atEvent: Math.abs(timeMs - eventTimeMs) <= 1e-6,
    fragments: diagnosticFragments,
    renderPolygons,
    dynamicColliderPolygons,
    colliderPolygons,
  }
}

/** Resolve FRACTURE1 render rings and actual compound collider union rings. */
function resolveRegionFrame(
  scene: ChronoScene,
  record: RigidBakeRecord,
  event: NonNullable<RigidBakeRecord['recipe']['fractureEvents']>[number],
  generation: FractureRegionGeneration,
  sourceLayer: Layer,
  timeMs: number,
  overrides?: OverrideMap,
): FractureOverlayFrame | null {
  const eventTimeMs = record.recipe.startTimeMs + event.timeMs
  const phase = timeMs < eventTimeMs ? 'source' : 'fragments'
  const layerById = new Map(scene.layers.map(layer => [layer.id, layer]))
  const bodyById = new Map(record.recipe.bodies.map(body => [body.bodyId, body]))
  const resolveMatrix = createLayerWorldMatrixResolver(scene, timeMs, overrides)
  const fragments = generation.fragments.flatMap(fragment => {
    const layer = phase === 'source' ? sourceLayer : layerById.get(fragment.id)
    if (!layer) return []
    return polygonsFromRings(fragment.id, fragment.boundaryRings, layer, resolveMatrix)
  })
  if (!fragments.length) return null

  const renderPolygons = phase === 'source'
    ? polygonsFromRings(sourceLayer.id, generation.source.rings, sourceLayer, resolveMatrix)
    : generation.fragments.flatMap(fragment => {
      const layer = layerById.get(fragment.id)
      if (!layer || layer.type !== 'mesh2d' || !layer.mesh2d) return []
      const rings = meshBoundaryRings(layer.mesh2d.geometry)
      return rings ? polygonsFromRings(fragment.id, rings, layer, resolveMatrix) : []
    })
  const activeBodies = phase === 'source'
    ? [bodyById.get(event.sourceBodyId)].filter((body): body is RigidBodySnapshot => !!body)
    : event.fragmentBodyIds.map(id => bodyById.get(id)).filter((body): body is RigidBodySnapshot => !!body)
  const dynamicColliderPolygons = activeBodies.flatMap(body => {
    const layer = layerById.get(body.layerId)
    return layer ? bodyColliderPolygons(body, layer, resolveMatrix) : []
  })
  const colliderPolygons = [...dynamicColliderPolygons]
  record.recipe.bodies.filter(body => body.motionType === 'static').forEach(body => {
    const layer = layerById.get(body.layerId)
    if (layer) colliderPolygons.push(...bodyColliderPolygons(body, layer, resolveMatrix))
  })
  if (renderPolygons.length !== dynamicColliderPolygons.length) return null
  return {
    recordId: record.id,
    generationId: generation.generationId,
    phase,
    eventTimeMs,
    eventTick: event.tick,
    atEvent: Math.abs(timeMs - eventTimeMs) <= 1e-6,
    fragments,
    renderPolygons,
    dynamicColliderPolygons,
    colliderPolygons,
  }
}

function polygonsFromRings(
  ownerId: string,
  rings: readonly { readonly points: readonly FracturePoint2D[] }[],
  layer: Layer,
  resolveMatrix: ReturnType<typeof createLayerWorldMatrixResolver>,
): FractureOverlayPolygon[] {
  const matrix = resolveMatrix(layer)
  return rings.map((ring, ringIndex) => {
    const points = ring.points.map(point => matrix.applyToPoint(point))
    const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
    return {
      id: `${ownerId}:ring-${ringIndex}`,
      points,
      centroid: { x: centroid.x / points.length, y: centroid.y / points.length },
      triangleIndices: convexFan(points.length),
    }
  })
}

/** Select the requested fracture record or the newest renderable one. */
function resolveRecord(scene: ChronoScene, recordId: string | null): RigidBakeRecord | undefined {
  const records = scene.physics?.rigidBakes ?? []
  const requested = recordId ? records.find(record => record.id === recordId) : undefined
  if (requested?.recipe.fractureEvents?.length && requested.fractureGeneration) return requested
  return [...records].reverse().find(record => record.recipe.fractureEvents?.length && record.fractureGeneration)
}

/** Build a stable 0,i,i+1 fan for one validated convex polygon. */
function convexFan(vertexCount: number): number[] {
  const indices: number[] = []
  for (let index = 1; index < vertexCount - 1; index++) indices.push(0, index, index + 1)
  return indices
}

/** Transform one source-local polygon through the exact Canvas world matrix. */
function polygonFromPoints(
  id: string,
  points: readonly FracturePoint2D[],
  layer: Layer,
  resolveMatrix: ReturnType<typeof createLayerWorldMatrixResolver>,
): FractureOverlayPolygon {
  const matrix = resolveMatrix(layer)
  const transformed = points.map(point => matrix.applyToPoint(point))
  const centroid = transformed.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
  return {
    id,
    points: transformed,
    centroid: { x: centroid.x / transformed.length, y: centroid.y / transformed.length },
    triangleIndices: convexFan(points.length),
  }
}

/**
 * Resolve an actual compiled collider through the current visual transform.
 *
 * Collider vertices are stored in composition pixels around the body centre,
 * while layer geometry remains in unscaled local pixels. Dividing by the
 * compiled uniform scale before applying the layer matrix avoids scaling the
 * rigid vertices twice. The current first slice has root uniform-scale bodies;
 * unsupported zero-scale legacy snapshots return `null`.
 */
function bodyColliderPolygon(
  body: RigidBodySnapshot,
  layer: Layer,
  resolveMatrix: ReturnType<typeof createLayerWorldMatrixResolver>,
): FractureOverlayPolygon | null {
  const scale = body.visual.uniformScale
  if (!Number.isFinite(scale) || scale <= 0) return null
  const center = body.visual.centerOfMassLocalPx ?? {
    x: body.visual.widthPx / 2,
    y: body.visual.heightPx / 2,
  }
  const localPoints = body.collider === 'convexPolygon'
    ? body.colliderVerticesPx?.map(point => ({
      x: center.x + point.x / scale,
      y: center.y + point.y / scale,
    }))
    : rectangleAround(center, body.widthPx / scale, body.heightPx / scale)
  if (!localPoints || localPoints.length < 3) return null
  const matrix = resolveMatrix(layer)
  return {
    id: `${body.layerId}:collider`,
    points: localPoints.map(point => matrix.applyToPoint(point)),
    centroid: matrix.applyToPoint(center),
    triangleIndices: convexFan(localPoints.length),
  }
}

/** Resolve one or more union boundary rings from a compiled rigid collider. */
function bodyColliderPolygons(
  body: RigidBodySnapshot,
  layer: Layer,
  resolveMatrix: ReturnType<typeof createLayerWorldMatrixResolver>,
): FractureOverlayPolygon[] {
  if (body.collider !== 'compoundPolygon') {
    const polygon = bodyColliderPolygon(body, layer, resolveMatrix)
    return polygon ? [{ ...polygon, id: `${body.layerId}:ring-0:collider` }] : []
  }
  const scale = body.visual.uniformScale
  if (!Number.isFinite(scale) || scale <= 0 || !body.colliderPartsPx?.length) return []
  const center = body.visual.centerOfMassLocalPx ?? {
    x: body.visual.widthPx / 2,
    y: body.visual.heightPx / 2,
  }
  const parts = body.colliderPartsPx.map(part => part.map(point => ({
    x: center.x + point.x / scale,
    y: center.y + point.y / scale,
  })))
  const rings = boundaryRingsFromParts(parts)
  if (!rings) return []
  return polygonsFromRings(body.layerId, rings, layer, resolveMatrix).map(polygon => ({
    ...polygon,
    id: `${polygon.id}:collider`,
  }))
}

/** Read the generated fragment's current render boundary when it is explicit. */
function renderPolygonFromLayer(
  layer: Layer,
  fragment: { readonly id: string; readonly polygon: readonly FracturePoint2D[]; readonly centroidPx: FracturePoint2D },
  resolveMatrix: ReturnType<typeof createLayerWorldMatrixResolver>,
): FractureOverlayPolygon | null {
  let localPoints: FracturePoint2D[] | undefined
  if (layer.type === 'path' && layer.path?.closed && layer.path.anchors.length >= 3
    && layer.path.anchors.every(anchor => hasStraightHandles(anchor))) {
    localPoints = layer.path.anchors.map(anchor => ({ x: anchor.x, y: anchor.y }))
  } else if (layer.type === 'mesh2d' && layer.mesh2d?.source.kind === 'fractureFragment') {
    localPoints = meshBoundaryPoints(layer.mesh2d.geometry)
  }
  if (!localPoints) return null
  const matrix = resolveMatrix(layer)
  return {
    id: fragment.id,
    points: localPoints.map(point => matrix.applyToPoint(point)),
    centroid: matrix.applyToPoint(fragment.centroidPx),
    triangleIndices: convexFan(localPoints.length),
  }
}

/**
 * Reconstructs one geometric boundary from fixed-topology Mesh2D triangles.
 *
 * Edge ownership is keyed by quantized positions rather than vertex indices so
 * deliberate UV seams with duplicated vertices still cancel as internal
 * edges. Multiple rings, branches and T-junctions return unavailable instead
 * of presenting a misleading collider comparison.
 */
function meshBoundaryPoints(geometry: Mesh2DGeometry): FracturePoint2D[] | undefined {
  const points = new Map<string, FracturePoint2D>()
  const edges = new Map<string, { readonly a: string; readonly b: string; count: number }>()
  const indices = geometry.topology.triangleIndices
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const triangle = indices.slice(offset, offset + 3)
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
      const aIndex = triangle[edgeIndex], bIndex = triangle[(edgeIndex + 1) % 3]
      const a = { x: geometry.positions[aIndex * 2], y: geometry.positions[aIndex * 2 + 1] }
      const b = { x: geometry.positions[bIndex * 2], y: geometry.positions[bIndex * 2 + 1] }
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return undefined
      const aKey = meshPointKey(a), bKey = meshPointKey(b)
      if (aKey === bKey) continue
      points.set(aKey, a); points.set(bKey, b)
      const edgeKey = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
      const current = edges.get(edgeKey)
      if (current) current.count++
      else edges.set(edgeKey, { a: aKey, b: bKey, count: 1 })
    }
  }
  const boundary = Array.from(edges.values()).filter(edge => edge.count === 1)
  if (boundary.length < 3) return undefined
  const neighbors = new Map<string, string[]>()
  boundary.forEach(edge => {
    neighbors.set(edge.a, [...(neighbors.get(edge.a) ?? []), edge.b])
    neighbors.set(edge.b, [...(neighbors.get(edge.b) ?? []), edge.a])
  })
  if (Array.from(neighbors.values()).some(items => items.length !== 2)) return undefined
  const start = Array.from(neighbors.keys()).sort()[0]
  const loop = [start]
  let previous = ''
  let current = start
  while (loop.length <= boundary.length) {
    const next = neighbors.get(current)!.filter(key => key !== previous).sort()[0]
    if (next === start) break
    if (!next || loop.includes(next)) return undefined
    loop.push(next)
    previous = current
    current = next
  }
  if (loop.length !== boundary.length) return undefined
  return loop.map(key => points.get(key)!)
}

/** Weld UV-seam vertices by position and extract every actual render ring. */
function meshBoundaryRings(
  geometry: Mesh2DGeometry,
): readonly { readonly points: readonly FracturePoint2D[] }[] | undefined {
  const welded = weldedGeometry(geometry.positions, geometry.topology.triangleIndices)
  if (!welded) return undefined
  try {
    return overlayRingExtractor.extract(welded).map(ring => ({ points: ring.points }))
  } catch {
    return undefined
  }
}

function boundaryRingsFromParts(
  parts: readonly (readonly FracturePoint2D[])[],
): readonly { readonly points: readonly FracturePoint2D[] }[] | undefined {
  const positions: number[] = []
  const triangleIndices: number[] = []
  parts.forEach(part => {
    const base = positions.length / 2
    part.forEach(point => positions.push(point.x, point.y))
    for (let index = 1; index < part.length - 1; index++) {
      triangleIndices.push(base, base + index, base + index + 1)
    }
  })
  const geometry = weldedGeometry(positions, triangleIndices)
  if (!geometry) return undefined
  try {
    return overlayRingExtractor.extract(geometry).map(ring => ({ points: ring.points }))
  } catch {
    return undefined
  }
}

function weldedGeometry(
  sourcePositions: readonly number[],
  sourceIndices: readonly number[],
): Mesh2DGeometry | undefined {
  const positions: number[] = []
  const uvs: number[] = []
  const vertexIds: string[] = []
  const triangleIndices: number[] = []
  const weldedByPoint = new Map<string, number>()
  for (const sourceIndex of sourceIndices) {
    const point = { x: sourcePositions[sourceIndex * 2], y: sourcePositions[sourceIndex * 2 + 1] }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined
    const key = meshPointKey(point)
    let index = weldedByPoint.get(key)
    if (index === undefined) {
      index = positions.length / 2
      weldedByPoint.set(key, index)
      positions.push(point.x, point.y)
      uvs.push(0, 0)
      vertexIds.push(`overlay:${index}`)
    }
    triangleIndices.push(index)
  }
  const withoutHash: Omit<Mesh2DTopology, 'topologyHash'> = { schemaVersion: 1, vertexIds, triangleIndices }
  return {
    positions,
    uvs,
    topology: { ...withoutHash, topologyHash: overlayTopologyHasher.hash(withoutHash) },
  }
}

function meshPointKey(point: FracturePoint2D): string {
  return `${Math.round(point.x * 1e7)},${Math.round(point.y * 1e7)}`
}

function hasStraightHandles(anchor: NonNullable<Layer['path']>['anchors'][number]): boolean {
  return (anchor.inX === undefined || (anchor.inX === anchor.x && anchor.inY === anchor.y))
    && (anchor.outX === undefined || (anchor.outX === anchor.x && anchor.outY === anchor.y))
}

function rectangleAround(center: FracturePoint2D, width: number, height: number): FracturePoint2D[] {
  const halfWidth = width / 2, halfHeight = height / 2
  return [
    { x: center.x - halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ]
}
