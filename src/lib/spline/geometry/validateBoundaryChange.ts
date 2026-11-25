import type { SplinePathData } from '../../types/spline'
import type { Matrix2D } from '../../geometry/Matrix2D'
import { Matrix2D as Matrix } from '../../geometry/Matrix2D'
import { subShapeData } from './elementPaths'
import { splineToPathDefinition } from '../splineToPath'
import { transformPathDefinition } from '../../geometry/transformPathDefinition'
import { flattenPathContours } from '../../geometry/flattenPathContours'
import { classifyPlanarBoundaries } from '../../geometry/planar/boundaries'

/** Compare affected Objects' complete boundary graphs, including holes. Curves
 * remain exact source; sampling at .01px is only a winding/contact diagnostic.
 * Bounded O(vertices²) validation; caller chooses interactive/worker budgets.
 * Same contour order, parents, material roles and winding signs are required.
 * Ambiguous input, crossings, collapse or budgets throw before source commit.
 * Coordinates are local px unless a caller supplies an explicit world matrix. */
export function validateSplineBoundaryChange(before: SplinePathData, after: SplinePathData, objectIds: readonly string[], options: {
  label: string; matrix?: Matrix2D; maxCommands: number; maxContours: number; maxVertices: number
}): void {
  let commands = 0, contours = 0, vertices = 0
  for (const id of Array.from(new Set(objectIds))) {
    const object = before.subShapes[id]
    if (!object || !after.subShapes[id] || object.contourIds.length !== after.subShapes[id].contourIds.length || object.contourIds.some((contour, index) => contour !== after.subShapes[id].contourIds[index])) throw new Error(`${options.label} must preserve Object/contour ownership.`)
    const snapshots = [before, after].map(data => {
      const path = transformPathDefinition(splineToPathDefinition(subShapeData(data, id)), options.matrix ?? Matrix.identity())
      commands += path.commands.length; contours += object.contourIds.length
      if (commands > options.maxCommands || contours > options.maxContours) throw new Error(`${options.label} boundary command/contour budget exceeded.`)
      const sampled = flattenPathContours(path, .01, options.maxVertices - vertices, options.maxContours, { label: options.label })
      vertices += sampled.reduce((sum, contour) => sum + contour.points.length, 0)
      return classifyPlanarBoundaries(sampled, data.fillRule)
    })
    const [a, b] = snapshots
    if (a.parents.some((parent, i) => parent !== b.parents[i] || a.roles[i] !== b.roles[i] || Math.sign(a.areas[i]) !== Math.sign(b.areas[i]))) throw new Error(`${options.label} changes hole ownership or collapses a boundary. Reduce the amount.`)
  }
}
