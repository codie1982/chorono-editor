'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useInactiveSurface } from '@/components/ui/useInactiveSurface'
import { documentationUrl } from '@/components/help/documentation'
import { EDITOR_DISPLAY, editorDisplayState } from './displayPolicy'
import { EditorDisplayContext, useEditorDisplay } from './useEditorDisplay'

/** Mount recovery/editor/resource owners only on a supported display. After
 * first startup, retain that subtree and its last usable dimensions when the
 * window shrinks: source/history/session ownership survives without a layout
 * persistence rewrite. In-flight source gestures cancel rather than commit.
 * Availability context pauses transport and native gestures in their owners.
 * The notice is modal and focusable; users can resize/hot-plug without reload.
 */
export function EditorDisplayBoundary({ children }: { children: ReactNode }) {
  const snapshot = useEditorDisplay(), state = snapshot && editorDisplayState(snapshot)
  const available = state === 'supported', blocked = !available
  const [started, setStarted] = useState(false)
  const size = useRef<{ width: number; height: number } | null>(null)
  const workspace = useInactiveSurface<HTMLDivElement>(blocked), notice = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (available && snapshot) { size.current = snapshot; setStarted(true) }
  }, [available, snapshot])
  useEffect(() => {
    const element = notice.current
    if (state && blocked && element) {
      element.showModal(); element.focus({ preventScroll: true })
      return () => { if (element.open) element.close() }
    }
  }, [state, blocked])
  const retained = started || available
  return <div className="relative h-dvh w-full overflow-hidden bg-gray-950 text-gray-100" data-editor-display={state ?? 'checking'}>
    <EditorDisplayContext.Provider value={available}>
      {retained && <div ref={workspace} aria-hidden={blocked || undefined} data-testid="editor-display-workspace"
        className="absolute left-0 top-0 h-full w-full" style={blocked ? {
          visibility: 'hidden', width: size.current?.width, height: size.current?.height,
        } : undefined}>{children}</div>}
    </EditorDisplayContext.Provider>
    {!snapshot ? <div role="status" className="flex min-h-dvh items-center justify-center p-6 text-sm text-gray-300">Checking workspace size…</div>
      : blocked && <dialog ref={notice} aria-modal="true" aria-labelledby="display-title" aria-describedby="display-description" tabIndex={-1}
        onCancel={event => event.preventDefault()}
        data-testid="editor-display-notice" className="fixed inset-0 m-0 h-dvh w-full max-h-none max-w-none overflow-y-auto border-0 bg-gray-950 p-6 text-gray-100 outline-none sm:p-10"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() }
          if (event.key !== 'Tab') return
          const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'))
          const index = links.indexOf(document.activeElement as HTMLAnchorElement)
          const next = index < 0 ? (event.shiftKey ? links.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + links.length) % links.length
          event.preventDefault(); links[next]?.focus()
        }}>
        <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-lg flex-col justify-center py-6">
          <svg aria-hidden="true" className="mb-7 h-12 w-12 text-blue-400" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="7" width="38" height="27" rx="3" /><path d="M17 42h14M24 34v8M11 13h26M11 18h9v10h-9zM25 18h12M25 23h9" />
          </svg>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-300">Chorono Editor</p>
          <h1 id="display-title" className="text-3xl font-semibold leading-tight tracking-tight">A desktop workspace is required</h1>
          <p id="display-description" className="mt-4 text-base leading-relaxed text-gray-300">{state === 'too-small'
            ? `Use a browser window at least ${EDITOR_DISPLAY.minWidth} × ${EDITOR_DISPLAY.minHeight} pixels to keep the canvas, panels and Timeline usable.`
            : 'Connect a mouse or trackpad to use the editor’s precise handles and context menus. Touch-only editing is not supported yet.'}</p>
          <dl className="my-6 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm">
            <dt className="text-gray-400">Current window</dt><dd className="text-right tabular-nums">{snapshot.width} × {snapshot.height} px</dd>
            <dt className="text-gray-400">Minimum window</dt><dd className="text-right tabular-nums">{EDITOR_DISPLAY.minWidth} × {EDITOR_DISPLAY.minHeight} px</dd>
            <dt className="text-gray-400">Input</dt><dd className="text-right">Mouse or trackpad</dd>
          </dl>
          <p className="text-sm leading-relaxed text-gray-400">{started
            ? 'Your open workspace is kept in this tab. Enlarge the window to continue; playback stays paused.'
            : 'Phones and touch-only tablets cannot open the editor yet. On a larger screen, the editor opens automatically.'}</p>
          <nav className="mt-7 flex flex-wrap gap-3" aria-label="Display support links">
            <a href={documentationUrl('editor/projects')} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300">Editor guide</a>
            <a href="https://www.chorono.com" className="inline-flex min-h-11 items-center rounded-md border border-gray-600 px-4 text-sm font-medium text-gray-200 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300">Chorono home</a>
          </nav>
        </div>
      </dialog>}
  </div>
}
