import type { Layer, MaskDefinition } from '@/lib/types'
import { MaskRenderer, type MaskRenderArgs } from '@/lib/mask/MaskRenderer'
import { CanvasSurfacePool } from '../CanvasSurfacePool'

/** Allocates a real browser canvas for pixel comparisons, independently of pool ownership. */
function canvas(width = 128, height = 96): HTMLCanvasElement {
  const result = document.createElement('canvas')
  result.width = width; result.height = height
  return result
}

/**
 * Frozen pre-pool reference: fresh content and silhouette canvases, matching
 * MaskRenderer before resource pooling. Kept only in this browser regression
 * fixture so native clipping/filter/compositing can be compared byte-for-byte.
 */
function reference(masks: MaskDefinition[], args: MaskRenderArgs): void {
  if (!masks.length) { args.renderHost(args.destCtx); return }
  const content = canvas(args.width, args.height), context = content.getContext('2d')!
  args.renderHost(context)
  for (const mask of masks) {
    const layer = args.getLayer(mask.maskLayerId)
    if (!layer) continue
    const silhouette = canvas(args.width, args.height), maskCtx = silhouette.getContext('2d')!
    if (mask.feather && mask.feather > 0) maskCtx.filter = `blur(${mask.feather}px)`
    args.renderMask(layer, maskCtx)
    maskCtx.filter = 'none'
    if (mask.inverted) {
      maskCtx.save(); maskCtx.globalCompositeOperation = 'difference'; maskCtx.fillStyle = '#fff'
      maskCtx.fillRect(0, 0, args.width, args.height); maskCtx.restore()
    }
    context.save(); context.globalAlpha = mask.opacity ?? 1
    context.globalCompositeOperation = mask.mode === 'subtract' ? 'destination-out' : 'destination-in'
    context.drawImage(silhouette, 0, 0); context.restore()
  }
  args.destCtx.drawImage(content, 0, 0)
  content.width = content.height = 0
}

/** Provides translated/rotated gradient content and deliberately unbalanced mask clips. */
function argumentsFor(destination: HTMLCanvasElement): MaskRenderArgs {
  const host: Layer = {
    id: 'host', name: 'Browser QA', type: 'shape', opacity: 1,
    transform: { x: 0, y: 0, rotationDeg: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0 },
  }
  return {
    destCtx: destination.getContext('2d')!, width: destination.width, height: destination.height, hostLayer: host,
    renderHost(context) {
      context.save(); context.translate(12, 6); context.rotate(0.08)
      const gradient = context.createLinearGradient(0, 0, 100, 60)
      gradient.addColorStop(0, '#ff7b35'); gradient.addColorStop(1, '#35a9ff')
      context.fillStyle = gradient; context.globalAlpha = 0.85
      context.fillRect(0, 0, 100, 70); context.restore()
    },
    renderMask(layer, context) {
      context.beginPath()
      if (layer.id === 'circle') context.arc(50, 44, 30, 0, Math.PI * 2)
      else context.rect(50, 8, 65, 60)
      context.clip()
      context.fillStyle = '#fff'; context.fillRect(0, 0, destination.width, destination.height)
    },
    getLayer: id => id === 'missing' ? undefined : { ...host, id },
  }
}

/** Returns changed RGBA channels; zero is exact parity on the same browser/backend. */
function differences(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
  const left = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data
  const right = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data
  let changed = 0
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) changed++
  return changed
}

/** Executes real Canvas2D regression checks and publishes only local test results to the page. */
async function check(): Promise<void> {
  document.title = 'Chorono mask surface regression'
  document.body.innerHTML = `<style>
    body{font:15px system-ui;margin:28px;background:#f3f5f7;color:#17212b}
    h1{font-size:24px}pre{white-space:pre-wrap;background:white;padding:16px;border:1px solid #ccd4dc}
    #examples{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;padding:12px;background:white}
    canvas{background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0/16px 16px}
    figcaption{margin-bottom:8px}strong{color:#18723c}
  </style><h1>Mask surface pool — browser regression</h1><p id="status">Running native pixel comparisons…</p>
    <div id="examples"></div><pre id="results"></pre>`
  const pool = new CanvasSurfacePool({ maxBytes: 1024 * 1024 })
  const renderer = new MaskRenderer(pool)
  const results: Array<{ name: string; changedChannels: number }> = []
  const example = (label: string, output: HTMLCanvasElement) => {
    const figure = document.createElement('figure'), caption = document.createElement('figcaption')
    caption.textContent = label; figure.append(caption, output)
    document.querySelector('#examples')!.append(figure)
  }
  const run = (name: string, masks: MaskDefinition[]) => {
    const expected = canvas(), actual = canvas()
    reference(masks, argumentsFor(expected)); renderer.render(masks, argumentsFor(actual))
    results.push({ name, changedChannels: differences(expected, actual) })
    if (results.length <= 4) { example(`${name} — reference`, expected); example(`${name} — pooled`, actual) }
    else { expected.width = expected.height = actual.width = actual.height = 0 }
  }
  try {
    for (const mode of ['add', 'subtract', 'intersect'] as const) {
      for (const inverted of [false, true]) for (const feather of [0, 4]) {
        run(`${mode}, invert=${inverted}, feather=${feather}`, [
          { id: 'a', maskLayerId: 'circle', mode, opacity: 0.65, inverted, feather },
          { id: 'b', maskLayerId: 'box', mode: 'intersect', opacity: 0.8 },
        ])
      }
    }
    run('no masks', [])
    run('missing mask', [{ id: 'a', maskLayerId: 'missing', mode: 'add', opacity: 1 }])
    for (let frame = 0; frame < 60; frame++) {
      const output = canvas()
      renderer.render([{ id: 'a', maskLayerId: frame % 2 ? 'circle' : 'box', mode: 'add', opacity: 1 }], argumentsFor(output))
      output.width = output.height = 0
    }
    const beforeGrace = pool.getSnapshot()
    await new Promise(resolve => setTimeout(resolve, 2100))
    const afterGrace = pool.getSnapshot()
    const passed = results.every(result => result.changedChannels === 0)
      && beforeGrace.allocations === 2 && afterGrace.residentBytes === 0
    document.querySelector('#status')!.textContent = passed ? 'PASS — exact pixels, two surfaces, idle bytes released' : 'FAIL'
    document.querySelector('#results')!.textContent = JSON.stringify({ passed, results, beforeGrace, afterGrace }, null, 2)
  } finally {
    pool.dispose()
  }
}

void check().catch(error => {
  document.querySelector('#status')!.textContent = 'FAIL'
  document.querySelector('#results')!.textContent = String(error)
})
