// ── Exporter2D ────────────────────────────────────────────────────────────────
// IExporter implementation for the '2danimation' mode.
//
// Planned formats (BL-35 / BL-36 / BL-37):
//   GIF       — animated GIF via gif.js or similar encoder
//   WebM      — WebM video via MediaRecorder API
//   HTML      — standalone HTML widget with embedded runtime JSON
//
// This file is a placeholder that satisfies the IExporter interface.
// Real encoding lands in BL-35, BL-36, BL-37 export sprints.

import type { IExporter, ExportOptions, ExportResult } from '@/lib/core/IExporter'
import type { IScene } from '@/lib/core/IScene'

export class Exporter2DGIF implements IExporter {
  readonly mode = '2danimation' as const
  readonly label = 'Animated GIF'

  async export(_scene: IScene, _options?: ExportOptions): Promise<ExportResult> {
    // TODO BL-37: frame-by-frame render → gif.js encoder
    throw new Error('GIF export not yet implemented (BL-37)')
  }
}

export class Exporter2DWebM implements IExporter {
  readonly mode = '2danimation' as const
  readonly label = 'WebM Video'

  async export(_scene: IScene, _options?: ExportOptions): Promise<ExportResult> {
    // TODO BL-36: MediaRecorder canvas capture → WebM blob
    throw new Error('WebM export not yet implemented (BL-36)')
  }
}

export class Exporter2DHTML implements IExporter {
  readonly mode = '2danimation' as const
  readonly label = 'Standalone HTML'

  async export(scene: IScene, _options?: ExportOptions): Promise<ExportResult> {
    // Minimal working export: serialize scene JSON into a self-contained HTML.
    // A proper ChronoPlayer runtime replaces the placeholder script in BL-35.
    const sceneJson = JSON.stringify(scene, null, 2)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chorono Animation</title>
  <style>body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #111; }</style>
</head>
<body>
  <canvas id="chorono-canvas"></canvas>
  <script>
    // TODO: replace with minified ChronoPlayer runtime (BL-35)
    const scene = ${sceneJson};
    const canvas = document.getElementById('chorono-canvas');
    canvas.width  = scene.composition?.width  ?? 360;
    canvas.height = scene.composition?.height ?? 240;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = scene.composition?.backgroundColor ?? '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Chorono runtime coming in BL-35', canvas.width / 2, canvas.height / 2);
  <\/script>
</body>
</html>`

    return {
      data: new Blob([html], { type: 'text/html' }),
      mimeType: 'text/html',
      filename: `${(scene as any).composition?.id ?? 'animation'}.html`,
    }
  }
}
