'use client'
import DropdownButton from './DropdownButton'
import { exportMenuItems, type ExportActions } from './exportMenuItems'

/** Compact access to the existing export operations, shared with FileMenu. */
export default function ExportMenu(props: ExportActions) {
  return <DropdownButton label="Export" sections={[{ label: 'Formats', items: exportMenuItems(props) }]} />
}
