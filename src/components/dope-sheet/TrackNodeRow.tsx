'use client'
import type { TrackNode } from './types'

interface Props {
  node: TrackNode
  isExpanded: boolean
  onToggleExpand: (nodeId: string) => void
  onSelectLayer: (id: string | null, additive?: boolean) => void
  selectedLayerId: string | null
  selectedLayerIds?: ReadonlySet<string>
}

export default function TrackNodeRow({ node, isExpanded, onToggleExpand, onSelectLayer, selectedLayerId, selectedLayerIds }: Props) {
  const isSelected = !!node.layerId && (node.layerId === selectedLayerId || !!selectedLayerIds?.has(node.layerId))
  const hasChildren = node.children.length > 0
  return <div className={`track-node-row ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: 6 + node.depth * 12 }}>
    {hasChildren
      ? <button type="button" className="expand-toggle" onClick={() => onToggleExpand(node.id)}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`} aria-expanded={isExpanded}>
          {isExpanded ? '▾' : '▸'}
        </button>
      : <span className="expand-spacer" />}
    <span className="node-icon" aria-hidden="true">{node.type === 'property' ? '·' : '◇'}</span>
    {node.layerId
      ? <button type="button" className={`node-name ${node.hasKeys ? 'has-keys' : ''}`}
          onClick={event => onSelectLayer(node.layerId!, event.shiftKey || event.metaKey || event.ctrlKey)} title={node.trackTarget || node.name} aria-pressed={isSelected}>
          {node.name}
        </button>
      : <span className={`node-name ${node.hasKeys ? 'has-keys' : ''}`} title={node.trackTarget || node.name}>{node.name}</span>}
  </div>
}
