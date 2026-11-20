import type { MenuItem } from '@/components/ui/ContextMenu'
import type { AgentHandoffIntent, AgentHandoffRequest, AgentHandoffTarget } from '@/lib/agentHandoff/prompt'

const choices: ReadonlyArray<{ intent: AgentHandoffIntent; label: string }> = [
  { intent: 'context', label: 'Copy selection context' },
  { intent: 'explain', label: 'Explain this selection' },
  { intent: 'diagnose', label: 'Find a problem here' },
  { intent: 'suggest', label: 'Suggest improvements' },
  { intent: 'edit', label: 'Edit this selection…' },
  { intent: 'ask', label: 'Ask a custom question…' },
]

/** Build the shared Agent submenu for canvas/layer/explorer targets. Handoff
 * actions copy an isolated target and optional composition-space point to the
 * caller; connection management opens the existing shared MCP dialog. This
 * builder neither opens chats nor pairs an editor or mutates scene/selection. */
export function agentHandoffMenu(
  target: AgentHandoffTarget,
  onChoose: (request: AgentHandoffRequest) => void,
  openConnections?: () => void,
): MenuItem {
  return {
    kind: 'submenu',
    label: 'Agent',
    items: [...choices.map(({ intent, label }) => ({
      kind: 'action' as const,
      label,
      onSelect: () => onChoose({ intent, layerIds: [...target.layerIds], ...(target.point ? { point: { ...target.point } } : {}) }),
    })), ...(openConnections ? [
      { kind: 'separator' as const },
      { kind: 'action' as const, label: 'Agent connections…', onSelect: openConnections },
    ] : [])],
  }
}
