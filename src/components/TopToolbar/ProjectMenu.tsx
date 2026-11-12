'use client'
import type { FileVersioningState } from '@/app/hooks/useFileVersioning'
import type { MenuActionItem } from '@/components/ui/ContextMenu'
import DropdownButton from './DropdownButton'

export interface ProjectMenuProps {
  mounted: boolean; state: FileVersioningState; directoryName: string | null
  lastSavedAt: Date | null; snapshotCount: number; isSupported: boolean
  onPickDirectory: () => void; onSaveSnapshot: () => void
  onSaveSceneJson: () => void; onCopySceneJson: () => void; onInspectJson: () => void
  sessionInfo?: { id: string; undo: number; redo: number }
}

/** Project persistence/inspection UI. Replaces the standalone folder/version
 * control and JSON button; borrows the existing file-versioning hook state,
 * owns no directory handle, timer, scene mutation or duplicate save workflow.
 * Download/inspection remain available when folder saving is unsupported.
 */
export default function ProjectMenu(props: ProjectMenuProps) {
  const canVersion = props.mounted && props.isSupported && props.state !== 'unsupported'
  const hasDirectory = !!props.directoryName && props.state !== 'no-directory'
  const action = (label: string, onSelect: () => void, disabled = false): MenuActionItem => ({ kind: 'action', label, onSelect, disabled })
  const status = !props.mounted ? 'Checking automatic saving…'
    : !canVersion ? 'Automatic folder saving is unavailable in this browser. Use Save Scene JSON.'
    : props.state === 'error' ? `Save failed${props.directoryName ? ` · ${props.directoryName}` : ''}. Choose a folder or try saving a version again.`
    : !hasDirectory ? 'Choose a folder for session files and timestamped versions.'
    : props.state === 'saving' ? `Saving… · ${props.directoryName}`
    : `${props.directoryName}${props.lastSavedAt ? ` · Saved ${props.lastSavedAt.toLocaleTimeString()}` : ''} · ${props.snapshotCount} versions`
  const sessionStatus=props.sessionInfo?`\nSession: ${props.sessionInfo.id}\nUndo: ${props.sessionInfo.undo} · Redo: ${props.sessionInfo.redo}`:''
  return <DropdownButton label="Project" status={status+sessionStatus} sections={[
    { label: 'Save', items: [action('Save Scene JSON', props.onSaveSceneJson),
      action(hasDirectory ? 'Change Save Folder…' : 'Choose Save Folder…', props.onPickDirectory, !canVersion),
      action('Save Version', props.onSaveSnapshot, !canVersion || !hasDirectory || props.state === 'saving')] },
    { label: 'Inspect', items: [action('Inspect Scene JSON…', props.onInspectJson), action('Copy Scene JSON', props.onCopySceneJson)] },
  ]} />
}
