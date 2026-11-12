'use client'

import type { SyntheticEvent } from 'react'
import { documentationPages, documentationUrl, type DocumentationTopic } from './documentation'

interface Props {
  topic: DocumentationTopic
  /** Icon-only variant for dense toolbars; its accessible name stays complete. */
  compact?: boolean
  className?: string
}

/** Keep link gestures out of bubbling canvas/toolbar shortcuts and drag handlers.
 * Native focus, navigation, middle-click and context menus remain available. */
function keepLinkInteraction(event: SyntheticEvent): void {
  event.stopPropagation()
}

/** Stateless help control shared by real editor panels and isolated test hosts.
 * Opens the selected canonical guide in another tab with no opener access.
 * It owns no editor state and never dispatches a command or saves a document. */
export function DocumentationHelp({ topic, compact = false, className = '' }: Props) {
  const label = `Help: ${documentationPages[topic]} (opens in a new tab)`
  return (
    <a
      href={documentationUrl(topic)} target="_blank" rel="noopener noreferrer"
      aria-label={label} title={label} data-documentation-topic={topic}
      draggable={false}
      onPointerDown={keepLinkInteraction} onMouseDown={keepLinkInteraction}
      onClick={keepLinkInteraction} onAuxClick={keepLinkInteraction}
      onKeyDown={keepLinkInteraction} onKeyUp={keepLinkInteraction}
      onContextMenu={keepLinkInteraction}
      className={`inline-flex shrink-0 items-center justify-center gap-1 min-h-7 min-w-7 rounded px-1.5 text-[11px] font-medium normal-case tracking-normal text-gray-300 hover:bg-gray-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 ${className}`}
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M7.8 7.5a2.2 2.2 0 0 1 4.4 0c0 1.5-2.2 1.7-2.2 3.5" />
        <path d="M10 13.8h.01" strokeWidth="2" />
      </svg>
      {!compact && <span>Help</span>}
    </a>
  )
}
