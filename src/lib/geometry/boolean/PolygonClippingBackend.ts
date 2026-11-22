import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping'
import type { Vec2 } from '../CoordinateSystem'
import { M, L, Z } from '../PathCommand'
import { flattenClosedPath } from '../flattenClosedPath'
import { assertSimpleRing, ringArea, ringContacts, ringContains } from './rings'
import { BOOLEAN_LIMITS as limits, type BooleanRequest, type BooleanResult } from './types'

// The package's declarations expose named functions, while its ESM build has a
// default object. Default interop also preserves the CommonJS/browser build.
const { union, intersection, difference, xor } = polygonClipping

/** Pure synchronous planar solver adapter, intended for a dedicated worker.
 * polygon-clipping (MIT, Martinez/Rueda/Feito sweep) owns clipping; this adapter
 * owns admission, flattening, fill semantics and output conversion. No source
 * mutation, cache, browser objects or persistent vertex IDs. Geometry is in
 * composition px. See https://github.com/mfogel/polygon-clipping . */
export class PolygonClippingBackend {
  /** Compute a bounded area-only result. Inputs need simple explicitly closed
   * contours; touching edges BETWEEN operands are supported. Same-winding
   * nonzero rings may overlap. Mixed-winding nonzero rings must be nested or
   * disjoint: crossing/touching mixed contours refuse rather than invent holes.
   * Empty intersection/subtraction is a valid zero-command result. */
  compute(request: BooleanRequest): BooleanResult {
    if (!['union', 'subtract', 'intersect', 'xor'].includes(request.operation) || typeof request.reverse !== 'boolean') throw new Error('Invalid Boolean operation.')
    if (request.operands.length < 2 || request.operands.length > limits.operands) throw new Error(`Select 2–${limits.operands} Boolean inputs.`)
    let inputVertices = 0, ringCount = 0, commands = 0, contacts = 0
    const all: Vec2[][] = []
    const inputs = request.operands.map(operand => {
      commands += operand.path.commands.length
      if (commands > limits.commands) throw new Error('Boolean path-command budget exceeded.')
      if (!['nonzero', 'evenodd'].includes(operand.fillRule)) throw new Error('Invalid Boolean fill rule.')
      const rings = flattenClosedPath(operand.path, request.tolerancePx, limits.vertices - inputVertices, limits.rings - ringCount)
      inputVertices += rings.reduce((sum, ring) => sum + ring.length, 0); ringCount += rings.length
      for (const ring of rings) {
        assertSimpleRing(ring)
        for (const previous of all) {
          contacts += ringContacts(previous, ring)
          if (contacts > limits.intersections) throw new Error('Boolean intersection budget exceeded; simplify inputs.')
        }
        all.push(ring)
      }
      return filledPolygons(rings, operand.fillRule)
    })
    const [a, ...rest] = inputs
    let result: MultiPolygon
    if (request.operation === 'union') result = union(a, ...rest)
    else if (request.operation === 'intersect') result = intersection(a, ...rest)
    else if (request.operation === 'xor') result = xor(a, ...rest)
    else result = request.reverse ? difference(union(rest[0], ...rest.slice(1)), a) : difference(a, ...rest)
    const counts = outputCounts(result)
    return { path: { closed: result.length > 0, commands: result.flatMap(polygon => polygon.flatMap(ring => [M(...ring[0]), ...ring.slice(1, -1).map(p => L(...p)), Z()])) },
      inputVertices, outputVertices: counts.vertices, polygons: result.length, holes: counts.holes, tolerancePx: request.tolerancePx }
  }
}

/** Convert simple rings to the solver's outer/holes convention. evenodd is the
 * symmetric difference of contour interiors. Nonzero nesting accumulates signed
 * winding and emits only 0↔nonzero boundaries, so nested winding 2−1 remains
 * filled. Crossing opposite signs need a signed arrangement, deliberately not
 * approximated by positive-union minus negative-union. */
function filledPolygons(rings: Vec2[][], rule: 'evenodd' | 'nonzero'): MultiPolygon {
  const raw = rings.map(ring => [toRing(ring)])
  if (rule === 'evenodd') return checked(xor(raw[0], ...raw.slice(1)))
  const signs = rings.map(ring => Math.sign(ringArea(ring)))
  if (signs.every(sign => sign === signs[0])) return checked(union(raw[0], ...raw.slice(1)))
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) if (ringContacts(rings[i], rings[j])) throw new Error('Mixed-winding nonzero contours must be nested or disjoint; crossing/touching rings are unsupported.')
  const parents = rings.map((ring, i) => {
    let parent = -1, area = Infinity
    for (let j = 0; j < rings.length; j++) if (j !== i && Math.abs(ringArea(rings[j])) > Math.abs(ringArea(ring)) && ringContains(rings[j], ring[0])) {
      const candidate = Math.abs(ringArea(rings[j])); if (candidate < area) { parent = j; area = candidate }
    }
    return parent
  })
  const winding = (index: number): number => { let sum = 0; while (index !== -1) { sum += signs[index]; index = parents[index] } return sum }
  const polygons: MultiPolygon = []
  const owners = new Map<number, Ring[]>()
  for (let i = 0; i < rings.length; i++) if (winding(parents[i]) === 0 && winding(i) !== 0) {
    const polygon = [toRing(rings[i])]; polygons.push(polygon); owners.set(i, polygon)
  }
  for (let i = 0; i < rings.length; i++) if (winding(parents[i]) !== 0 && winding(i) === 0) {
    let parent = parents[i]; while (parent !== -1 && !owners.has(parent)) parent = parents[parent]
    if (parent === -1) throw new Error('Invalid winding containment.')
    owners.get(parent)!.push(toRing(rings[i]))
  }
  return polygons.length ? checked(union(polygons)) : []
}

/** Solver rings repeat the closing vertex; source rings intentionally do not. */
function toRing(ring: Vec2[]): Ring { return [...ring, ring[0]].map(p => [p.x, p.y]) }
/** Check every intermediate solver output before reusing/returning it. */
function checked(output: MultiPolygon): MultiPolygon { outputCounts(output); return output }
/** Admit only finite bounded output; no silent truncation or tiny-island drop. */
function outputCounts(output: MultiPolygon): { vertices: number; holes: number } {
  let vertices = 0, holes = 0
  for (const polygon of output) {
    holes += Math.max(0, polygon.length - 1)
    for (const ring of polygon) {
      vertices += ring.length - 1
      if (vertices > limits.outputVertices) throw new Error('Boolean output vertex budget exceeded.')
      for (const [x, y] of ring) if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Boolean solver returned nonfinite geometry.')
    }
  }
  return { vertices, holes }
}
