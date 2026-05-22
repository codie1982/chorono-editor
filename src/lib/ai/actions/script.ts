// ── AI Script Action (BL-76 Sprint 5) ─────────────────────────────────────────
// Lets the AI planner run a JS authoring script via the SAME scene API + engine
// the human REPL uses. Unifies the mutation path: granular tools (add_layer…)
// stay for simple edits; run_script handles procedural/repetitive animation
// (loops, math, batch). The planner chooses per task.

import { errorCmd } from './_shared'
import type { ActionRegistry } from '../ActionRegistry'
import { compileScript } from '../../script/ScriptRunner'

interface RunScriptParams {
  code: string
}

export function registerScriptActions(reg: ActionRegistry): void {
  reg.register<RunScriptParams>({
    id: 'script.run',
    toolName: 'run_script',
    description:
      'Run a JavaScript authoring script against the scene. PREFER THIS for ' +
      'procedural or repetitive animation (loops, math, many similar layers, ' +
      'staggered timing) — far more compact than dozens of add_layer/add_keyframes ' +
      'calls. Use the granular tools instead for one or two precise edits.\n' +
      'Scene API:\n' +
      "  const h = scene.add(kind)   // kind: 'rect','circle','text','image',…\n" +
      '  h.pos = [x, y]              // top-left origin, px\n' +
      '  h.size = [w, h]\n' +
      '  h.opacity = 0..1\n' +
      '  h.rotation = degrees\n' +
      '  h.scale = [sx, sy]\n' +
      "  h.fill = '#rrggbb'\n" +
      "  h.key(prop, timeMs, value) // keyframe; prop e.g. 'opacity','transform.x'\n" +
      '  scene.find(name) | scene.get(id) | scene.layers | scene.remove(h) | scene.log(...)\n' +
      'All edits commit as ONE undo step. Standard JS (for/if/Math) is available.',
    parameters: {
      type: 'object',
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description:
            'JavaScript script body. `scene` is injected. Example: ' +
            "for (let i=0;i<8;i++){const d=scene.add('circle');" +
            'd.pos=[180+Math.cos(i/8*6.28)*80,120+Math.sin(i/8*6.28)*80];' +
            "d.key('opacity',i*60,0);d.key('opacity',i*60+300,1);}",
        },
      },
    },
    toCommand: (p, scene) => {
      if (!p.code || typeof p.code !== 'string') {
        return errorCmd('run_script requires a "code" string')
      }
      const { result, command } = compileScript(p.code, scene, { label: 'AI: Script' })
      if (!result.ok) {
        return errorCmd(result.error ?? 'script failed')
      }
      // command may be null if the script produced no edits — that's a no-op.
      return command
    },
  })
}
