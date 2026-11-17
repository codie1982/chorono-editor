import { flattenPathContours } from '../../geometry/flattenPathContours'
import { parallelPolyline } from './parallelPolyline'
import { outlineBoundaries } from './boundaries'
import { OUTLINE_LIMITS as limits, assertOutlineSettings, type OutlineRequest, type OutlineResult } from './types'

/** Pure bounded parallel-contour solver for a dedicated worker. Reuses adaptive
 * path subdivision and robust planar predicates. Keeps open ends open; closed
 * material boundaries retain winding/hole ownership. Ambiguous intersections,
 * collapses and exhausted quality/budgets reject the entire operation. No IDs,
 * scene mutations, cache or renderer handles. All distances are composition px. */
export class PlanarOutlineBackend {
  /** Validate the complete request, sample source curves and return privately
   * owned polylines. Any invalid contour fails the whole job with a diagnostic. */
  compute(request: OutlineRequest): OutlineResult {
    assertOutlineSettings(request)
    if (!request.inputs.length || request.inputs.length > limits.objects) throw new Error('Offset supports 1–8 source Objects per preview.')
    let commands = 0, inputVertices = 0, outputVertices = 0, contourCount = 0, bevelFallbacks = 0
    const objects: OutlineResult['objects'] = []
    for (const input of request.inputs) {
      if (!['nonzero', 'evenodd'].includes(input.fillRule)) throw new Error('Invalid Offset fill rule.')
      commands += input.path.commands.length
      if (commands > limits.commands) throw new Error('Offset command budget exceeded.')
      let previous: { x: number; y: number } | undefined
      for (const command of input.path.commands) {
        if (command.type === 'L' && previous?.x === command.x && previous?.y === command.y) throw new Error('Offset source contains a zero-length edge.')
        previous = command.type === 'Z' ? undefined : command
      }
      const contours = flattenPathContours(input.path, request.tolerancePx / 4, limits.inputVertices - inputVertices, limits.contours - contourCount, { normalDistance: request.distancePx, label: 'Offset' })
      inputVertices += contours.reduce((n, c) => n + c.points.length, 0); contourCount += contours.length
      const before = outlineBoundaries(contours, input.fillRule), selected = Array.from(new Set(input.indices))
      if (!selected.length || selected.some(i => !Number.isSafeInteger(i) || !contours[i])) throw new Error('Offset contour selection is invalid.')
      const closed = contours[selected[0]].closed
      if (selected.some(i => contours[i].closed !== closed)) throw new Error('Select either open or closed contours for one Offset.')
      if (closed !== ['inside', 'outside'].includes(request.side)) throw new Error(closed ? 'Closed contours use Inside or Outside.' : 'Open contours use Left, Right or Both.')
      for (const side of request.side === 'both' ? ['left', 'right'] : [request.side]) {
        const replacements = new Map<number, typeof contours[number]>()
        for (const i of selected) {
          if (closed && !before.roles[i]) throw new Error('A redundant nonzero contour is not a material boundary. Select an unambiguous boundary.')
          const direction = closed ? Math.sign(before.areas[i]) * before.roles[i] * (side === 'inside' ? -1 : 1) : side === 'left' ? 1 : -1
          const output = parallelPolyline(contours[i], request.distancePx * direction, request)
          replacements.set(i, output.contour); bevelFallbacks += output.bevelFallbacks
          outputVertices += output.contour.points.length
          if (outputVertices > limits.outputVertices) throw new Error('Offset output vertex budget exceeded.')
        }
        // Unselected sibling boundaries still constrain the hole topology.
        const after = outlineBoundaries(contours.map((c, i) => replacements.get(i) ?? c), input.fillRule)
        if (selected.some(i => after.parents[i] !== before.parents[i] || after.roles[i] !== before.roles[i] || Math.sign(after.areas[i]) !== Math.sign(before.areas[i]))) throw new Error('Offset changes hole ownership or collapses a boundary. Reduce the distance.')
        objects.push({ name: `${input.name} Offset${request.side === 'both' ? ' ' + side : ''}`, contours: selected.map(i => replacements.get(i)!) })
      }
    }
    return { objects, inputVertices, outputVertices, bevelFallbacks, tolerancePx: request.tolerancePx }
  }
}
