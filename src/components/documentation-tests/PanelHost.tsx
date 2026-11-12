import { useState } from 'react'
import LayerPanel from '../LayerPanel'
import PropertiesPanel from '../PropertiesPanel'
import SceneExplorerPanel from '../sceneExplorer/SceneExplorerPanel'
import TimelinePanel from '../TimelinePanel'
import CurveEditor from '../timeline/CurveEditor'
import DopeSheetPanel from '../dope-sheet/DopeSheetPanel'
import KeyframeInspector from '../panels/KeyframeInspector'
import CurveModifierStackPanel from '../panels/CurveModifierStackPanel'
import SelectionPanel from '../panels/SelectionPanel'
import SnapPanel from '../panels/SnapPanel'
import AssetsPanel from '../panels/AssetsPanel'
import StateMachinePanel from '../panels/StateMachinePanel'
import ParametersPanel from '../panels/ParametersPanel'
import EventsPanel from '../panels/EventsPanel'
import MotionBindingPanel from '../panels/MotionBindingPanel'
import WiringListPanel from '../panels/WiringListPanel'
import RuntimePreviewPanel from '../panels/RuntimePreviewPanel'
import ChronoPlayerPanel from '../panels/ChronoPlayerPanel'
import KeyboardShortcutsPanel from '../panels/KeyboardShortcutsPanel'
import ParticlePanel from '../particles/ParticlePanel'
import ResourceMonitorPanel from '../resources/ResourceMonitorPanel'
import WireParameterModal from '../wiring/WireParameterModal'
import SceneCanvas from '../SceneCanvas'
import ToolGroup from '../TopToolbar/ToolGroup'
import SplinePointInspector from '../SplinePointInspector'
import type { ParameterRef, ParameterWire } from '@/lib/types'
import type { DocumentationState } from './useDocumentationState'
import { DialogHost } from './DialogHost'
import { makeSetSubtreeFlagCmd } from '@/lib/editor/branches/SubtreeCommands'

/** Production component composition for the browser-only documentation host.
 * Source edits go to the host's real history. Missing external services are
 * omitted; read-only captures never advertise fake imports or save results. */
export function PanelHost({ view, state: s }: { view: string; state: DocumentationState }) {
  const [wire, setWire] = useState<ParameterWire | null | undefined>(undefined)
  const [wireTarget, setWireTarget] = useState<ParameterRef | null>(null)
  const common = { scene: s.scene, editor: s.editor, selectedTimelineId: s.timelineId,
    selectedLayerId: s.selectedId, selectedLayerIds: s.selectedIds, selectedKfIds: s.selectedKfIds,
    onSelectKeyframes: s.setSelectedKfIds, currentTimeMs: s.timeMs, onTimeChange: s.setTimeMs }
  const newWire = (target?: ParameterRef) => { setWireTarget(target ?? null); setWire(null) }
  let panel: React.ReactNode
  switch (view) {
    case 'layers': panel = <LayerPanel layers={s.scene.layers} selectedId={s.selectedId} selectedIds={s.selectedIds}
      onSelect={s.select} onAdd={s.addLayer} onAddImage={file => { void s.imports.importFile(file) }} onAddVideo={file => { void s.imports.importFile(file) }} onAddAudio={file => { void s.imports.importFile(file) }} onImportSvg={file => { void s.imports.importFile(file) }}
      onDelete={s.remove} onReorder={s.reorder} onToggleFlag={s.toggleFlag} onRename={s.rename} onMoveInTree={s.moveInTree} />; break
    case 'explorer': panel = <SceneExplorerPanel layers={s.scene.layers} timeline={s.timeline} selectedId={s.selectedId}
      selectedIds={s.selectedIds} onSelect={s.select} onRename={s.rename} onToggleFlag={s.toggleFlag} onMoveInTree={s.moveInTree}
      onSetSubtreeFlag={(roots, field, value) => { const cmd = makeSetSubtreeFlagCmd(s.editor.getScene(), roots, field, value); if (cmd) s.editor.dispatchCommand(cmd) }}
      onClearSelection={() => s.select(null)} />; break
    case 'properties': case 'text': case 'path': panel = <PropertiesPanel layer={s.layer} composition={s.scene.composition}
      onLayerChange={s.updateLayer} onCompositionChange={s.updateComposition} parameters={s.scene.parameters}
      allLayers={s.scene.layers} allTimelines={s.scene.timelines} scene={s.scene} dispatchCommand={s.editor.dispatchCommand}
      parameterWires={s.scene.parameterWires} onRequestNewWire={newWire} onEditWire={setWire} currentTimeMs={s.timeMs} selectedTimelineId={s.timelineId} />; break
    case 'timeline': panel = <TimelinePanel {...common} settings={s.settings} onSettingsChange={s.setSettings}
      isPlaying={s.playing} playbackSpeed={s.speed} onPlayToggle={() => s.setPlaying(value => !value)}
      onSelectTimeline={s.setTimelineId} onSelectLayer={s.select} onToggleLayerFlag={s.toggleFlag} onPlaybackSpeedChange={s.setSpeed}
      ghostSettings={s.ghost.ghostSettings} onGhostUpdate={s.ghost.updateGhostSettings} onGhostToggle={s.ghost.toggleGhost}
      onGhostPreset={s.ghost.applyPreset} onEditWire={setWire} onWireRequest={newWire} />; break
    case 'curves': panel = <CurveEditor {...common} />; break
    case 'dope-sheet': panel = <DopeSheetPanel {...common} settings={s.settings} onSettingsChange={s.setSettings} isPlaying={s.playing} onSelectLayer={s.select} />; break
    case 'keyframe': panel = <KeyframeInspector {...common} />; break
    case 'modifiers': panel = <CurveModifierStackPanel {...common} />; break
    case 'selection': panel = <SelectionPanel scene={s.scene} selectedLayerId={s.selectedId} onSelectMatched={ids => { s.select(null); ids.forEach(id => s.select(id, true)) }} />; break
    case 'snap': panel = <SnapPanel snap={s.snap} />; break
    case 'assets': panel = <AssetsPanel scene={s.scene} editor={s.editor} onSelectLayer={s.select} selectedTimelineId={s.timelineId} currentTimeMs={s.timeMs} onImportFiles={files => { void s.imports.importFiles(files) }} />; break
    case 'state-machine': panel = <StateMachinePanel scene={s.scene} editor={s.editor} runtime={s.runtime} />; break
    case 'parameters': panel = <ParametersPanel scene={s.scene} editor={s.editor} />; break
    case 'events': panel = <EventsPanel scene={s.scene} editor={s.editor} />; break
    case 'bindings': panel = <MotionBindingPanel scene={s.scene} editor={s.editor} />; break
    case 'wires': panel = <WiringListPanel scene={s.scene} editor={s.editor} onCreateWire={() => newWire()} onEditWire={setWire} />; break
    case 'preview': panel = <RuntimePreviewPanel scene={s.scene} runtime={s.runtime} />; break
    case 'player': panel = <ChronoPlayerPanel scene={s.scene} assets={s.assets} />; break
    case 'shortcuts': panel = <KeyboardShortcutsPanel />; break
    case 'particles': panel = <ParticlePanel scene={s.scene} selectedLayer={s.layer} onLayerChange={s.updateLayer} />; break
    case 'resources': panel = <ResourceMonitorPanel scene={s.scene} assets={s.assets} isPlaying={s.playing}
      audio={{ getResources: () => ({ bytes: 0, bufferCount: 0, pendingCount: 0, assets: [] }),
        getState: () => ({ contextState: 'idle', masterVolume: 1, meter: { peak: 0, rms: 0, clipped: false }, loadingAssetIds: [], errors: {}, sources: [] }) }} />; break
    case 'spline': panel = s.layer && <SplinePointInspector layer={s.layer} pointId={Object.keys(s.layer.spline?.points ?? {})[0] ?? null} dispatchCommand={s.editor.dispatchCommand} />; break
    case 'tools': panel = <div className="p-3"><ToolGroup mode={s.tool} onChange={s.setTool} containMode={s.containMode} onContainModeChange={s.setContainMode} /></div>; break
    case 'canvas': panel = <SceneCanvas scene={s.scene} editor={s.editor} timeMs={s.timeMs} selectedLayerId={s.selectedId}
      selectedLayerIds={s.selectedIds} assets={s.assets} onSelectLayer={s.select} selectedTimeline={s.timeline}
      toolMode={s.tool} onToolModeChange={s.setTool} snap={s.snap} ghostSettings={s.ghost.ghostSettings}
      selectedKeyframeIds={s.selectedKfIds} onSelectKeyframes={s.setSelectedKfIds} onSeekKeyframe={s.setTimeMs} />; break
    default: panel = <DialogHost view={view} state={s} />
  }
  return <>{panel}{wire !== undefined && <WireParameterModal scene={s.scene} editor={s.editor} existingWire={wire}
    preFilledTarget={wireTarget} onClose={() => setWire(undefined)} />}</>
}
