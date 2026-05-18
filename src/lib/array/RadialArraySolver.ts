// ── RadialArraySolver (BL-59) ─────────────────────────────────────────────────
//
// Distributes N instances around (a portion of) a circle.
//
// Angle convention:
//   0° = 12 o'clock (top) — matches RepeaterResolver.polar() so radial
//   arrays look identical to the existing virtual Repeater.
//
// closed flag:
//   true  → angleStep = totalAngleDeg / count
//           (last instance does NOT touch the first; useful for full
//            circles where you want N evenly-spaced positions without
//            duplicating angle 0 == angle 360)
//   false → angleStep = totalAngleDeg / (count - 1)
//           (first and last instances sit at startAngle and
//            startAngle + totalAngle exactly; useful for arcs)
//
// orientToAngle: when true, each instance's rotation is set to the
// tangent angle (face-outward radial).

import type { Layer } from '../types'
import type {
  ArrayInstanceTransform,
  RadialArraySettings,
} from './ArrayTypes'

/** Convert degrees to radians, with the "0° = 12 o'clock" convention. */
function degToScreenRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180
}

export function solveRadial(
  source: Layer,
  settings: RadialArraySettings,
): ArrayInstanceTransform[] {
  if (settings.count <= 0) return []

  const angleStep =
    settings.closed
      ? settings.totalAngleDeg / settings.count
      : settings.totalAngleDeg / Math.max(1, settings.count - 1)

  const baseRot = source.transform.rotationDeg
  const baseScaleX = source.transform.scaleX
  const baseScaleY = source.transform.scaleY
  const baseOpacity = source.opacity

  // Center is the pivot point — instances orbit around it. Source's own
  // x/y is the "anchor" — for include-source semantics we keep the source
  // at its true position (index 0), and clones orbit center.
  const centerX = settings.center.x
  const centerY = settings.center.y

  const out: ArrayInstanceTransform[] = []
  for (let i = 0; i < settings.count; i++) {
    const isSourceIndex =
      i === 0 && settings.sourcePolicy === 'include-source'

    if (isSourceIndex) {
      // Source stays exactly where it is.
      out.push({
        index: i,
        position: { x: source.transform.x, y: source.transform.y },
        rotation: baseRot,
        scale: { x: baseScaleX, y: baseScaleY },
        opacity: baseOpacity,
        isSourceIndex: true,
      })
      continue
    }

    const angleDeg = settings.startAngleDeg + i * angleStep
    const rad = degToScreenRad(angleDeg)
    const px = centerX + Math.cos(rad) * settings.radius
    const py = centerY + Math.sin(rad) * settings.radius

    const rotation = settings.orientToAngle
      ? angleDeg + settings.rotationOffsetDeg
      : baseRot

    out.push({
      index: i,
      position: { x: px, y: py },
      rotation,
      scale: { x: baseScaleX, y: baseScaleY },
      opacity: baseOpacity,
      isSourceIndex: false,
    })
  }

  return out
}
