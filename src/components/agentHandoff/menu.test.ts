import { describe, expect, it, vi } from 'vitest'
import type { MenuActionItem, MenuSubmenuItem } from '../ui/ContextMenu'
import { agentHandoffMenu } from './menu'

describe('selection Agent context menu', () => {
  it('groups contextual transfers and the shared agent connection entry under Agent', () => {
    const handoff = vi.fn(), connections = vi.fn()
    const menu = agentHandoffMenu({ layerIds: ['first', 'second'], point: { x: 20, y: 30 } }, handoff, connections) as MenuSubmenuItem
    expect(menu.label).toBe('Agent')
    const actions = menu.items.filter((item): item is MenuActionItem => item.kind === 'action')
    expect(actions.map(item => item.label)).toEqual([
      'Copy selection context', 'Explain this selection', 'Find a problem here',
      'Suggest improvements', 'Edit this selection…', 'Ask a custom question…', 'Agent connections…', 'Selection & agent help…',
    ])
    actions.filter(item => item.label !== 'Selection & agent help…').forEach(item => item.onSelect())
    expect(handoff.mock.calls.map(([request]) => request.intent)).toEqual(['context', 'explain', 'diagnose', 'suggest', 'edit', 'ask'])
    expect(handoff.mock.calls.every(([request]) => request.layerIds.join(',') === 'first,second')).toBe(true)
    expect(connections).toHaveBeenCalledOnce()
  })

  it('opens help without a connection, scene transfer or opener access', () => {
    const open = vi.fn(), handoff = vi.fn()
    vi.stubGlobal('window', { open })
    try {
      const menu = agentHandoffMenu({ layerIds: [] }, handoff) as MenuSubmenuItem
      const help = menu.items.find((item): item is MenuActionItem => item.kind === 'action' && item.label === 'Selection & agent help…')!
      help.onSelect()
      const [href, target, features] = open.mock.calls[0]
      const url = new URL(href)
      expect(url.origin).toBe('https://www.chorono.com')
      expect(url.pathname).toBe('/docs/ai/edit-selection')
      expect(url.hash).toBe('#use-the-agent-menu')
      expect(url.searchParams.get('utm_campaign')).toBe('editor_help')
      expect(target).toBe('_blank')
      expect(features).toBe('noopener,noreferrer')
      expect(handoff).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('isolates each transferred target and point without triggering connection management', () => {
    const target = { layerIds: ['first'], point: { x: 20, y: 30 } }, handoff = vi.fn(), connections = vi.fn()
    const menu = agentHandoffMenu(target, handoff, connections) as MenuSubmenuItem
    const copy = menu.items[0] as MenuActionItem
    copy.onSelect()
    const request = handoff.mock.calls[0][0]
    request.layerIds.push('other'); request.point.x = 999
    copy.onSelect()
    expect(handoff.mock.calls[1][0]).toEqual({ intent: 'context', layerIds: ['first'], point: { x: 20, y: 30 } })
    expect(target).toEqual({ layerIds: ['first'], point: { x: 20, y: 30 } })
    expect(connections).not.toHaveBeenCalled()
  })
})
