'use client'
import type { DopeSheetRow } from './types'
import TrackNodeRow from './TrackNodeRow'

interface Props {
  rows: DopeSheetRow[]
  selectedLayerId: string | null
  collapsedNodeIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  onSelectLayer: (id: string | null) => void
}

/** Shares both row ordering and native scrolling with the keyframe column. */
export default function DopeSheetHierarchy(props: Props) {
  return <div className="dope-sheet-hierarchy">
    {props.rows.map(({ node }) => <TrackNodeRow
      key={node.id} node={node} isExpanded={!props.collapsedNodeIds.has(node.id)}
      onToggleExpand={props.onToggleExpand} onSelectLayer={props.onSelectLayer}
      selectedLayerId={props.selectedLayerId}
    />)}
  </div>
}
