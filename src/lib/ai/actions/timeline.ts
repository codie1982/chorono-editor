// ── Timeline Actions ──────────────────────────────────────────────────────────

import { errorCmd } from './_shared'
import type { Timeline } from '@/lib/types'
import { makeAddTimelineCmd } from '@/lib/editor/commands-timeline'
import type { ActionRegistry } from '../ActionRegistry'

interface CreateTimelineParams {
  id: string
  durationMs: number
  autoplay?: boolean
  loop?: boolean
  loopCount?: number
  pingPong?: boolean
}

export function registerTimelineActions(reg: ActionRegistry): void {
  reg.register<CreateTimelineParams>({
    id: 'timeline.create',
    toolName: 'create_timeline',
    description:
      'Create an animation timeline. You MUST create a timeline before calling ' +
      'add_keyframes. Set a meaningful id (e.g. "intro", "loop_anim") — you will ' +
      'reference it in add_keyframes.',
    parameters: {
      type: 'object',
      required: ['id', 'durationMs'],
      properties: {
        id:         { type: 'string', description: 'Unique timeline id e.g. "intro_anim"' },
        durationMs: { type: 'number', description: 'Total timeline duration in milliseconds' },
        autoplay:   { type: 'boolean', description: 'Start playing automatically on load' },
        loop:       { type: 'boolean', description: 'Loop the timeline indefinitely' },
        loopCount:  { type: 'number', description: 'Number of loops (0 = infinite). Only when loop=true' },
        pingPong:   { type: 'boolean', description: 'Play forward then backward' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.id || p.durationMs == null) {
        return errorCmd(`create_timeline missing required field (id="${p.id}" durationMs="${p.durationMs}")`)
      }
      if (scene.timelines.some((t) => t.id === p.id)) {
        return errorCmd(`timeline id "${p.id}" already exists`)
      }
      const tl: Timeline = {
        id:         p.id,
        durationMs: p.durationMs,
        autoplay:   p.autoplay ?? false,
        loop:       p.loop ?? false,
        ...(p.loopCount != null ? { loopCount: p.loopCount } : {}),
        ...(p.pingPong            ? { pingPong: true }       : {}),
        tracks: [],
      }
      return makeAddTimelineCmd(tl)
    },
  })
}

