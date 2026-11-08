'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MCPHost } from '@/lib/mcp/editor'
import {withEditorReply} from '@/lib/mcp/output/EditorReply'
import type { BridgeJob } from '@/lib/mcp/protocol'

export function useMCPBridge(host: MCPHost) {
  const hostRef = useRef(host)
  hostRef.current = host
  const [enabled, setEnabled] = useState(false)
  const [connection, setConnection] = useState<{ id: string; token: string } | null>(null)
  const [status, setStatus] = useState('Disconnected')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController>()
  const connectionRef = useRef(connection)
  connectionRef.current = connection

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/mcp?op=status', { signal: controller.signal }).then(r => r.json()).then(data => setEnabled(data.enabled === true)).catch(() => {})
    return () => controller.abort()
  }, [])

  const disconnect = useCallback(async () => {
    abortRef.current?.abort()
    const current = connectionRef.current
    connectionRef.current = null
    setConnection(null)
    setStatus('Disconnected')
    hostRef.current.isolateTimelines(null)
    hostRef.current.setRuntimeTest(false)
    if (current) await fetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.token}` }, body: JSON.stringify({ op: 'disconnect', sessionId: current.id }) }).catch(() => {})
  }, [])

  const connect = useCallback(async () => {
    try {
      setError(''); setStatus('Connecting…')
      const response = await fetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'pair', label: hostRef.current.editor.getScene().composition.id || 'Chorono scene' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setConnection(data)
      setStatus('Connected')
    } catch (error) { setError((error as Error).message); setStatus('Disconnected') }
  }, [])

  useEffect(() => {
    if (!connection) return
    const controller = new AbortController()
    abortRef.current = controller
    let stopped = false
    async function run() {
      while (!controller.signal.aborted && !stopped) {
        try {
          const response = await fetch(`/api/mcp?sessionId=${connection!.id}`, { headers: { Authorization: `Bearer ${connection!.token}` }, signal: controller.signal })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error)
          const job: BridgeJob | null = data.job
          if (!job) continue
          setStatus(`Running ${job.method}`)
          const {error}=await withEditorReply(job,hostRef.current,connection!.id,async(body,signal)=>{
            const reply=await fetch('/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection!.token}`},body,signal})
            await reply.body?.cancel()
            if(!reply.ok)throw new Error('Unable to deliver MCP result; read the scene before retrying')
          },{signal:controller.signal})
          setStatus('Connected')
          setError(error ?? '')
        } catch (failure) {
          if (!controller.signal.aborted) { setError((failure as Error).message); setStatus('Connection lost'); stopped = true; setConnection(null) }
        }
      }
    }
    void run()
    return () => { controller.abort() }
  }, [connection])

  return { enabled, connected: !!connection, sessionId: connection?.id, status, error, connect, disconnect }
}
