'use client'
import type { SnapSettingsHook } from '@/app/hooks/useSnapSettings'
import { SnapSettingsMenu } from '../canvas/controls/SnapSettingsMenu'

/** Compatibility documentation host. Snap is no longer registered as a dock
 * panel; legacy imports resolve to the single canonical viewport menu. */
export default function SnapPanel({ snap }: { snap: SnapSettingsHook }) {
  return <div className="flex justify-end p-3"><SnapSettingsMenu snap={snap} /></div>
}
export type { SnapSettings } from '@/app/hooks/useSnapSettings'
