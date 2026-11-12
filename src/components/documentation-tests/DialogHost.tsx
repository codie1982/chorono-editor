import { useState } from 'react'
import CompositionPresetModal from '../modals/CompositionPresetModal'
import CloneModal from '../modals/CloneModal'
import ArrayModal from '../modals/ArrayModal'
import { useArrayAuthoring } from '../array/useArrayAuthoring'
import { makeCloneForestCmd } from '@/lib/editor/commands-clone-forest'
import RasterExportDialog from '../export/RasterExportDialog'
import SVGExportDialog from '../export/SVGExportDialog'
import SequenceExportDialog from '../export/SequenceExportDialog'
import JsonModal from '../JsonModal'
import TrackBakeDialog from '../timeline/baking/TrackBakeDialog'
import type { DocumentationState } from './useDocumentationState'

/** Mount production dialogs against the isolated editor. Clone and Array use
 * their real command/preview services; exports are real downloadable fixture
 * outputs. Closing never touches another document or browser tab. */
export function DialogHost({ view, state: s }: { view: string; state: DocumentationState }) {
  const [open, setOpen] = useState(true)
  const array = useArrayAuthoring({ editor: s.editor, scene: s.scene, timeMs: s.timeMs,
    selectedLayerIds: s.selectedIds, selectedLayerId: s.selectedId,
    onSelectLayers: ids => { s.select(null); ids.forEach(id => s.select(id, true)) } })
  const close = () => setOpen(false)
  if (view === 'array') return <><button onClick={array.open} className="m-4 rounded bg-blue-600 p-3">Open Array</button>{array.active && <ArrayModal authoring={array} />}</>
  if (!open) return <button onClick={() => setOpen(true)} className="m-4 rounded bg-blue-600 p-3">Reopen dialog</button>
  if (view === 'bake') return <TrackBakeDialog scene={s.scene} editor={s.editor} timelineId={s.timelineId} target="layers.card.transform.x" onClose={close} />
  if (view === 'composition') return <CompositionPresetModal composition={s.scene.composition} onApply={value => { s.updateComposition(value); close() }} onClose={close} />
  if (view === 'clone' && s.layer) return <CloneModal source={s.layer} sourceCount={s.selectedIds.size} hasAnimationOnSource
    onClose={close} onApply={options => {
      const ids = Array.from(s.selectedIds)
      const cmd = makeCloneForestCmd(s.editor.getScene(), { sourceIds: ids, mode: options.mode, count: options.count,
        duplicateAnimation: options.duplicateAnimation, offsets: Object.fromEntries(ids.map(id => [id, { x: options.offsetX, y: options.offsetY }])) })
      s.editor.dispatchCommand(cmd); return true
    }} />
  const props = { scene: s.scene, assets: s.assets, timeMs: s.timeMs, onClose: close, documentSignal: s.editor.getDocumentSignal() }
  if (view === 'json') return <JsonModal scene={s.scene} onClose={close} documentSignal={props.documentSignal} />
  if (view === 'export-image') return <RasterExportDialog {...props} />
  if (view === 'export-svg') return <SVGExportDialog {...props} />
  if (view === 'export-sequence') return <SequenceExportDialog {...props} />
  return null
}
