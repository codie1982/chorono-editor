// ── htmlExport ────────────────────────────────────────────────────────────────
//
// Standalone HTML export. Produces a single self-playing .html that loads
// @chorono/runtime from a CDN and embeds the scene JSON inline, wiring a canvas
// to ChronoPlayer. Shareable: open the file, it plays.
//
// Runtime loading uses a CDN <script> (per the chosen strategy) — the page is
// tiny and always pulls the published runtime. The scene is embedded so no
// second request is needed.

import type { ChronoScene } from '@/lib/types'

const DEFAULT_RUNTIME_URL =
  'https://unpkg.com/@chorono/runtime/dist/chorono-runtime.global.js'

export interface HTMLExportOptions {
  /** Document <title>. Default = composition id. */
  title?: string
  /** UMD bundle URL exposing the global `Chorono`. Default unpkg latest. */
  runtimeUrl?: string
  /** Loop at composition.durationMs. Default true. */
  loop?: boolean
  /** Autoplay on load. Default true. */
  autoplay?: boolean
  /** Page background CSS colour. Default '#111'. */
  pageBackground?: string
}

export interface HTMLExportResult {
  html: string
  filename: string
}

/** Embed JSON safely inside a <script> block — neutralises `</script>` (and
 *  `<!--`) so scene content can't break out of the tag. Parsed back with
 *  JSON.parse, so escaping only `<`/`>` is sufficient. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function exportHTML(scene: ChronoScene, opts: HTMLExportOptions = {}): HTMLExportResult {
  return renderHTMLDocument(scene.composition,embedJson(scene),opts)
}

/** Render the existing standalone document around an already script-escaped
 * JSON string. Output owners preflight/own serialization and `<`/`>` expansion
 * before calling this template; raw exportHTML keeps its original contract.
 * composition is borrowed, dimensions stay CSS/physical composition pixels.
 * sceneJson MUST have literal `<` and `>` replaced by JSON unicode escapes.
 * No IO, native handles, mutation or schema/renderer behavior is introduced. */
export function renderHTMLDocument(composition:ChronoScene['composition'],sceneJson:string,opts:HTMLExportOptions={}):HTMLExportResult {
  const { width, height } = composition
  const title      = opts.title ?? composition.id ?? 'Chorono Animation'
  const runtimeUrl = opts.runtimeUrl ?? DEFAULT_RUNTIME_URL
  const loop       = opts.loop ?? true
  const autoplay   = opts.autoplay ?? true
  const pageBg     = opts.pageBackground ?? '#111'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  html,body { margin:0; height:100%; background:${escapeHtml(pageBg)}; }
  body { display:flex; align-items:center; justify-content:center; }
  canvas { max-width:100%; max-height:100vh; object-fit:contain; }
</style>
</head>
<body>
<canvas id="chorono" width="${width}" height="${height}"></canvas>
<script src="${escapeHtml(runtimeUrl)}"></script>
<script id="chorono-scene" type="application/json">${sceneJson}</script>
<script>
  (function () {
    var scene = JSON.parse(document.getElementById('chorono-scene').textContent);
    var canvas = document.getElementById('chorono');
    var ctx = canvas.getContext('2d');
    if (!window.Chorono) { console.error('Chorono runtime failed to load'); return; }
    var player = new Chorono.ChronoPlayer(scene, new Chorono.CanvasRenderAdapter(ctx), { loop: ${loop} });
    ${autoplay ? 'player.play();' : 'player.tick(0);'}
    window.choronoPlayer = player;
  })();
</script>
</body>
</html>
`

  return { html, filename: `${composition.id || 'scene'}.html` }
}
