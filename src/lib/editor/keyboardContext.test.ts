import { describe, expect, it } from 'vitest'
import { canvasOwnsPointDeletion, deletionTargetForPanel, panelFromAttribute, shortcutContextForPanel } from './keyboardContext'
import { ShortcutRegistry } from '../shortcuts/ShortcutRegistry'
import { defaultBindings } from '../shortcuts/defaultBindings'

describe('animation keyboard context', () => {
  it('keeps resource inspection from deleting scene objects or selected keyframes', () => {
    expect(panelFromAttribute('resourceMonitor', 'canvas')).toBe('resourceMonitor')
    expect(shortcutContextForPanel('resourceMonitor')).toBe('global')
    expect(deletionTargetForPanel('resourceMonitor', true, true)).toBe('none')
    expect(deletionTargetForPanel('resourceMonitor', false, true)).toBe('none')
  })
  it('preserves the origin panel through portal menus, while real panel clicks change it', () => {
    expect(panelFromAttribute(undefined, 'curveEditor')).toBe('curveEditor')
    expect(panelFromAttribute(null, 'dopeSheet')).toBe('dopeSheet')
    expect(panelFromAttribute('canvas', 'timeline')).toBe('canvas')
    expect(panelFromAttribute('dopeSheet', 'canvas')).toBe('dopeSheet')
  })

  it('never lets a selected spline point intercept animation Delete or an open drag', () => {
    expect(canvasOwnsPointDeletion('timeline', false)).toBe(false)
    expect(canvasOwnsPointDeletion('canvas', true)).toBe(false)
    expect(canvasOwnsPointDeletion('canvas', false)).toBe(true)
  })
  it.each(['dopeSheet', 'curveEditor'] as const)('%s cannot delete an object through an empty key selection', (panel) => {
    expect(shortcutContextForPanel(panel)).toBe('timeline')
    expect(deletionTargetForPanel(panel, false, true)).toBe('none')
    expect(deletionTargetForPanel(panel, true, true)).toBe('keyframes')
  })

  it('keeps main timeline animation deletion and canvas object deletion distinct', () => {
    expect(deletionTargetForPanel('timeline', false, true)).toBe('animation')
    expect(deletionTargetForPanel('canvas', true, true)).toBe('layer')
    expect(deletionTargetForPanel('canvas', false, false)).toBe('none')
  })

  it('deletes an audio clip body in the main timeline while preserving key priority and other views', () => {
    expect(deletionTargetForPanel('timeline', false, true, 'audio')).toBe('layer')
    expect(deletionTargetForPanel('timeline', true, true, 'audio')).toBe('keyframes')
    expect(deletionTargetForPanel('timeline', false, true, 'shape')).toBe('animation')
    expect(deletionTargetForPanel('timeline', false, false, 'audio')).toBe('none')
    for (const panel of ['dopeSheet', 'curveEditor'] as const) {
      expect(deletionTargetForPanel(panel, false, true, 'audio')).toBe('none')
      expect(deletionTargetForPanel(panel, true, true, 'audio')).toBe('keyframes')
    }
  })

  it('resolves copy/paste within every animation view without selecting a canvas tool', () => {
    const registry = new ShortcutRegistry()
    registry.registerAll(defaultBindings)
    const event = (key: string) => ({ key, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }) as KeyboardEvent
    for (const panel of ['timeline', 'dopeSheet', 'curveEditor'] as const) {
      const context = shortcutContextForPanel(panel)
      expect(registry.resolve(event('c'), context)).toBe('canvas.select.copy')
      expect(registry.resolve(event('v'), context)).toBe('canvas.select.paste')
      expect(registry.resolve({ ...event('v'), metaKey: false } as KeyboardEvent, context)).toBeNull()
    }
  })
})
