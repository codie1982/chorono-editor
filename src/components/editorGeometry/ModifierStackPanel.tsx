'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeBakeModifierStackCmd, makeExecuteModifierStackCmd, makeMoveModifierCmd, makeRemoveModifierCmd,
  makeSetModifierSourceCmd, makeToggleModifierCmd, prepareAddModifier } from '@/lib/editor/modifiers/commands'
import { geometryModifierRegistry, modifierStackService, modifierOutputReadOnly, type ModifierRecord } from '@/lib/modifiers'
import type { Layer } from '@/lib/types'
import type { GeometryEditPanelProps } from './GeometryEditPanel'
import { ModifierPicker } from './ModifierPicker'
import { ModifierActionIcon } from './ModifierActionIcon'
import { ModifierSettingsForm } from './ModifierSettingsForm'
import { ModifierSourceSettings } from './ModifierSourceSettings'

const iconButton = 'flex min-h-8 min-w-8 items-center justify-center rounded text-gray-300 hover:bg-gray-700 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-30'
type Draft = { base: ModifierRecord; patch: Readonly<Record<string, unknown>> }

/** Real persisted stack with instance-scoped drafts. Registry descriptors drive
 * choices/forms; execution commands alone own scene writes and history. A row's
 * check executes its pending settings through the complete pipeline. The main
 * Execute applies every current draft atomically. Undo invalidates stale drafts
 * by record identity, without discarding unrelated unsaved row settings. */
export default function ModifierStackPanel(props: GeometryEditPanelProps & { layer: Layer }) {
  const { layer } = props
  const stack = useMemo(() => modifierStackService.stackFor(layer), [layer])
  const [selected, setSelected] = useState(stack.modifiers.at(-1)?.id ?? 'source')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState(''), [status, setStatus] = useState('')
  const alert = useRef<HTMLParagraphElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // Scroll only the bounded list, keeping Execute/pickers/settings in place.
  useEffect(() => {
    const region = list.current
    if (!region) return
    if (selected === 'source') { region.scrollTop = 0; return }
    const row = Array.from(region.querySelectorAll<HTMLElement>('[data-modifier-id]')).find(item => item.dataset.modifierId === selected)
    if (!row) return
    const view = region.getBoundingClientRect(), bounds = row.getBoundingClientRect()
    if (bounds.top < view.top) region.scrollTop += bounds.top - view.top
    else if (bounds.bottom > view.bottom) region.scrollTop += bounds.bottom - view.bottom
  }, [selected, stack.modifiers])
  useEffect(() => { if (error) alert.current?.focus() }, [error])
  useEffect(() => {
    setSelected(value => value === 'source' || stack.modifiers.some(item => item.id === value) ? value : stack.modifiers.at(-1)?.id ?? 'source')
    setDrafts(before => Object.fromEntries(Object.entries(before).filter(([id, draft]) => stack.modifiers.find(item => item.id === id) === draft.base)))
  }, [stack])
  const scene = props.getScene()
  const disabled = !!(props.conversionDisabled || layer.locked || layer.frozen || layer.hidden || layer.instanceOf)
  const input = useMemo(() => modifierStackService.evaluator.execute(stack, { layerId: layer.id }), [stack, layer.id])
  const available = geometryModifierRegistry.list().filter(item => item.addable && item.inputs.includes(input.kind))
  const patches = Object.fromEntries(stack.modifiers.flatMap(record => drafts[record.id]?.base === record ? [[record.id, drafts[record.id].patch]] : []))
  const selectedRecord = stack.modifiers.find(item => item.id === selected)
  const selectedDescriptor = selectedRecord ? geometryModifierRegistry.get(selectedRecord.type).descriptor : undefined
  const activeDraft = selectedRecord && drafts[selectedRecord.id]?.base === selectedRecord ? { ...selectedRecord.settings, ...drafts[selectedRecord.id].patch } : selectedRecord?.settings
  const run = (create: () => EditorCommand, message: string) => {
    try {
      if (disabled || props.isTransactionActive() || props.getDocumentSignal().aborted) throw new Error('Finish the current edit before executing modifiers.')
      props.dispatchCommand(create()); props.onClearPoint(); setError(''); setStatus(message); return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setStatus(''); return false }
  }
  const execute = (id?: string) => {
    const patch = id ? (patches[id] ? { [id]: patches[id] } : {}) : patches
    if (run(() => makeExecuteModifierStackCmd(props.getScene(), layer.id, patch), 'Stack executed.'))
      setDrafts(before => id ? Object.fromEntries(Object.entries(before).filter(([key]) => key !== id)) : {})
  }
  const add = (type: string) => {
    let id = '', warning = ''
    if (run(() => {
      const plan = prepareAddModifier(props.getScene(), layer.id, type, {
        pointIds: props.selectedPointIds ?? (props.selectedPointId ? [props.selectedPointId] : []), contourIds: props.selectedContourIds,
      })
      id = plan.modifierId; warning = plan.warning ?? ''; return plan.command
    }, 'Modifier added.')) { setSelected(id); if (warning) setError(warning) }
  }
  return <section aria-label="Modifier stack" data-editor-input-scope className="min-w-0 space-y-3 rounded-lg border border-gray-700 bg-gray-950/20 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Modifier stack</h3>
      <button type="button" disabled={disabled || !stack.modifiers.length} onClick={() => execute()} className="min-h-8 rounded border border-orange-400/50 bg-orange-500/10 px-3 py-1.5 text-orange-100 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-30">Execute stack</button>
    </div>
    <p className="text-gray-400">Source → modifiers, top to bottom → result. Edit settings, then Execute.</p>
    {error && <p ref={alert} tabIndex={-1} role="alert" className="rounded border border-amber-600/60 bg-amber-950/30 p-2 text-amber-200 focus:outline-none">{error}</p>}
    {status && <p role="status" className="text-gray-300">{status}</p>}
    <div ref={list} role="region" tabIndex={0} className="space-y-1 overflow-y-auto overscroll-contain rounded border border-gray-700 bg-gray-950/40 p-2 focus-visible:outline focus-visible:outline-orange-300"
      style={{ maxHeight: 'min(18rem, 35vh)' }} aria-label="Ordered modifiers">
      <button type="button" onClick={() => setSelected('source')} aria-pressed={selected === 'source'} className={`min-h-9 w-full rounded border px-2.5 py-1.5 text-left ${selected === 'source' ? 'border-orange-400/60 bg-orange-500/10' : 'border-gray-700 bg-gray-800'}`}>
        Source · {stack.source.kind === 'shape' ? stack.source.sources.length > 1 ? `Union (${stack.source.sources.length})` : 'Basic Shape' : stack.source.kind === 'spline' ? 'Spline' : '2D Mesh'}
      </button>
      {stack.modifiers.map((record, index) => {
        const descriptor = geometryModifierRegistry.get(record.type).descriptor, dirty = record.id in patches
        return <div key={record.id} data-modifier-id={record.id} className={`flex flex-wrap items-center gap-0.5 rounded border ${selected === record.id ? 'border-orange-400/60 bg-orange-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <label title={record.enabled ? 'Disable modifier' : 'Enable modifier'} className="flex min-h-9 min-w-8 items-center justify-center">
            <input type="checkbox" aria-label={`Enable ${descriptor.label} ${index + 1}`} checked={record.enabled} disabled={disabled}
              className="accent-orange-400" onChange={e => run(() => makeToggleModifierCmd(props.getScene(), layer.id, record.id, e.currentTarget.checked), 'Modifier state updated.')} />
          </label>
          <button type="button" aria-pressed={selected === record.id} onClick={() => setSelected(record.id)} className={`min-h-9 min-w-16 flex-1 px-1 py-1.5 text-left focus-visible:outline focus-visible:outline-orange-300 ${record.enabled ? '' : 'text-gray-400'}`}>
            <span className="mr-1 text-gray-500">{index + 1}.</span>{descriptor.label}{dirty ? ' •' : ''}{!record.enabled ? ' · Off' : ''}
          </button>
          <div className="ml-auto flex items-center">
            <button type="button" aria-label={`Execute ${descriptor.label} settings ${index + 1}`} title="Execute settings through the whole stack" className={iconButton} disabled={disabled || !dirty} onClick={() => execute(record.id)}><ModifierActionIcon action="apply" /></button>
            <button type="button" aria-label={`Move ${descriptor.label} up ${index + 1}`} title="Move up" disabled={disabled || index === 0} className={iconButton} onClick={() => run(() => makeMoveModifierCmd(props.getScene(), layer.id, record.id, -1), 'Modifier moved.')}><ModifierActionIcon action="up" /></button>
            <button type="button" aria-label={`Move ${descriptor.label} down ${index + 1}`} title="Move down" disabled={disabled || index === stack.modifiers.length - 1} className={iconButton} onClick={() => run(() => makeMoveModifierCmd(props.getScene(), layer.id, record.id, 1), 'Modifier moved.')}><ModifierActionIcon action="down" /></button>
            <button type="button" aria-label={`Remove ${descriptor.label} modifier ${index + 1}`} title="Remove modifier" disabled={disabled} className={iconButton + ' hover:!bg-red-950 hover:!text-red-200'} onClick={() => run(() => makeRemoveModifierCmd(props.getScene(), layer.id, record.id), 'Modifier removed.')}><ModifierActionIcon action="remove" /></button>
          </div>
        </div>
      })}
    </div>
    {(['spline', 'mesh'] as const).map(category => {
      const items = available.filter(item => item.category === category).map(item => ({ id: item.type, label: item.label }))
      return items.length ? <ModifierPicker key={category} kind={category === 'spline' ? 'Spline' : 'Mesh'} items={items} selected="" disabled={disabled} onSelect={type => { if (type) add(type) }} /> : null
    })}
    {selectedRecord && selectedDescriptor && activeDraft && <div className="space-y-3 rounded border border-gray-700 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{selectedDescriptor.label}</h4><span className="text-gray-400">{selectedDescriptor.category === 'spline' ? 'Spline' : 'Mesh'} modifier</span></div>
      {selectedDescriptor.description && <p className="text-gray-400">{selectedDescriptor.description}</p>}
      <ModifierSettingsForm descriptor={selectedDescriptor} settings={activeDraft} disabled={disabled} assets={scene.assets}
        pointIds={props.selectedPointIds ?? (props.selectedPointId ? [props.selectedPointId] : [])} contourIds={props.selectedContourIds}
        onChange={patch => setDrafts(before => ({ ...before, [selectedRecord.id]: { base: selectedRecord, patch: { ...(before[selectedRecord.id]?.base === selectedRecord ? before[selectedRecord.id].patch : {}), ...patch } } }))} />
      {selectedRecord.id in patches && <p className="text-orange-200">Pending settings · Execute to update the object.</p>}
    </div>}
    {selected === 'source' && <ModifierSourceSettings source={stack.source} disabled={disabled}
      onExecute={source => run(() => makeSetModifierSourceCmd(props.getScene(), layer.id, source, true), 'Source rebuilt and stack executed.')} />}
    {modifierOutputReadOnly(layer) && <p className="text-gray-400">Geometry comes from the stack. Disable geometry modifiers or Bake stack to edit points directly.</p>}
    {!!layer.modifierStack && <button type="button" disabled={disabled} className="min-h-8 rounded border border-gray-700 px-3 py-1.5 text-gray-300 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-40"
      onClick={() => run(() => makeBakeModifierStackCmd(props.getScene(), layer.id), 'Stack baked to editable geometry.')}>Bake stack</button>}
  </section>
}
