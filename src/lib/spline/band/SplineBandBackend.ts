import { PolygonClippingBackend } from '../../geometry/boolean/PolygonClippingBackend'
import { flattenPathContours } from '../../geometry/flattenPathContours'
import { classifyPlanarBoundaries } from '../../geometry/planar/boundaries'
import { splineToPathDefinition } from '../splineToPath'
import { subShapeData } from '../geometry/elementPaths'
import { assertSplineTopology } from '../topology/validation'
import { assertBandSettings, type SplineBandRequest, type SplineBandResult } from './types'
import { chainSampler, sampleBandChain } from './sampleChain'
import { bandDashIntervals } from './dashes'
import { densifyBandBoundary } from './densifyBoundary'
import { bandPieces } from './bandPieces'

/** Pure local-pixel band construction. Reuses canonical Bézier arc lookup,
 * offset joins and the existing planar Boolean solver. Inputs remain borrowed
 * and immutable; outputs are detached closed polygon boundaries with holes.
 * Generated piece/sample/output budgets and worker deadlines bound CPU work.
 * Self-crossing closed material masks refuse instead of inventing hole roles. */
export class SplineBandBackend {
  compute({ data, chains, settings: s }: SplineBandRequest): SplineBandResult {
    assertBandSettings(s); assertSplineTopology(data)
    if (!chains.length || chains.length > 32) throw new Error('Outline requires 1–32 selected chains.')
    const budget = { vertices: 0, lengthSamples: 0 }, result: SplineBandResult = { objects: [], inputVertices: 0, outputVertices: 0, bevelFallbacks: 0, tolerancePx: s.tolerancePx }
    const solver = new PolygonClippingBackend(), outputBudget = { vertices: 0 }
    for (const objectId of Array.from(new Set(chains.map(c => c.objectId)))) {
      const object = data.subShapes[objectId], targets = chains.filter(c => c.objectId === objectId)
      if (!object || targets.some(c => !object.contourIds.includes(c.contourId) || c.edgeIds.some(id => !data.contours[c.contourId].segmentIds.includes(id)))) throw new Error('Outline target no longer exists.')
      for (const chain of targets) {
        const edges = chain.edgeIds.map(id => data.segments[id]), contour = data.contours[chain.contourId]
        if (!edges.length || new Set(chain.edgeIds).size !== edges.length || edges.some((edge, i) => i > 0 && edges[i - 1].toPointId !== edge.fromPointId)
          || chain.closed && (!contour.closed || edges.length !== contour.segmentIds.length || edges.at(-1)!.toPointId !== edges[0].fromPointId)) throw new Error('Outline requires ordered connected source chains.')
      }
      const directional = s.alignment === 'inside' || s.alignment === 'outside'
      if (directional && targets.some(c => !c.closed)) throw new Error('Inside/Outside require complete closed contours. Use Center/Left/Right for open chains.')
      const boundaries = directional ? flattenPathContours(splineToPathDefinition(subShapeData(data, objectId)), s.tolerancePx / 4, 8192, 64, { label: 'Outline' }) : []
      const classified = directional ? classifyPlanarBoundaries(boundaries, data.fillRule) : null
      const pieces: { x: number; y: number }[][] = []
      for (const chain of targets) {
        let left = s.widthPx / 2, right = left
        if (s.alignment === 'left') { left = s.widthPx; right = 0 }
        if (s.alignment === 'right') { right = s.widthPx; left = 0 }
        if (classified) {
          const index = object.contourIds.indexOf(chain.contourId), role = classified.roles[index]
          if (!role) throw new Error('This contour is not a material boundary under the spline fill rule.')
          const outsideSign = Math.sign(classified.areas[index]) * role
          const positive = s.alignment === 'outside' ? outsideSign > 0 : outsideSign < 0
          left = positive ? s.widthPx : 0; right = positive ? 0 : s.widthPx
        }
        const sampler = chainSampler(data, chain, s, budget)
        for (const interval of bandDashIntervals(sampler.length, chain.closed, s.dashEnabled, s.dashArray, s.dashOffset)) {
          const points = sampleBandChain(sampler, interval.from, interval.to, interval.closed, s, budget)
          const distance = interval.from < 0 ? interval.from + sampler.length : interval.from
          const normal = sampler.normalAt(distance)
          if (points.length === 1) { points[0] = { x: points[0].x - normal.x * (left - right) / 2, y: points[0].y - normal.y * (left - right) / 2 } }
          const built = bandPieces(points, interval.closed, left, right, s, { x: normal.y, y: -normal.x })
          pieces.push(...built.pieces); result.bevelFallbacks += built.bevelFallbacks
        }
      }
      const clipped = solver.combineBand(pieces, directional ? { contours: boundaries.filter(c => c.closed).map(c => c.points), fillRule: data.fillRule, side: s.alignment as 'inside' | 'outside' } : undefined, s.tolerancePx / 4096)
      if (!clipped.path.commands.length) continue
      const contours = densifyBandBoundary(flattenPathContours(clipped.path, s.tolerancePx, 8192, 256, { requireClosed: true }), s.spacingPx, outputBudget)
      result.objects.push({ name: `${object.name || 'Spline'} Outline`, contours }); result.outputVertices = outputBudget.vertices
      if (result.outputVertices > 8192) throw new Error('Outline output vertex budget exceeded.')
    }
    result.inputVertices = budget.vertices
    if (!result.objects.length) throw new Error('Outline has no visible area. Change dash, cap or width settings.')
    return result
  }
}
