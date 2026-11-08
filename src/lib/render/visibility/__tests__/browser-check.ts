import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { Layer } from '@/lib/types'
import { CanvasRenderer, type CanvasRenderOptions } from '../../CanvasRenderer'
import { CanvasSurfacePool } from '../../resources/CanvasSurfacePool'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { effectRegistry } from '@/lib/effects'

/** Disposable software regression fixtures, never added to the user's project. */
function shape(id: string, x = 10, y = 10): Layer {
  const layer = newRectLayer()
  return { ...layer, id, name: id, size: { width: 24, height: 24 },
    transform: { ...layer.transform, x, y, anchorX: 0, anchorY: 0 },
    style: { fill: { type: 'solid', color: '#e16c32', opacity: 80 } } }
}

/** Compares only the visible backing rectangle when CSS clipping is requested.
 * Outside that area skipping paint is intentional. Default/export cases compare
 * the entire RGBA image exactly, without thresholding away antialias differences. */
function differences(a: HTMLCanvasElement, b: HTMLCanvasElement, area?: PathBounds): number {
  const x = Math.max(0, Math.ceil(area?.x ?? 0)), y = Math.max(0, Math.ceil(area?.y ?? 0))
  const w = Math.max(0, Math.min(a.width - x, Math.floor(area?.width ?? a.width)))
  const h = Math.max(0, Math.min(a.height - y, Math.floor(area?.height ?? a.height)))
  if (!w || !h) return 0
  const left = a.getContext('2d')!.getImageData(x, y, w, h).data
  const right = b.getContext('2d')!.getImageData(x, y, w, h).data
  let changed = 0
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) changed++
  return changed
}

/** Real Canvas integration checks: transforms, dependencies, masks/effects and
 * temporal fallback. Publishes numeric results in DOM for automation, no API. */
function check(): void {
  document.body.innerHTML = '<h1>Paint visibility — native Canvas regression</h1><p id="status">Running</p><pre id="report"></pre><div id="examples"></div>'
  const results: unknown[] = []
  let passed = true
  function run(name: string, layers: Layer[], options: CanvasRenderOptions = {}, expectedMinimumCull = 0,
    setup?: (ctx: CanvasRenderingContext2D) => void) {
    const pool = new CanvasSurfacePool({ maxBytes: 4 * 128 * 96 * 4 })
    const scene = { ...emptyScene(), layers, composition: { ...emptyScene().composition, width: 128, height: 96 } }
    const canvases = [document.createElement('canvas'), document.createElement('canvas')]
    let statistics
    try {
      for (const [index, canvas] of Array.from(canvases.entries())) {
        canvas.width = 128; canvas.height = 96
        const context = canvas.getContext('2d')!
        setup?.(context)
        const renderer = new CanvasRenderer(pool)
        renderer.render(context, scene, 500, null, new Map(), {
          background: 'transparent', renderMode: 'preview', ...options, optimizePaint: index === 1,
        })
        if (index === 1) statistics = renderer.getLastPaintStatistics()
      }
      const changedChannels = differences(canvases[0], canvases[1], options.visibleArea)
      const ok = changedChannels === 0 && (statistics?.culled ?? 0) >= expectedMinimumCull && statistics?.completed
      passed &&= !!ok
      results.push({ name, passed: !!ok, changedChannels, statistics })
      if (results.length <= 2) document.querySelector('#examples')!.append(...canvases)
      else canvases.forEach(canvas => { canvas.width = canvas.height = 0 })
    } finally { pool.dispose() }
  }
  run('offscreen + visible', [shape('inside'), shape('outside', 180)], {}, 1)
  run('CSS pan/zoom clipping', [shape('left', 0), shape('middle', 50), shape('right', 100)],
    { visibleArea: { x: 48, y: 0, width: 32, height: 96 } }, 2)
  const stroke = shape('stroke', 140); stroke.style!.stroke = { color: '#357cff', width: 32, alignment: 'outside' }
  run('outside stroke reaches viewport', [stroke])
  const parent = { ...shape('parent', 80, 40), type: 'group', transform: { ...shape('tmp').transform, x: 80, y: 40, rotationDeg: 65, scaleX: -2, scaleY: 1.2 } } as Layer
  run('rotated mirrored parent', [parent, { ...shape('child', 15), parentId: parent.id }, { ...shape('far', 300), parentId: parent.id }], {}, 1)
  const transparent = { ...shape('transparent'), type: 'group', opacity: 0 } as Layer
  run('transparent subtree', [transparent, { ...shape('child'), parentId: transparent.id }], {}, 2)
  const emptyEffect={...transparent,effectsChain:[{id:'empty-shadow',type:'shadow',enabled:true,params:{blur:12}}]}
  run('certified empty effect subtree', [emptyEffect,{...shape('child'),parentId:emptyEffect.id}],{},2)
  const emptyMask=shape('empty-mask')
  run('empty effect plus inverted feather mask', [{...emptyEffect,masks:[{id:'m',maskLayerId:emptyMask.id,mode:'subtract',inverted:true,feather:7}]},
    {...shape('child'),parentId:emptyEffect.id},emptyMask],{},2)
  effectRegistry.register({type:'qa-opaque-empty',apply(input,_effect,surfaces){
    if(!surfaces)throw new Error('QA requires managed surfaces')
    const output=surfaces.create(input.width,input.height),context=output.getContext('2d')!
    context.fillStyle='#3b88ff';context.fillRect(0,0,input.width,input.height);return output
  }})
  run('uncertified effect can create opaque output from empty input', [{...shape('opaque'),opacity:0,
    effectsChain:[{id:'opaque',type:'qa-opaque-empty',enabled:true,params:{}}]}])
  run('destructive transparent child fallback', [shape('background'), transparent,
    { ...shape('erase'), parentId: transparent.id, blendMode: 'copy' }])
  const blurred = { ...shape('blur', 132), effects: { blur: 12 } }
  run('CSS blur outside geometry', [blurred])
  const shadow = { ...shape('shadow', 150), effectsChain: [{ id: 'fx', type: 'shadow', enabled: true,
    params: { blur: 8, offsetX: -40, offsetY: 0, color: '#2255ff', opacity: 1 } }] }
  run('plugin shadow outside geometry', [shadow])
  const mask = shape('mask', 80), host = { ...shape('host', 65), masks: [{ id: 'm', maskLayerId: mask.id, mode: 'intersect' as const, feather: 4 }] }
  run('offscreen mask pipeline preserved', [host, mask], { visibleArea: { x: 60, y: 0, width: 20, height: 96 } })
  const groupMask = { ...shape('maskgroup'), type: 'group' } as Layer
  run('mask group dependency', [{ ...host, masks: [{ id: 'm', maskLayerId: groupMask.id, mode: 'intersect' }] },
    groupMask, { ...shape('silhouette', 60), parentId: groupMask.id }])
  const source = shape('source', 180), repeater = { ...shape('copies', -180), type: 'repeater',
    repeater: { sourceLayerId: source.id, count: 3, mode: 'linear', transformStep: { x: 30, y: 0 } } } as Layer
  run('offscreen source has visible repeater copies', [source, repeater])
  run('caller scale and pan', [shape('a', 20), shape('b', 250)], {}, 1, c => { c.translate(25, 5); c.scale(1.5, 0.8) })
  run('caller shadow fallback', [shape('hardshadow', 180)], {}, 0,
    c => { c.shadowColor = '#2266ff'; c.shadowOffsetX = -170 })
  run('unknown arrow extent preserved', [{ ...shape('arrow', 160), shapeKind: 'arrow',
    shapeParams: { kind: 'arrow', x2: -140, y2: 20, arrowHeadSize: 30 }, style: { stroke: { color: '#fff', width: 4 } } }])
  const path = { ...shape('path', -100), type: 'path', pathRole: 'motion', path: { closed: false, anchors: [
    { x: 0, y: 30 }, { x: 200, y: 30 },
  ] } } as Layer
  run('follow-path source retained', [path, { ...shape('follower'), followPath: { pathLayerId: path.id, progress: 0.7 } }])
  const moving = shape('temporal', 10)
  moving.motionBlur = { enabled: true, baked: false, trailCount: 3, frameInterval: 30, maxOpacity: 0.6, velocityThreshold: 0 }
  run('temporal trail enters view while current position is outside', [moving],
    { overrides: new Map([['layers.temporal.transform.x', 140]]) })
  run('animated position and size', [shape('animated', 200)], {
    overrides: new Map([['layers.animated.transform.x', 20], ['layers.animated.size.width', 50]]),
  })
  const diagnosticScene = { ...emptyScene(), layers: [shape('diagnostic')] }
  const diagnosticCanvas = document.createElement('canvas'); diagnosticCanvas.width = 128; diagnosticCanvas.height = 96
  const diagnosticContext = diagnosticCanvas.getContext('2d')!, diagnosticRenderer = new CanvasRenderer()
  diagnosticRenderer.render(diagnosticContext, diagnosticScene, 0, null, new Map(), { renderMode: 'preview' })
  const beforeGhost = diagnosticRenderer.getLastPaintStatistics()
  diagnosticRenderer.renderSingleLayer(diagnosticContext, diagnosticScene.layers[0], diagnosticScene, new Map(), { timeMs: 30 })
  const ghostPreserved = JSON.stringify(beforeGhost) === JSON.stringify(diagnosticRenderer.getLastPaintStatistics())
  results.push({ name: 'ghost preserves main frame counters', passed: ghostPreserved }); passed &&= ghostPreserved
  const deniedPool = new CanvasSurfacePool({ maxBytes: 0 }), deniedRenderer = new CanvasRenderer(deniedPool)
  diagnosticScene.layers[0].effectsChain = [{ id: 'denied', type: 'blur', enabled: true, params: { radius: 2 } }]
  let threw = false
  try { deniedRenderer.render(diagnosticContext, diagnosticScene, 0, null, new Map()) } catch { threw = true }
  const partial = threw && deniedRenderer.getLastPaintStatistics()?.completed === false && deniedPool.getSnapshot().activeSurfaces === 0
  results.push({ name: 'failed frame is partial and releases surfaces', passed: partial }); passed &&= partial
  deniedPool.dispose(); diagnosticCanvas.width = diagnosticCanvas.height = 0
  document.querySelector('#status')!.textContent = passed ? 'PASS' : 'FAIL'
  document.querySelector('#report')!.textContent = JSON.stringify({ passed, results }, null, 2)
}
try { check() } catch (error) {
  document.querySelector('#status')!.textContent = 'FAIL'
  document.querySelector('#report')!.textContent = String(error)
}
