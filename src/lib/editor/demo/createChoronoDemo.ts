import { emptyScene, DEFAULT_TRANSFORM } from '../../defaults'
import type { ChronoScene, Layer, Track } from '../../types'
import type { TextStyle } from '../../types/text'
import { measureTextLayout } from '../../text/measureText'

const INK = '#182234', MUTED = '#596276', INDIGO = '#435FD5', LAVENDER = '#B9C6FF'

/** Fresh, entirely editable first-launch example. Coordinates are composition
 * pixels; track times are local milliseconds over a six-second loop. Stable
 * IDs and meaningful parent groups make the example easy to inspect. All
 * returned objects belong to the caller; no assets, runtime handles, network
 * requests or global factory counters are involved. Recovery takes precedence
 * over this fallback, so upgrading the demo never replaces a user's workspace.
 */
export function createChoronoDemo(): ChronoScene {
  const scene = emptyScene(), layers: Layer[] = []
  /** Append a native parent with an identity affine transform. */
  const group = (id: string, name: string, parentId?: string) => {
    layers.push({ id, name, type: 'group', parentId, opacity: 1, transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0 } })
    return id
  }
  /** Append geometry in parent-local pixels; its pivot is the visual center. */
  const shape = (id: string, name: string, parentId: string, x: number, y: number, width: number, height: number, color: string, radius = 0, circle = false) => {
    const layer: Layer = { id, name, parentId, type: 'shape', shape: circle ? 'circle' : 'rect', opacity: 1,
      transform: { ...DEFAULT_TRANSFORM, x, y, anchorX: width / 2, anchorY: height / 2 }, size: { width, height },
      style: { fill: { type: 'solid', color }, cornerRadius: radius } }
    layers.push(layer); return layer
  }
  /** Measure native text for accurate selection and property editing. */
  const text = (id: string, name: string, parentId: string, x: number, y: number, value: string, fontSize: number, color: string, extra: Partial<TextStyle> = {}) => {
    const style: TextStyle = { value, fontSize, color, fontFamily: 'Arial', ...extra }
    layers.push({ id, name, parentId, type: 'text', opacity: 1, transform: { ...DEFAULT_TRANSFORM, x, y }, text: style, size: measureTextLayout(style) })
  }
  const brand = group('demo_brand', '01 · Chorono / brand')
  shape('demo_mark', 'Chorono mark', brand, 44, 35, 28, 28, INDIGO, 9)
  text('demo_mark_c', 'Mark / c', brand, 50, 36, 'c', 25, '#FFFFFF', { fontWeight: 'bold' })
  text('demo_wordmark', 'Brand / chorono', brand, 83, 35, 'chorono', 26, INK, { fontWeight: 'bold', letterSpacing: -0.8 })
  text('demo_eyebrow', 'Animation studio', brand, 565, 43, 'ANIMATION STUDIO', 10, MUTED, { letterSpacing: 2 })
  shape('demo_rule', 'Header divider', brand, 44, 81, 712, 1, '#E1E5EF')

  const message = group('demo_message', '02 · Make it move / typography')
  text('demo_headline_top', 'Headline / Make it', message, 44, 118, 'Make it', 55, INK, { fontWeight: 'bold', letterSpacing: -2 })
  text('demo_headline_bottom', 'Headline / move', message, 44, 174, 'move.', 55, INK, { fontWeight: 'bold', letterSpacing: -2 })
  text('demo_description_top', 'Introduction / first line', message, 46, 252, 'Build a little world.', 15, MUTED)
  text('demo_description_bottom', 'Introduction / second line', message, 46, 275, 'Animate every detail.', 15, MUTED)
  for (const [index, label, x, width] of [[0, 'LAYERS', 44, 85], [1, 'KEYFRAMES', 137, 110], [2, 'MOTION', 255, 85]] as const) {
    shape(`demo_chip_${index}`, `${label} / chip`, message, x, 319, width, 27, '#E9EDF6', 7)
    text(`demo_chip_label_${index}`, `${label} / label`, message, x + 12, 327, label, 9, MUTED, { letterSpacing: 1.1 })
  }

  const playground = group('demo_playground', '03 · Motion playground / shapes')
  shape('demo_card_shadow', 'Card / soft offset', playground, 426, 119, 336, 252, '#DFE4F1', 22)
  shape('demo_card', 'Card / indigo', playground, 420, 109, 336, 252, INDIGO, 22)
  for (let index = 0; index < 3; index++) shape(`demo_dot_${index}`, `Window dot ${index + 1}`, playground, 440 + index * 13, 128, 5, 5, index ? '#92A6F0' : '#FFFFFF', 0, true)
  text('demo_card_title', 'Playground / label', playground, 606, 127, 'MOTION / 001', 9, '#DAE2FF', { letterSpacing: 1.3 })
  const orbit = shape('demo_orbit', 'Orbit / outline', playground, 516, 175, 144, 144, INDIGO, 0, true)
  orbit.style = { fill: { type: 'solid', color: INDIGO, opacity: 0 }, stroke: { color: '#90A6FF', width: 1.5 } }
  const diamond = shape('demo_diamond', 'Diamond / rotation + scale keys', playground, 548, 205, 80, 80, LAVENDER, 18)
  diamond.transform.rotationDeg = 45
  diamond.style!.fill = { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#B9C6FF' }, { offset: 1, color: '#F0F3FF' }] } }
  shape('demo_satellite', 'Satellite / position keys', playground, 651, 238, 18, 18, '#FFBA85', 0, true)
  text('demo_card_footer', 'Playground / editable note', playground, 440, 333, '01 / ALL ELEMENTS EDITABLE', 9, '#D6E0FF', { letterSpacing: 1.1 })

  const timeline = group('demo_timeline_art', '04 · Timeline / animated playhead')
  shape('demo_strip', 'Timeline / background', timeline, 44, 387, 712, 29, '#E9EDF6', 8)
  shape('demo_track', 'Timeline / rail', timeline, 76, 401, 648, 2, '#CAD3E7')
  for (let index = 0; index < 4; index++) {
    const key = shape(`demo_key_${index}`, `Timeline / key ${index + 1}`, timeline, 109 + index * 164, 399, 7, 7, INDIGO, 1)
    key.transform.rotationDeg = 45
  }
  const playhead = group('demo_playhead', 'Playhead / animated position', timeline)
  shape('demo_playhead_line', 'Playhead / line', playhead, 76, 393, 1.5, 18, INDIGO)
  shape('demo_playhead_dot', 'Playhead / dot', playhead, 73, 391, 7, 7, INDIGO, 0, true)
  text('demo_play_hint', 'Preview hint', timeline, 44, 426, 'PRESS PLAY TO PREVIEW', 9, MUTED, { letterSpacing: 1.6 })

  /** Native tracks keep the sample portable and directly editable in Timeline.
   * No expression runtime or per-frame procedural code is needed for playback. */
  const track = (id: string, property: string, samples: [number, number][], smooth = false): Track => ({
    target: `layers.${id}.${property}`, keyframes: samples.map(([timeMs, value], index) => ({ id: `${id}_${property.replaceAll('.', '_')}_${index}`, timeMs, value, easing: { type: smooth ? 'easeInOut' : 'linear' } })),
  })
  const orbitSamples = Array.from({ length: 25 }, (_, index) => {
    const angle = index / 24 * Math.PI * 2
    return { time: index * 250, x: 579 + Math.cos(angle) * 72, y: 238 + Math.sin(angle) * 72 }
  })
  scene.composition = { ...scene.composition, id: 'chorono-demo', width: 800, height: 450, durationMs: 6000, frameRate: 30, backgroundColor: '#F7F8FC' }
  scene.layers = layers
  scene.timelines = [{ id: 'demo_motion', mode: '2danimation', durationMs: 6000, autoplay: false, loop: true, layerIds: layers.map(layer => layer.id), tracks: [
    track('demo_diamond', 'transform.rotationDeg', [[0, 45], [6000, 405]]),
    track('demo_diamond', 'transform.scaleX', [[0, 1], [3000, 1.12], [6000, 1]], true),
    track('demo_diamond', 'transform.scaleY', [[0, 1], [3000, 1.12], [6000, 1]], true),
    track('demo_satellite', 'transform.x', orbitSamples.map(sample => [sample.time, sample.x])),
    track('demo_satellite', 'transform.y', orbitSamples.map(sample => [sample.time, sample.y])),
    track('demo_playhead', 'transform.x', [[0, 0], [6000, 648]]),
  ] }]
  return scene
}
