'use client'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'

interface Props { enabled: boolean; connected: boolean; sessionId?: string; status: string; error: string; connect: () => Promise<void>; disconnect: () => Promise<void> }

/** Open the same connection dialog from toolbar or contextual Agent menus. */
export interface MCPConnectionHandle { open: () => void }

/** Owns one tab-local MCP pairing dialog; all compatible agent clients share
 * this editor connection. The imperative handle only opens the dialog and
 * never connects/disconnects or launches an external application by itself. */
const MCPConnection = forwardRef<MCPConnectionHandle, Props>(function MCPConnection(props, ref) {
  const dialog = useRef<HTMLDialogElement>(null)
  const open = useCallback(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])
  useImperativeHandle(ref, () => ({ open }), [open])
  return <>
    <button onClick={open} title="Connect agents to this editor" aria-label="MCP editor connection" className="shrink-0 rounded border border-gray-600 px-2 py-1.5 text-xs text-gray-200 hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
      <span aria-hidden="true" className={props.connected ? 'text-emerald-400' : 'text-gray-500'}>● </span>MCP
    </button>
    <dialog ref={dialog} aria-labelledby="mcp-title" className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-5 text-gray-200 backdrop:bg-black/60">
      <div className="flex items-center justify-between gap-3">
        <h2 id="mcp-title" className="text-base font-semibold">Agent connections</h2>
        <DocumentationHelp topic="ai/mcp#open-agent-connections" />
      </div>
      <p className="mt-3 text-sm text-gray-300">Claude Code, Claude Desktop, Codex and other MCP-compatible agents share this editor connection.</p>
      <p className="mt-3 text-sm text-gray-300">Connected AI clients can read this scene, create objects and animations, run isolated scripts, capture previews and save projects.</p>
      <p role="status" className="mt-3 text-sm">{props.status}</p>
      {props.sessionId && <p className="mt-1 break-all text-xs text-gray-400">Session: {props.sessionId}</p>}
      {!props.enabled && <p className="mt-3 text-sm text-amber-300">Local MCP is disabled. Start the editor with <code>npm run dev:mcp</code> or <code>npm run start:mcp</code>.</p>}
      {props.error && <p role="alert" className="mt-3 text-sm text-red-300">{props.error}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <button onClick={() => dialog.current?.close()} className="rounded px-3 py-2 text-sm hover:bg-gray-700">Close</button>
        <button disabled={!props.enabled} onClick={() => { void (props.connected ? props.disconnect() : props.connect()) }} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-40">{props.connected ? 'Disconnect' : 'Connect this editor'}</button>
      </div>
    </dialog>
  </>
})

export default MCPConnection
