import { describe, expect, it } from 'vitest'
import { emptyScene } from '../../defaults'
import { makeSceneGuidesCmd, readSceneGuides, assertSceneGuides, assertCurrentSceneGuide, MAX_SCENE_GUIDES } from './SceneGuides'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { assertScene } from '../../mcp/protocol'
import { portableScene } from '../../mcp/editor'
import { exportToRuntime } from '../../export/runtimeExport'

describe('scene guide source ownership', () => {
  it('rejects stale pointer/delete records before editing while allowing the exact current guide', () => {
    const source = { id: 'a', axis: 'v' as const, position: 10 }
    expect(() => assertCurrentSceneGuide([source], source)).not.toThrow()
    expect(() => assertCurrentSceneGuide([{ ...source, position: 20 }], source)).toThrow('guide changed')
    expect(() => assertCurrentSceneGuide([{ ...source }], source)).toThrow('guide changed')
    expect(() => assertCurrentSceneGuide([], source)).toThrow('guide changed')
  })
  it('adds once, restores missing legacy metadata and redoes stable IDs without touching layers/keys', () => {
    const base = emptyScene(), command = makeSceneGuidesCmd(base, [{ id: 'guide-a', axis: 'v', position: 100.25 }], 'Add guide')
    const next = command.execute(base), undone = command.undo(next), redone = command.execute(undone)
    expect(next.layers).toBe(base.layers); expect(next.timelines).toBe(base.timelines)
    expect(next.editorGuides?.guides[0].position).toBe(100.25)
    expect(Object.hasOwn(undone, 'editorGuides')).toBe(false)
    expect(redone.editorGuides).toEqual(next.editorGuides)
  })
  it('rejects stale commands and locked coordinate edits while allowing unlock/hide/delete', () => {
    const base = makeSceneGuidesCmd(emptyScene(), [{ id: 'a', axis: 'h', position: 42, locked: true }]).execute(emptyScene())
    expect(() => makeSceneGuidesCmd(base, [{ ...base.editorGuides!.guides[0], position: 43 }])).toThrow('Unlock')
    const command = makeSceneGuidesCmd(base, [{ id: 'a', axis: 'h', position: 42, hidden: true }])
    expect(command.execute(base).editorGuides?.guides[0].hidden).toBe(true)
    expect(() => command.execute({ ...base, editorGuides: { version: 1, guides: [] } })).toThrow('changed')
    expect(makeSceneGuidesCmd(base, []).execute(base).editorGuides?.guides).toEqual([])
  })
  it('retains guide data through editable/portable JSON while excluding runtime metadata', async () => {
    const scene = emptyScene(); scene.editorGuides = { version: 1, guides: [{ id: 'a', axis: 'v', position: -12.5, locked: true }, { id: 'b', axis: 'h', position: 51, hidden: true }] }
    const loaded = parseSceneJson(JSON.stringify(await portableScene(scene)), true)
    expect(loaded.editorGuides).toEqual(scene.editorGuides); expect(() => assertScene(loaded)).not.toThrow()
    expect(exportToRuntime(scene)).not.toHaveProperty('editorGuides')
    expect(() => parseSceneJson(JSON.stringify(emptyScene()), true)).not.toThrow()
  })
  it('validates malformed source versions, IDs, positions and bounded counts at JSON/MCP entry points', () => {
    const invalid = [null, { version: 2, guides: [] }, { version: 1, guides: [{ id: 'a', axis: 'z', position: 0 }] },
      { version: 1, guides: [{ id: 'a', axis: 'v', position: Infinity }] },
      { version: 1, guides: [{ id: 'a', axis: 'v', position: 0 }, { id: 'a', axis: 'h', position: 0 }] },
      { version: 1, guides: Array.from({ length: MAX_SCENE_GUIDES + 1 }, (_, i) => ({ id: `a${i}`, axis: 'v', position: i })) }]
    for (const value of invalid) {
      expect(() => assertSceneGuides(value)).toThrow()
      const source = { ...emptyScene(), editorGuides: value }
      expect(() => parseSceneJson(JSON.stringify(source), true)).toThrow()
      expect(() => assertScene(source)).toThrow()
      expect(readSceneGuides(source as unknown as ReturnType<typeof emptyScene>)).toMatchObject({ guides: [], error: expect.any(String) })
    }
  })
})
