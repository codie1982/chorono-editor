import type { MenuItem } from '@/components/ui/ContextMenu'
import type { AgentHandoffIntent, AgentHandoffRequest, AgentHandoffTarget } from '@/lib/agentHandoff/prompt'

const choices: ReadonlyArray<{ intent: AgentHandoffIntent; label: string }> = [
  { intent: 'explain', label: 'Explain this selection' },
  { intent: 'diagnose', label: 'Find a problem here' },
  { intent: 'suggest', label: 'Suggest improvements' },
  { intent: 'edit', label: 'Edit this selection…' },
  { intent: 'ask', label: 'Ask a custom question…' },
]

/** Shared menu for the canvas and both layer explorers. Every action copies text. */
export function agentHandoffMenu(target: AgentHandoffTarget, onChoose: (request: AgentHandoffRequest) => void): MenuItem {
  return {
    kind: 'submenu',
    label: 'Send to Agent',
    items: choices.map(({ intent, label }) => ({
      kind: 'action' as const,
      label,
      onSelect: () => onChoose({ intent, layerIds: [...target.layerIds], ...(target.point ? { point: target.point } : {}) }),
    })),
  }
}
