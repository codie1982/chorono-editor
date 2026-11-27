import type { Layer } from '../../types'
import type { SplinePathData } from '../../types/spline'
import type { ConversionSource, GeometryConversionData } from '../../types/geometryConversion'
import { ShapeToSplineConverter, pathDefinitionToSpline } from './ShapeToSplineConverter'
import { splineToPathDefinition } from '../../spline/splineToPath'
import { assertSplineTopology } from '../../spline/topology'
import { Matrix2D } from '../Matrix2D'
import { transformPathDefinition } from '../transformPathDefinition'
import { PolygonClippingBackend } from '../boolean/PolygonClippingBackend'
import { flattenPathContours } from '../flattenPathContours'
import { classifyPlanarBoundaries } from '../planar/boundaries'
import { SplineToMeshConverter } from './SplineToMeshConverter'
import { geometryConversionPaint } from '../../paint/geometryConversionPaint'

/** Stateless representation conversion. Reuses primitive curves, the Boolean
 * union backend, robust planar classification and validated Earcut topology.
 * Geometry remains result-local; neither input records nor layer placement are
 * mutated. Multiple inputs are filled-area union, using the result's paint.
 * Only authored spline controls and one portable mesh enter scene history. */
export class GeometryConversionService {
  /** Solve sources in their captured result-local space. Single curves remain
   * Bézier; only multi-input area clipping samples curves at fixed local pixels.
   * Holes belong to their surrounding element, disjoint islands get separate
   * SubShapes. Invalid/contacting boundaries reject instead of applying a hull. */
  boundary(recipe: GeometryConversionData): SplinePathData {
    assertConversionRecipe(recipe)
    const operands = recipe.sources.map(source => {
      const spline = source.type === 'shape'
        ? new ShapeToSplineConverter().convert({ kind: source.shapeKind ?? source.shape ?? 'rect',
          size: source.size!, params: source.shapeParams, cornerRadius: source.cornerRadius })
        : source.spline!
      assertSplineTopology(spline)
      return { path: transformPathDefinition(splineToPathDefinition(spline), new Matrix2D(...source.matrix)),
        fillRule: spline.fillRule, label: source.name }
    })
    const path = operands.length === 1 ? operands[0].path : new PolygonClippingBackend().compute({
      operation: 'union', reverse: false, tolerancePx: recipe.unionTolerancePx, operands,
    }).path
    const spline = pathDefinitionToSpline(path, operands.length === 1 ? operands[0].fillRule : 'nonzero')
    return separateSplineElements(spline, recipe.unionTolerancePx)
  }

  /** Materialize the selected stack prefix. Stable layer ID, transform,
   * lifetime and parent are preserved; representation entry applies contour/
   * surface paint defaults. Mesh has a local self-source ID, no
   * hidden intermediate layer. Changing topology clears old pins/deformation;
   * callers must reject rebuilds with such attachments before reaching here. */
  apply(layer: Layer, recipe: GeometryConversionData): Layer {
    assertConversionRecipe(recipe)
    let spline = this.boundary(recipe)
    const splineStage = recipe.stages.find(stage => stage.kind === 'convertSpline')
    if (splineStage?.kind === 'convertSpline' && splineStage.edited) {
      assertSplineTopology(splineStage.edited); spline = splineStage.edited
    }
    const mesh = recipe.stages.find(stage => stage.kind === 'convertMesh2d')
    const { shape: _shape, shapeKind: _kind, shapeParams: _params, path: _path, mesh2d: _mesh, modifierStack: _stack, ...rest } = layer
    const kind = !recipe.stages.length && recipe.sources.length === 1 && recipe.sources[0].type === 'shape'
      ? 'shape' : mesh ? 'mesh2d' : 'spline'
    const paint = geometryConversionPaint(layer.style, layer.type, kind)
    const style = paint ? { ...paint, cornerRadius: undefined } : undefined
    if (!recipe.stages.length && recipe.sources.length === 1 && recipe.sources[0].type === 'shape') {
      const source = recipe.sources[0]
      return { ...rest, type: 'shape', spline: undefined, geometryConversion: undefined,
        shape: source.shape, shapeKind: source.shapeKind, shapeParams: source.shapeParams,
        size: source.size, style: { ...style, cornerRadius: source.cornerRadius } }
    }
    if (mesh?.kind === 'convertMesh2d') {
      const mesh2d = new SplineToMeshConverter().convert(layer.id, spline, mesh.tolerancePx)
      return { ...rest, type: 'mesh2d', spline: undefined, style, mesh2d, geometryConversion: recipe }
    }
    return { ...rest, type: 'spline', spline, style, geometryConversion: recipe }
  }
}

/** Validate bounded source/stage schema without trusting serialized types.
 * Stages have one valid order: editable Spline, then optional Mesh2D. Unknown
 * versions/kinds/order fail explicitly; no arbitrary modifier reordering. */
export function assertConversionRecipe(recipe: GeometryConversionData): void {
  if (!recipe || recipe.version !== 1 || !Array.isArray(recipe.sources) || !recipe.sources.length || recipe.sources.length > 8
    || !Array.isArray(recipe.stages) || recipe.stages.length > 2
    || !Number.isFinite(recipe.unionTolerancePx) || recipe.unionTolerancePx < .01 || recipe.unionTolerancePx > 10)
    throw new Error('Invalid geometry conversion recipe v1.')
  const ids = new Set<string>()
  recipe.stages.forEach((stage, i) => {
    if (!stage || typeof stage.id !== 'string' || !stage.id || ids.has(stage.id)
      || stage.kind !== (i === 0 ? 'convertSpline' : 'convertMesh2d')
      || stage.kind === 'convertMesh2d' && (!Number.isFinite(stage.tolerancePx) || stage.tolerancePx < .01 || stage.tolerancePx > 10))
      throw new Error('Conversion stages must be Spline → 2D Mesh with tolerance 0.01–10 local px.')
    ids.add(stage.id)
    if (stage.kind === 'convertSpline' && stage.edited) assertSplineTopology(stage.edited)
  })
  recipe.sources.forEach((source: ConversionSource) => {
    if (!source || !['shape', 'spline'].includes(source.type) || !Array.isArray(source.matrix) || source.matrix.length !== 6
      || source.matrix.some(n => !Number.isFinite(n)) || Math.abs(source.matrix[0] * source.matrix[3] - source.matrix[1] * source.matrix[2]) < 1e-9
      || source.type === 'shape' && (!source.size || ![source.size.width, source.size.height].every(n => Number.isFinite(n) && n > 0))
      || source.type === 'spline' && !source.spline) throw new Error('Invalid conversion source geometry or singular transform.')
    if (source.type === 'spline') assertSplineTopology(source.spline!)
  })
}

/** Classify sampled boundaries with the Boolean domain's robust predicates,
 * but retain original C/Q controls in the returned editable spline. Each outer
 * loop owns its holes; islands inside holes are independent elements. */
export function separateSplineElements(spline: SplinePathData, tolerance: number): SplinePathData {
  const ids = Object.keys(spline.contours)
  const paths = ids.map(id => splineToPathDefinition({ ...spline, subShapes: {
    only: { id: 'only', name: '', kind: 'custom', source: 'edited', editable: true, combineMode: 'none', contourIds: [id] },
  } }))
  const contours = paths.flatMap(path => flattenPathContours(path, tolerance, 8192, 64, { label: 'Conversion' }))
  if (contours.length > 64 || contours.reduce((sum, contour) => sum + contour.points.length, 0) > 8192) throw new Error('Conversion boundary budget exceeded.')
  if (contours.length !== ids.length) throw new Error('Conversion contour mapping failed.')
  const { roles, parents } = classifyPlanarBoundaries(contours, spline.fillRule)
  const subShapes: SplinePathData['subShapes'] = {}
  ids.forEach((id, i) => {
    if (contours[i].closed && roles[i] !== 1) return
    const key = `conversion_element_${i}`
    subShapes[key] = { id: key, name: `Element ${Object.keys(subShapes).length + 1}`, kind: 'custom',
      source: 'edited', editable: true, combineMode: 'none', contourIds: [id] }
    ids.forEach((hole, j) => { if (roles[j] === -1 && parents[j] === i) subShapes[key].contourIds.push(hole) })
  })
  // Redundant nonzero boundaries are geometrically filled already. Retain them
  // with their enclosing element rather than losing authored control records.
  ids.forEach((id, i) => {
    if (!contours[i].closed || roles[i] !== 0) return
    const owner = Object.values(subShapes).find(sub => sub.contourIds.includes(ids[parents[i]]))
    if (!owner) throw new Error('Conversion has an unowned redundant boundary.')
    owner.contourIds.push(id)
  })
  return { ...spline, subShapes }
}
