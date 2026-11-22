import { flushSync } from 'react-dom'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline } from '@/lib/spline'
import { acquireSceneText } from '@/lib/export/text/TextOutput'

type Pixels = { bytes: Uint8ClampedArray; width: number }
interface Checks {
  editor(): EditorStateReturn
  frames(n?: number): Promise<void>
  select(label: string, value: string): Promise<void>
  number(label: string, value: string): Promise<void>
  click(text: string): Promise<void>
  raster(): Promise<Pixels>
  pixels(blob: Blob): Promise<Pixels>
}
/** Real source/Properties/PNG/SVG checks. A private fixture retains the ready
 * imported asset, exercises paint alpha/geometry and leaves a visible result. */
export async function checkSplinePaint(io: Checks, assetId: string): Promise<string[]> {
  const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
  const pixel = (image: Pixels, x: number, y: number) => Array.from(image.bytes.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))
  const close = (a: number[], b: number[], epsilon = 3) => a.every((value, i) => Math.abs(value - b[i]) <= epsilon)
  const checks: string[] = [], source = io.editor().getScene()
  const layer = newSplineLayerFromData(createRectangleSpline({ width: 200, height: 120 }), { x: 160, y: 120, name: 'Spline paint' })
  layer.id = 'hero'; layer.style = { fill: { type: 'gradient', gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] } }, stroke: { type: 'none', color: '#000000', width: 10 } }
  flushSync(() => io.editor().resetScene({ ...source, layers: [layer], timelines: [], composition: { ...source.composition, backgroundFill: { type: 'none' }, backgroundInExport: true } }))
  await io.frames(); await io.click('Edit shape')
  let output = await io.raster()
  assert(pixel(output, 80, 120)[0] < pixel(output, 240, 120)[0] - 150, 'Linear gradient direction changed')
  await io.select('Spline Fill Type', 'radial'); output = await io.raster()
  assert(pixel(output, 160, 120)[0] < pixel(output, 250, 120)[0] - 100, 'Radial gradient missing')
  await io.select('Spline Fill Type', 'reflected'); output = await io.raster()
  assert(close(pixel(output, 100, 120), pixel(output, 219, 120)), 'Reflected gradient is not mirrored')
  await io.select('Spline Fill Type', 'diamond'); output = await io.raster()
  assert(close(pixel(output, 200, 120), pixel(output, 160, 144), 7), 'Diamond normalized axes differ')
  assert(pixel(output, 200, 144)[0] > pixel(output, 200, 120)[0] + 70, 'Diamond diagonal is not Manhattan distance')
  const diamond = await acquireSceneText(io.editor().getScene(), 'svg')
  try { const vector = await io.pixels(new Blob([diamond.value.text], { type: 'image/svg+xml' })); assert(close(pixel(vector, 200, 144), pixel(output, 200, 144), 5), 'Diamond SVG differs from PNG') } finally { diamond.release() }
  await io.select('Spline Fill Type', 'angle'); output = await io.raster()
  assert(Math.abs(pixel(output, 230, 120)[0] - pixel(output, 90, 120)[0]) > 80, 'Angle gradient has no angular progression')
  const angular = await acquireSceneText(io.editor().getScene(), 'svg')
  try { assert(angular.value.warnings.some(warning => warning.includes('Angle')), 'Angle SVG approximation was not disclosed') } finally { angular.release() }
  checks.push('Real PNG pixels verify Linear, Radial, Reflected, Diamond and Angle; Angle SVG discloses its bounded approximation')
  await io.select('Spline Fill Type', 'gradient'); await io.number('Gradient stop 1 alpha', '50'); await io.number('Gradient stop 2 alpha', '50'); await io.number('Spline fill opacity', '50')
  output = await io.raster(); assert(Math.abs(pixel(output, 160, 120)[3] - 64) <= 2, `Stop alpha and fill opacity did not multiply: ${JSON.stringify(pixel(output,160,120))}; ${JSON.stringify(io.editor().getScene().layers[0].style?.fill)}`)
  const beforeStop = structuredClone(io.editor().getScene()); await io.click('+ Add stop')
  assert(io.editor().getScene().layers[0].style?.fill?.gradient?.stops.length === 3, 'Stop was not added')
  flushSync(() => io.editor().undo()); await io.frames(); assert(JSON.stringify(io.editor().getScene()) === JSON.stringify(beforeStop), 'Stop edit was not one Undo')
  flushSync(() => io.editor().redo()); await io.frames()
  checks.push('Per-stop alpha multiplies fill opacity; added stops have native Undo/Redo')
  await io.select('Spline Fill Type', 'pattern'); await io.select('Image asset', assetId); await io.select('Image fit', 'fill'); await io.number('Image scale', '25'); await io.number('Spline fill opacity', '100')
  output = await io.raster(); assert(close(pixel(output, 70, 80), pixel(output, 120, 110)), 'Pattern does not tile at the configured scale')
  const patternSvg = await acquireSceneText(io.editor().getScene(), 'svg')
  try { const vector = await io.pixels(new Blob([patternSvg.value.text], { type: 'image/svg+xml' })); assert(close(pixel(vector, 70, 80), pixel(output, 70, 80)), 'Pattern SVG differs from PNG') } finally { patternSvg.release() }
  checks.push('Pattern tiles a shared decoded image at local scale and matches SVG pixels')
  await io.select('Spline Fill Type', 'none'); await io.select('Spline Stroke Type', 'solid')
  for (const align of ['inside', 'center', 'outside']) {
    await io.select('Spline stroke alignment', align); output = await io.raster()
    const outside = pixel(output, 55, 120)[3], inside = pixel(output, 65, 120)[3]
    if (align === 'inside') assert(outside === 0 && inside === 255, 'Inside stroke leaked outside')
    if (align === 'center') assert(pixel(output, 57, 120)[3] === 255 && pixel(output, 63, 120)[3] === 255, 'Center stroke is not centered')
    if (align === 'outside') assert(outside === 255 && inside === 0 && pixel(output, 160, 120)[3] === 0, 'Outside stroke failed with No Fill')
    const svg = await acquireSceneText(io.editor().getScene(), 'svg')
    try { const vector = await io.pixels(new Blob([svg.value.text], { type: 'image/svg+xml' })); assert(close(pixel(vector, 55, 120), pixel(output, 55, 120)) && close(pixel(vector, 65, 120), pixel(output, 65, 120)), `${align} SVG differs from PNG`) } finally { svg.release() }
  }
  checks.push('Inside/Center/Outside stroke geometry works with No Fill in actual Canvas PNG and SVG masks/clips')
  await io.select('Spline Stroke Type', 'gradient'); await io.select('Gradient type', 'diamond'); await io.select('Spline stroke alignment', 'outside')
  output = await io.raster(); assert(pixel(output, 55, 120)[3] === 255, 'Diamond gradient was clipped at the path bounds')
  const gradientStroke = await acquireSceneText(io.editor().getScene(), 'svg')
  try { const vector = await io.pixels(new Blob([gradientStroke.value.text], { type: 'image/svg+xml' })); assert(pixel(vector,55,120)[3] === 255, 'Diamond SVG stroke was clipped at path bounds') } finally { gradientStroke.release() }
  await io.select('Spline Stroke Type', 'solid')
  await io.select('Spline stroke alignment', 'center'); await io.select('Spline stroke style', 'dashed'); await io.number('Dash length', '12'); await io.number('Gap length', '8')
  const field = document.querySelector<HTMLInputElement>('[aria-label="Dash sequence"]')!
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '12, 8, 4, 8'); field.dispatchEvent(new Event('input', { bubbles: true })) }); await io.frames()
  field.focus(); flushSync(() => field.blur()); await io.frames()
  assert(io.editor().getScene().layers[0].style?.stroke?.dashArray?.length === 4, 'Custom dash sequence did not commit')
  output = await io.raster(); const alphas = Array.from({ length: 180 }, (_, x) => pixel(output, x + 70, 59)[3])
  assert(alphas.some(value => value === 0) && alphas.some(value => value === 255), 'Dash sequence has no visible gaps')
  await io.select('Spline stroke style', 'dotted'); assert(io.editor().getScene().layers[0].style?.stroke?.lineCap === 'round', 'Dotted stroke lacks round caps')
  await io.select('Spline stroke caps', 'square'); await io.select('Spline stroke corners', 'bevel')
  await io.select('Spline stroke style', 'solid'); await io.select('Spline Stroke Type', 'pattern'); await io.select('Image asset', assetId)
  output = await io.raster(); assert(pixel(output, 60, 120)[3] > 0, 'Pattern stroke did not paint')
  const svg = await acquireSceneText(io.editor().getScene(), 'svg')
  try { const vector = await io.pixels(new Blob([svg.value.text], { type: 'image/svg+xml' })); assert(close(pixel(vector, 61, 113), pixel(output, 61, 113)), `Pattern stroke SVG differs from PNG: ${JSON.stringify(pixel(vector,61,113))} versus ${JSON.stringify(pixel(output,61,113))}`) } finally { svg.release() }
  checks.push('Dashed/dotted/custom dash and cap/corner controls persist; pattern stroke paints and exports independently of fill')
  return checks
}
