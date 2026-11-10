'use client'
import type { DopeSheetRow } from './types'
import TrackNodeRow from './TrackNodeRow'
import type { RowLayout } from '@/lib/editor/virtualization/RowLayout'
import { WindowedRows } from '@/components/virtualization/WindowedRows'

interface Props {
  rows: DopeSheetRow[]
  selectedLayerId: string | null
  selectedLayerIds?: ReadonlySet<string>
  collapsedNodeIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  onSelectLayer: (id: string | null, additive?: boolean) => void
  layout: RowLayout
  indices: readonly number[]
}

/** Shares both row ordering and native scrolling with the keyframe column. */
export default function DopeSheetHierarchy(props: Props) {
  return <div className="dope-sheet-hierarchy">
    <WindowedRows layout={props.layout} indices={props.indices} rowKey={index => props.rows[index].node.id}
      renderRow={(index, attributes) => <div {...attributes}><TrackNodeRow
      node={props.rows[index].node} isExpanded={!props.collapsedNodeIds.has(props.rows[index].node.id)}
      onToggleExpand={props.onToggleExpand} onSelectLayer={props.onSelectLayer}
      selectedLayerId={props.selectedLayerId} selectedLayerIds={props.selectedLayerIds}
    /></div>} />
  </div>
}
