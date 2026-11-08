import { Fragment, type ReactNode } from 'react'
import type { RowLayout } from '@/lib/editor/virtualization/RowLayout'

export interface VirtualRowAttributes { 'data-virtual-row': string }

/**
 * Flow-preserving adapter: spacers replace unmounted rows without wrapping a
 * real row or changing its sticky/drag containing block. Owners apply the
 * attributes to their actual element. Stable keys preserve focused controls.
 * A semantic li spacer supports existing ul lists; all gaps are aria-hidden.
 * Indices must be the sorted, unique result of this layout's indices() query.
 */
export function WindowedRows({ layout, indices, rowKey, renderRow, spacerTag = 'div' }: {
  layout: RowLayout; indices: readonly number[]; rowKey: (index: number) => string
  renderRow: (index: number, attributes: VirtualRowAttributes) => ReactNode
  spacerTag?: 'div' | 'li'
}) {
  const Spacer = spacerTag
  let bottom = 0
  const rows = indices.map(index => {
    const gap = layout.top(index) - bottom
    bottom = layout.top(index + 1)
    const key = rowKey(index)
    return <Fragment key={key}>
      {gap > 0 && <Spacer aria-hidden="true" role="presentation" style={{ height: gap, flexShrink: 0 }} />}
      {renderRow(index, { 'data-virtual-row': key })}
    </Fragment>
  })
  return <>{rows}{bottom < layout.height && <Spacer aria-hidden="true" role="presentation"
    style={{ height: layout.height - bottom, flexShrink: 0 }} />}</>
}
