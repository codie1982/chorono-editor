'use client'
import { useEffect, useRef, useState } from 'react'
import type { AgentHandoffContext } from '@/lib/agentHandoff/prompt'

interface Props {
  intent: 'edit' | 'ask'
  context: AgentHandoffContext
  onCopy: (detail: string) => Promise<boolean>
  onClose: () => void
}

export default function AgentHandoffDialog({ intent, context, onCopy, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [detail, setDetail] = useState('')
  const [copying, setCopying] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [])
  const submit = async () => {
    if (!detail.trim() || copying) return
    setCopying(true)
    try {
      if (await onCopy(detail.trim())) onClose()
    } finally {
      setCopying(false)
    }
  }
  return (
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose() }}
      aria-labelledby="agent-handoff-title"
      className="w-[min(92vw,32rem)] rounded-lg border border-gray-700 bg-gray-900 p-5 text-gray-100 shadow-2xl backdrop:bg-black/60">
      <h2 id="agent-handoff-title" className="text-base font-semibold">
        {intent === 'edit' ? 'Edit with an agent' : 'Ask an agent'}
      </h2>
      <p className="mt-2 text-sm text-gray-400">
        Focus: {context.layers.map(layer => layer.name || layer.id).join(', ')}
      </p>
      <label htmlFor="agent-handoff-detail" className="mt-4 block text-sm text-gray-200">
        {intent === 'edit' ? 'Describe the change' : 'Your question'}
      </label>
      <textarea id="agent-handoff-detail" autoFocus rows={4} value={detail}
        onChange={event => setDetail(event.target.value)}
        className="mt-2 w-full resize-y rounded border border-gray-600 bg-gray-800 p-3 text-sm text-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" />
      <p className="mt-2 text-xs text-gray-400">The prompt will be copied for you to paste into your agent chat.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded px-3 py-2 text-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">Cancel</button>
        <button type="button" disabled={!detail.trim() || copying} onClick={() => { void submit() }}
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
          {copying ? 'Copying…' : 'Copy prompt'}
        </button>
      </div>
    </dialog>
  )
}
