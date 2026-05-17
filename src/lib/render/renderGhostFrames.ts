/**
 * Canvas ghost frame rendering utility
 *
 * Draws ghost frames (onion skin visualization) for timeline playhead-relative
 * animation preview. Ghost frames are rendered at reduced opacity to show motion paths.
 */

import type { GhostFrame } from '@/lib/animation/ghostFrames'
import type { RenderContext } from './RenderContext'

export interface GhostRenderOptions {
  /** Ghost frame list */
  ghostFrames: GhostFrame[]
  /** Whether to draw ghost outlines (vs. filled) */
  outline: boolean
  /** Color override for ghosts (default: use layer color) */
  ghostColor?: string
  /** Whether to draw frame numbers for debugging */
  showFrameNumbers?: boolean
}

/**
 * Render a set of ghost frames onto the canvas.
 * Each ghost frame is drawn with its interpolated transform and reduced opacity.
 *
 * @param ctx Render context (canvas, layerIndex, overrides)
 * @param options Ghost render options
 */
export function renderGhostFrames(ctx: RenderContext, options: GhostRenderOptions) {
  const { ghostFrames, outline, ghostColor, showFrameNumbers } = options
  const canvas = ctx.canvas

  if (!canvas || ghostFrames.length === 0) return

  // Save canvas state
  const savedAlpha = canvas.globalAlpha

  // Iterate each ghost frame
  for (const ghostFrame of ghostFrames) {
    // Skip rendering if opacity would be negligible
    if (ghostFrame.opacity !== undefined && ghostFrame.opacity < 0.05) {
      continue
    }

    // Compute combined opacity: frame's opacity × ghost base opacity
    const baseOpacity = 0.3 // 30% baseline for ghost visibility
    const finalOpacity =
      (ghostFrame.opacity ?? 1) * baseOpacity * (options.ghostColor ? 0.4 : 0.35)
    canvas.globalAlpha = finalOpacity

    // Render ghost transform indicator
    if (ghostFrame.transform) {
      const tx = ghostFrame.transform
      const x = tx.x
      const y = tx.y

      // Draw a small circle at the ghost's position
      canvas.fillStyle = ghostColor ?? '#A78BFA' // purple for unknown layer
      canvas.beginPath()
      canvas.arc(x, y, 3, 0, Math.PI * 2)
      canvas.fill()

      // Optional: draw a cross or directional indicator
      const size = 8
      canvas.strokeStyle = ghostColor ?? '#A78BFA'
      canvas.lineWidth = 0.5
      canvas.beginPath()
      canvas.moveTo(x - size, y)
      canvas.lineTo(x + size, y)
      canvas.moveTo(x, y - size)
      canvas.lineTo(x, y + size)
      canvas.stroke()

      // Optional: show frame number for debugging
      if (showFrameNumbers) {
        canvas.fillStyle = ghostColor ?? '#A78BFA'
        canvas.font = '10px monospace'
        canvas.fillText(`F${ghostFrame.frameNumber}`, x + 5, y - 5)
      }
    }
  }

  // Restore canvas state
  canvas.globalAlpha = savedAlpha
}

/**
 * Render a debug visualizer showing ghost frame timeline positions.
 * Useful for understanding which frames are being rendered.
 *
 * @param ctx Render context
 * @param ghostFrames Ghost frames to visualize
 * @param canvasTop Top edge Y coordinate for timeline visualization
 * @param canvasHeight Height of visualization area
 */
export function renderGhostTimelineDebug(
  ctx: RenderContext,
  ghostFrames: GhostFrame[],
  canvasTop: number,
  canvasHeight: number,
) {
  const canvas = ctx.canvas
  if (!canvas || ghostFrames.length === 0) return

  const savedAlpha = canvas.globalAlpha
  const savedStroke = canvas.strokeStyle

  canvas.globalAlpha = 0.5
  canvas.strokeStyle = '#A78BFA'
  canvas.lineWidth = 1

  for (const ghostFrame of ghostFrames) {
    const barHeight = canvasHeight * 0.2
    const y = canvasTop + canvasHeight * 0.5

    // Vertical line marking ghost frame time
    canvas.beginPath()
    canvas.moveTo(ghostFrame.timeMs / 1000, y - barHeight / 2)
    canvas.lineTo(ghostFrame.timeMs / 1000, y + barHeight / 2)
    canvas.stroke()

    // Color: blue for "before" frames, green for "after"
    canvas.fillStyle = ghostFrame.isBefore ? '#3B82F6' : '#22C55E'
    canvas.globalAlpha = 0.3
    canvas.fillRect(ghostFrame.timeMs / 1000 - 2, y - barHeight / 2, 4, barHeight)
  }

  canvas.globalAlpha = savedAlpha
  canvas.strokeStyle = savedStroke
}
