import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../defaults'
import { prepareGeometryConversion } from '../editor/commands-geometry-conversion'
import { drawMesh2DBoundaryStroke } from './mesh2dBoundaryStroke'
import { drawMesh2DLayer } from './mesh2dRenderer'

/** Record actual paint operations without duplicating boundary extraction. */
function context() {
  const commands: unknown[][] = [], fills: number[] = [], strokes: number[] = []
  const ctx = { globalAlpha: 1, lineWidth: 1, miterLimit: 10, save() {}, restore() {}, beginPath() { commands.length = 0 },
    moveTo(x: number, y: number) { commands.push(['M', x, y]) }, lineTo(x: number, y: number) { commands.push(['L', x, y]) },
    closePath() { commands.push(['Z']) }, setLineDash() {}, stroke() { strokes.push(1) }, fill() { fills.push(1) } }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, commands, fills, strokes }
}

describe('converted Mesh boundary paint', () => {
  it('strokes exterior only and follows deformed vertices without painting internal diagonals', () => {
    const source = newRectLayer()
    source.style = { fill: { type: 'none' }, cornerRadius: 0, stroke: { color: '#000000', width: 3 } }
    const scene = { ...emptyScene(), layers: [source] }
    const result = prepareGeometryConversion(scene, [source.id], 'mesh2d').command.execute(scene).layers[0]
    const recorded = context(), positions = result.mesh2d!.geometry.positions.map((n, i) => n + (i % 2 === 0 ? 10 : 20))
    drawMesh2DLayer(recorded.ctx, result, new Map())
    drawMesh2DBoundaryStroke(recorded.ctx, result, new Map(), positions)
    expect(recorded.fills).toHaveLength(0)
    expect(recorded.strokes).toHaveLength(1)
    expect(recorded.commands.filter(command => command[0] === 'M')).toHaveLength(1)
    expect(recorded.commands.filter(command => command[0] === 'L')).toHaveLength(4)
    expect(recorded.commands[0].slice(1)).toEqual([10, 20])
  })
})
