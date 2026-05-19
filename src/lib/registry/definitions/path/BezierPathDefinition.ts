// ── Bezier Path LayerDefinition (Pen Tool layer) ─────────────────────────────

import type { Layer } from '@/lib/types'
import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import type { PathDefinition } from '@/lib/geometry'
import { newBezierPathLayer } from '@/lib/defaults'
import { transformGroup, appearanceGroup, strokeGroup, trimGroup } from '../sharedSchemas'

const pathGroup = (): PropertyGroup => ({
  title: 'Path',
  schemas: [
    { id: 'closed', path: 'path.closed', group: 'Path', label: 'Closed', valueType: 'boolean', animatable: false, defaultValue: false },
    // Anchor list is rendered by a custom panel widget — schema is sentinel only
  ],
  showWhen: (l) => l.type === 'path',
})

/** Convert a layer.path (BezierPath with anchor handles) to a NormalizedPathDefinition. */
export const bezierPathToNormalized = (layer: Layer): PathDefinition => {
  const path = layer.path
  if (!path || path.anchors.length === 0) {
    return { closed: false, commands: [] }
  }
  const commands: PathDefinition['commands'] = []
  commands.push({ type: 'M', x: path.anchors[0].x, y: path.anchors[0].y })

  const segCount = path.closed ? path.anchors.length : path.anchors.length - 1
  for (let i = 0; i < segCount; i++) {
    const a = path.anchors[i]
    const b = path.anchors[(i + 1) % path.anchors.length]
    const hasOut = a.outX !== undefined && a.outY !== undefined
    const hasIn  = b.inX  !== undefined && b.inY  !== undefined
    if (hasOut || hasIn) {
      commands.push({
        type: 'C',
        x1: hasOut ? a.outX! : a.x,
        y1: hasOut ? a.outY! : a.y,
        x2: hasIn  ? b.inX!  : b.x,
        y2: hasIn  ? b.inY!  : b.y,
        x:  b.x,
        y:  b.y,
      })
    } else {
      commands.push({ type: 'L', x: b.x, y: b.y })
    }
  }
  if (path.closed) commands.push({ type: 'Z' })
  return { closed: path.closed, commands }
}

export const bezierPathDefinition: LayerDefinition = {
  kind:    'bezierPath',
  label:   'Bezier Path',
  iconKey: 'bezierPath',
  category: 'Path & Vector',
  createDefault: () => newBezierPathLayer(),
  getPropertyGroups: () => [
    transformGroup(),
    appearanceGroup(),
    pathGroup(),
    strokeGroup(),
    trimGroup(),
  ],
  toPath: bezierPathToNormalized,
}
