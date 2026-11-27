'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ModelSelection, ModelViewCamera, ModelWorldMeasurement } from '@/lib/model3d/inspection/types'
import type { Model3DData } from '@/lib/model3d/types'
import { modelSelectionFromKey, modelSelectionKey } from '@/lib/model3d/inspection/modelSelection'
import { selectableModelObjects } from '@/lib/model3d/inspection/modelSelection'
import { combineLayerSelection, createLayerSelection, retainLayerSelection } from '@/lib/selection/layerSelection'
import type { SelectionMode } from '@/lib/selection/selectionGesture'
import { contentInstance, modelAssetIds, withModelContent } from '@/lib/model3d/content/modelContent'
import { ModelViewport } from './model3d/ModelViewport'
import { ModelSceneExplorer } from './model3d/ModelSceneExplorer'
import { ModelNodeInspector } from './model3d/ModelNodeInspector'
import { ModelSceneControls } from './model3d/ModelSceneControls'
import { ModelPrimitiveInspector } from './model3d/ModelPrimitiveInspector'
import { addPrimitive, MAX_PRIMITIVE_OBJECTS, PRIMITIVE_SELECTION_INSTANCE } from '@/lib/model3d/modeling/poly/primitiveSource'
import type { ModelSceneTreeItem, ModelTreeVisibility } from '@/lib/model3d/inspection/modelSceneTree'
import { modelSceneDeletionTargets, removeModelSceneObjects, type ModelSceneDeletionTargets } from '@/lib/model3d/source/modelSceneDeletion'
import { renameModelSceneObject } from '@/lib/model3d/source/modelSceneRename'
import { setModelTreeFlag } from '@/lib/model3d/source/modelVisibility'
import { removeModelObjectTracks } from '@/lib/model3d/animation/removeInstanceTracks'
import ContextMenu from '@/components/ui/ContextMenu'
import { buildModelSceneContextMenu } from './model3d/modelSceneContextMenu'
import { updateModelMeasurement } from '@/lib/model3d/measurement/modelMeasurement'
import { ModelWorldDimensions } from './model3d/ModelWorldDimensions'
import { ModelScenePlacementInspector } from './model3d/ModelScenePlacementInspector'
import { ModelCameraInspector } from './model3d/ModelCameraInspector'
import { ModelBaseLightingInspector } from './model3d/ModelBaseLightingInspector'
import { ModelRenderPanel } from './model3d/ModelRenderPanel'
import { modelWorkspaces, type ModelWorkspace } from './model3d/modelWorkspaces'
import { ModelWorkspaceNavigation } from './model3d/ModelWorkspaceNavigation'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { detailDrivenReason, type ItemDetailSession } from '@/lib/editor/detail'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import { DRAFT_HISTORY, DetailWorkspaceShell } from './DetailWorkspaceShell'
import { useModelClipEditor } from './useModelClipEditor'
import { ModelContentTimeline } from './ModelContentTimeline'
import { ModelPanelDock } from './model3d/ModelPanelDock'
import { ModelEditPolyPanel } from './model3d/ModelEditPolyPanel'
import { ModelAnimationKeyProvider } from './model3d/ModelAnimationKeyContext'
import { modelChannels } from '@/lib/model3d/animation/modelChannels'
import { makeKeyframeLayerSnapshotCmd } from '@/lib/editor/commands-keyframe'
import { expandPolySelection, updatePolySelection, type PolyEditSelection, type PolySelectionMode } from '@/lib/model3d/modeling/poly/editSelection'
import { primitiveMeshSnapshot } from '@/lib/model3d/modeling/poly/meshSnapshot'
import { topologyFingerprint } from '@/lib/model3d/modeling/stack/contracts'
import { makeRegistry } from '@/components/dock/registry'
import { addSceneObject, cameraFromView, SCENE_OBJECT_SELECTION_INSTANCE, updateSceneObject, type ModelSceneLight } from '@/lib/model3d/source/modelSceneObjects'
import { ModelSceneObjectInspector } from './model3d/ModelSceneObjectInspector'
import styles from './ItemDetailWorkspace.module.css'

/** Model-specific content adapter inside the common detail shell. Only the
 * selected private clip is projected into the local Timeline. Sampled values
 * feed inspection/rendering; edits go through validated native key commands.
 * Imported GLB skeleton/animation data remains outside this numeric clip editor.
 */
export function ModelDetailWorkspace({ session, editor: main, onClose }: {
  session: ItemDetailSession; editor: EditorStateReturn; timeMs: number; onClose(): void
}) {
  const content = session.animation!
  const draft = useEditorState(content.initial, undefined, DRAFT_HISTORY)
  const model = useModelClipEditor(content, draft)
  const [selected, setSelected] = useState(() => createLayerSelection([])), [isolatedKeys, setIsolatedKeys] = useState<readonly string[] | undefined>()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; keys: readonly string[]; visibility?: ModelTreeVisibility;
    rename?: { id: string; name: string } } | null>(null)
  const [renameRequest, setRenameRequest] = useState<{ id: string; name: string } | null>(null)
  const [editSelection, setEditSelection] = useState<PolyEditSelection | null>(null)
  const [propertiesTab, setPropertiesTab] = useState<'object' | 'modifiers'>('object')
  const [candidate, setCandidate] = useState('')
  const [focused, setFocused] = useState(false)
  const [worldMeasurement, setWorldMeasurement] = useState<{ source: Model3DData; key: string; value: ModelWorldMeasurement | null } | null>(null)
  const selection = selected.primaryId ? modelSelectionFromKey(selected.primaryId) : undefined
  const selections = useMemo(() => Array.from(selected.selectedIds, modelSelectionFromKey), [selected.selectedIds])
  const isolated = useMemo(() => isolatedKeys?.map(modelSelectionFromKey), [isolatedKeys])
  const isolatedKeySet = useMemo(() => isolatedKeys && new Set(isolatedKeys), [isolatedKeys])
  const select = (next?: ModelSelection, mode: SelectionMode = 'replace') => {
    setSelected(current => combineLayerSelection(current, next ? [modelSelectionKey(next)] : [], mode))
  }
  const selectMany = (next: readonly ModelSelection[], mode: SelectionMode) => {
    setSelected(current => combineLayerSelection(current, next.map(modelSelectionKey), mode))
  }
  const toggleIsolation = () => setIsolatedKeys(current => current ? undefined : Array.from(selected.selectedIds))
  const [workspace, setWorkspace] = useState<ModelWorkspace>('modeling')
  const [camera, setCamera] = useState<ModelViewCamera>(() => ({ ...content.owner.model3d!.camera, roll: content.owner.model3d!.camera.roll ?? 0,
    projection: content.owner.model3d!.content?.view.projection ?? 'perspective', orthoHeight: content.owner.model3d!.content?.view.orthoHeight ?? 2.8 }))
  const data = model.previewLayer.model3d!, assetKey = [...modelAssetIds(data), candidate].join('|')
  const keyActions = workspace === 'animation' && model.timeline && model.context ? {
    canKey: new Set(modelChannels(data)),
    keyed: new Set(model.timeline.tracks.filter(track => track.keyframes.some(key => Math.abs(key.timeMs - model.playback.currentTimeMs) < .001))
      .map(track => track.target.replace(`layers.${content.owner.id}.`, ''))),
    setKey(path: string) {
      model.playback.handlePause()
      model.editor.dispatchCommand(makeKeyframeLayerSnapshotCmd(model.timeline!.id, model.previewLayer,
        model.playback.currentTimeMs, [path], model.context!))
    },
  } : null
  const stale = main.getRevision() !== session.revision || session.document.aborted
  const demanded = useMemo(() => draft.scene.assets.filter(a => assetKey.split('|').includes(a.id)), [draft.scene.assets, assetKey])
  const assets = useAssetCache(demanded), lookup = assets.modelForAsset!, primary = lookup(data.assetId)
  const selectedResource = selection ? lookup(data.content?.instances[selection.instanceId]?.assetId ?? data.assetId) : primary
  const selectedPrimitive = selection?.instanceId === PRIMITIVE_SELECTION_INSTANCE
    ? data.modeling?.objects.find(object => object.id === selection.nodeId) : undefined
  const selectedSceneObject = selection?.instanceId === SCENE_OBJECT_SELECTION_INSTANCE
    ? data.sceneObjects?.objects.find(object => object.id === selection.nodeId) : undefined
  useEffect(() => {
    if (!editSelection) return
    const object = data.modeling?.objects.find(value => value.id === editSelection.objectId)
    if (!object || stale || workspace !== 'modeling' || object.visible === false || object.frozen === true
      || topologyFingerprint(primitiveMeshSnapshot(object.geometry)) !== editSelection.sourceFingerprint
      || isolatedKeySet && !isolatedKeySet.has(modelSelectionKey({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: object.id }))
      || selection?.instanceId !== PRIMITIVE_SELECTION_INSTANCE || selection.nodeId !== object.id)
      setEditSelection(null)
  }, [data, editSelection?.objectId, selection?.instanceId, selection?.nodeId, isolatedKeySet, workspace, stale])
  useEffect(() => {
    if (!selection || !primary?.inspector) { setWorldMeasurement(null); return }
    try { setWorldMeasurement({ source: data, key: modelSelectionKey(selection), value: primary.inspector.measure(data, selection, { camera, showGrid: false }, lookup) }) }
    catch { setWorldMeasurement(null) }
  }, [primary, data, selection?.instanceId, selection?.nodeId, camera, lookup])
  useEffect(() => { for (const asset of demanded) { const inventory = lookup(asset.id)?.inventory; if (inventory) content.registerInventory(asset.id, inventory) } }, [content, demanded, assets, lookup])
  useEffect(() => {
    const available = new Set<string>()
    for (const object of data.modeling?.objects ?? []) available.add(modelSelectionKey({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: object.id }))
    for (const object of data.sceneObjects?.objects ?? []) available.add(modelSelectionKey({ instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: object.id }))
    for (const [instanceId, instance] of Object.entries(data.content?.instances ?? {})) for (const nodeId of Object.keys(instance.nodes))
      available.add(modelSelectionKey({ instanceId, nodeId }))
    if (!data.content) for (const node of primary?.inventory?.nodes ?? []) available.add(modelSelectionKey({ instanceId: 'primary', nodeId: node.id }))
    setSelected(current => retainLayerSelection(current, available))
    setIsolatedKeys(current => {
      if (!current) return current
      const retained = current.filter(key => available.has(key))
      return retained.length === current.length ? current : retained.length ? retained : undefined
    })
  }, [data, primary])
  const change = (model3d: typeof data) => model.updateLayer({ ...model.previewLayer, model3d })
  const groups = session.adapter.groups(model.previewLayer).filter(group => {
    if (workspace === 'modeling') return false
    if (workspace === 'animation') return false
    return workspace === 'render' && group.title === '3D Lighting'
  })
  const addAssets = draft.scene.assets.filter(asset => asset.type === 'model3d' && !lookup(asset.id)?.isExplicitEmptyScene)
    .map(asset => ({ id: asset.id, name: asset.name, ready: !!lookup(asset.id)?.inventory }))
  const visibleTargets = selectableModelObjects(data, primary, lookup, isolatedKeySet)
  const visibilityFor = (target: ModelSelection): ModelTreeVisibility | undefined => {
    if (target.instanceId === SCENE_OBJECT_SELECTION_INSTANCE) {
      const object = data.sceneObjects?.objects.find(item => item.id === target.nodeId)
      return object && { kind: object.kind, instanceId: target.instanceId, nodeId: object.id,
        visible: object.visible !== false, frozen: object.frozen === true, renderable: object.renderable !== false }
    }
    if (target.instanceId === PRIMITIVE_SELECTION_INSTANCE) {
      const object = data.modeling?.objects.find(item => item.id === target.nodeId)
      return object && { kind: 'primitive', instanceId: target.instanceId, nodeId: object.id,
        visible: object.visible !== false, frozen: object.frozen === true, renderable: object.renderable !== false }
    }
    const instance = data.content?.instances[target.instanceId]
    const node = instance?.nodes[target.nodeId]
    const info = (target.instanceId === 'primary' ? primary : lookup(instance?.assetId ?? ''))?.inventory?.nodes.find(item => item.id === target.nodeId)
    return info && { kind: 'node', instanceId: target.instanceId, nodeId: target.nodeId,
      visible: node?.visible ?? info.visible, frozen: node?.frozen === true, renderable: node?.renderable !== false }
  }
  const openContextMenu = (target: ModelSelection | undefined, visibility: ModelTreeVisibility | undefined, x: number, y: number,
    item?: ModelSceneTreeItem) => {
    const key = target && modelSelectionKey(target), keys = key && !selected.selectedIds.has(key) ? [key] : Array.from(selected.selectedIds)
    if (key && !selected.selectedIds.has(key)) setSelected(createLayerSelection(keys))
    setContextMenu({ x, y, keys, visibility: visibility ?? (target ? visibilityFor(target) : keys.length === 1 ? visibilityFor(modelSelectionFromKey(keys[0])) : undefined),
      rename: item?.visibility && (item.kind === 'primitive' || item.kind === 'instance' || item.kind === 'node' || item.kind === 'camera' || item.kind === 'light')
        ? { id: item.id, name: item.name } : undefined })
  }
  const selectAll = () => setSelected(createLayerSelection(visibleTargets.map(modelSelectionKey)))
  const deleteTargets = (targets: ModelSceneDeletionTargets) => {
    if (stale || !targets.primitiveIds.length && !targets.instanceIds.length && !targets.sceneObjectIds?.length) return
    const removeFromDraft = (scene: typeof draft.scene) => {
      const source = scene.layers[0].model3d!, next = removeModelSceneObjects(source, targets)
      return { ...scene, layers: [{ ...scene.layers[0], model3d: next }],
        timelines: targets.instanceIds.length || targets.primitiveIds.length
          ? removeModelObjectTracks(scene.timelines, targets.instanceIds, targets.primitiveIds) : scene.timelines }
    }
    try {
      content.model(removeFromDraft(draft.getCommittedScene()))
      model.change('Delete 3D objects', removeFromDraft)
      setSelected(createLayerSelection([])); setContextMenu(null)
    } catch (failure) { model.setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  const deleteSelected = () => deleteTargets(modelSceneDeletionTargets(data, selections))
  const remove = (target: ModelTreeVisibility) => deleteTargets({
    primitiveIds: target.kind === 'primitive' && target.nodeId ? [target.nodeId] : [],
    instanceIds: target.kind === 'instance' && target.instanceId !== 'primary' ? [target.instanceId] : [],
    sceneObjectIds: (target.kind === 'camera' || target.kind === 'light') && target.nodeId ? [target.nodeId] : [],
  })
  const contextSelections = contextMenu?.keys.map(modelSelectionFromKey) ?? []
  const contextTargetSelections = modelSceneDeletionTargets(data, contextSelections)
  const contextTargets: ModelSceneDeletionTargets = contextMenu?.visibility && !contextSelections.length
    && contextMenu.visibility.kind === 'instance' && contextMenu.visibility.instanceId !== 'primary'
    ? { ...contextTargetSelections, instanceIds: [contextMenu.visibility.instanceId] } : contextTargetSelections
  const editTarget = contextSelections.length === 1 && contextSelections[0].instanceId === PRIMITIVE_SELECTION_INSTANCE
    ? data.modeling?.objects.find(object => object.id === contextSelections[0].nodeId) : undefined
  const editModeReason = stale ? 'The 3D source changed while this editor was open.'
    : contextSelections.length !== 1 ? 'Select exactly one primitive to enter Edit Mode.'
      : !editTarget ? 'Edit Mode currently supports authored Box, Sphere, Cylinder, Cone and Plane primitives.'
        : editTarget.visible === false ? 'Show this primitive in the viewport before editing.'
          : isolatedKeySet && !isolatedKeySet.has(modelSelectionKey({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: editTarget.id }))
            ? 'Exit isolation or include this primitive before editing.'
          : editTarget.frozen === true ? 'Unfreeze this primitive before editing.' : undefined
  const changeEditMode = (mode: PolySelectionMode) => setEditSelection(current => current && ({ ...current, mode, ids: [] }))
  const selectPoly = (ids: readonly string[], mode: SelectionMode) => setEditSelection(current => {
    const object = data.modeling?.objects.find(value => value.id === current?.objectId)
    if (!current || !object) return current
    const mesh = primitiveMeshSnapshot(object.geometry)
    const expanded = ids.flatMap(id => expandPolySelection(mesh, current.mode, id))
    return { ...current, ids: updatePolySelection(current.ids, expanded, mode) }
  })
  const registry = makeRegistry([
    { id: 'explorer', title: 'Scene Explorer', render: () => <div className={styles.modelPanelScroll}>
      <ModelSceneExplorer name={session.layer.name} data={data} primary={primary} lookup={lookup}
        selectedKeys={selected.selectedIds} isolatedKeys={isolatedKeySet} isolationActive={isolatedKeys !== undefined}
        onSelect={select} onSelectAll={selectAll} onDeleteSelected={deleteSelected}
        onOpenContextMenu={(item, x, y) => openContextMenu(item.selection, item.visibility, x, y, item)}
        renameRequest={renameRequest} onRename={(target, name) => {
          if (stale) { setRenameRequest(null); return }
          try { const next = renameModelSceneObject(data, target, name, primary?.inventory); if (next !== data) change(next) }
          catch (failure) { model.setError(failure instanceof Error ? failure.message : String(failure)) }
          setRenameRequest(null)
        }} onCancelRename={() => setRenameRequest(null)}
        onMaterial={() => { setEditSelection(null); setWorkspace('material') }} onToggleIsolation={toggleIsolation}
        onChange={change} onRemove={remove} disabled={stale} />
    </div> },
    { id: 'viewport', title: '3D Viewport', closable: false, render: () => <div className={styles.preview} style={{ height: '100%' }}>
      <ModelViewport model={model} resource={primary} lookup={lookup} selection={selection} selections={selections} isolated={isolated}
        onSelect={select} onSelectMany={selectMany} onSelectAll={selectAll} onDeleteSelected={deleteSelected}
        editSelection={editSelection ?? undefined} onEditPick={selectPoly} onExitEditMode={() => setEditSelection(null)}
        onOpenContextMenu={(target, x, y) => openContextMenu(target, undefined, x, y)}
        camera={camera} onCamera={setCamera} workspace={workspace} sourceDisabled={stale}
        addAssets={addAssets} candidate={candidate} onCandidate={setCandidate}
        canAddPrimitive={!stale && !!primary?.inventory && (data.modeling?.objects.length ?? 0) < MAX_PRIMITIVE_OBJECTS}
        canAddModel={!stale && !!primary?.inventory && Object.keys(data.content?.instances ?? { primary: true }).length < 8}
        canAddSceneObject={!stale && (data.sceneObjects?.objects.length ?? 0) < 64}
        onAddCamera={projection => {
          const id = `camera_${crypto.randomUUID().replaceAll('-', '')}`
          const count = data.sceneObjects?.objects.filter(object => object.kind === 'camera').length ?? 0
          change(addSceneObject(data, cameraFromView(id, { ...camera, projection }, `Camera ${count + 1}`)))
          select({ instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: id }); setWorkspace('modeling')
        }}
        onAddLight={lightType => {
          const id = `light_${crypto.randomUUID().replaceAll('-', '')}`
          const light: ModelSceneLight = { id, name: `${lightType[0].toUpperCase()}${lightType.slice(1)} Light`, kind: 'light', lightType,
            position: { x: camera.targetX + 3, y: camera.targetY + 5, z: camera.targetZ + 4 },
            target: { x: camera.targetX, y: camera.targetY, z: camera.targetZ }, color: '#ffffff', intensity: 3, shadows: false }
          change(addSceneObject(data, light)); select({ instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: id }); setWorkspace('modeling')
        }}
        onAddPrimitive={kind => {
          if (!primary?.inventory) throw new Error('3D scene is still preparing.')
          const id = `primitive_${crypto.randomUUID().replaceAll('-', '')}`
          change(addPrimitive(data, primary.inventory, kind, id)); select({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: id }); setWorkspace('modeling')
        }}
        onAddModel={assetId => {
          if (!primary?.inventory) throw new Error('3D scene is still preparing.')
          const resource = lookup(assetId)
          if (!resource?.inventory || resource.isExplicitEmptyScene) throw new Error('Choose a prepared 3D model.')
          const base = withModelContent(data, primary.inventory), id = `part_${crypto.randomUUID().replaceAll('-', '')}`
          if (Object.keys(base.content!.instances).length >= 8) throw new Error('This scene already has eight model slots.')
          const instance = contentInstance(assetId, resource.inventory, draft.scene.assets.find(asset => asset.id === assetId)?.name)
          instance.position.x = primary.isExplicitEmptyScene ? 0 : 1.5
          change({ ...base, content: { ...base.content!, instances: { ...base.content!.instances, [id]: instance } } })
          select(resource.inventory.nodes[0] ? { instanceId: id, nodeId: resource.inventory.nodes[0].id } : undefined); setWorkspace('modeling')
        }}
        outputAspect={draft.scene.composition.width / draft.scene.composition.height}
        onMeasurementChange={patch => { if (primary?.inventory) change(updateModelMeasurement(data, primary.inventory, patch)) }} onUseView={selectedView => {
          const active = data.sceneObjects?.activeCameraId
          if (active) change(updateSceneObject(data, active, object => object.kind === 'camera'
            ? { ...cameraFromView(object.id, selectedView, object.name), visible: object.visible, frozen: object.frozen, renderable: object.renderable } : object))
          else {
            const id = `camera_${crypto.randomUUID().replaceAll('-', '')}`
            change(addSceneObject(data, cameraFromView(id, selectedView))); select({ instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: id })
          }
        }} />
    </div> },
    { id: 'properties', title: 'Properties', render: () => <div className={styles.modelPanelScroll}>
      <h2 className="mb-3 text-sm">{modelWorkspaces.find(item => item.id === workspace)!.label}</h2>
      {workspace === 'modeling' && selectedPrimitive && <div role="tablist" aria-label="3D properties" className="mb-3 flex gap-1 border-b border-slate-700 pb-2">
        {(['object', 'modifiers'] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={propertiesTab === tab}
          className={`rounded px-3 py-1.5 text-xs ${propertiesTab === tab ? 'bg-cyan-900 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          onClick={() => setPropertiesTab(tab)}>{tab === 'object' ? 'Object' : 'Modifiers'}</button>)}
      </div>}
      <ModelAnimationKeyProvider value={keyActions}><fieldset disabled={stale} className="flex flex-col gap-3 min-w-0">
        {workspace === 'modeling' && selectedPrimitive && propertiesTab === 'modifiers' ? <>
          <section aria-label="Modifier stack" className="space-y-2 border-b border-slate-700 pb-3 text-xs">
            <h3 className="text-cyan-300">Modifier Stack</h3>
            <div className="rounded border border-slate-600 bg-[#101b2d] px-2 py-2">{selectedPrimitive.geometry.kind[0].toUpperCase() + selectedPrimitive.geometry.kind.slice(1)} · parametric base</div>
            <p className="text-slate-400">No committed modifiers.</p>
          </section>
          {editSelection?.objectId === selectedPrimitive.id ? <ModelEditPolyPanel data={data} object={selectedPrimitive} selection={editSelection}
            onMode={changeEditMode} onExit={() => setEditSelection(null)} />
            : <p className="text-xs text-slate-400">Use the object context menu to enter Edit Mode.</p>}
        </> : <>
        {workspace === 'render' && <ModelRenderPanel data={data} resource={primary} lookup={lookup} onChange={change} disabled={stale} />}
        {!!groups.length && <SchemaPanel layer={model.previewLayer} groups={groups} onLayerChange={model.updateLayer}
          disabledReason={schema => detailDrivenReason(session.source, session.layer, schema.path)} />}
        {(workspace === 'modeling' || workspace === 'animation') && <ModelScenePlacementInspector data={data} onChange={change} />}
        {workspace === 'animation' && !data.sceneObjects?.objects.some(object => object.kind === 'camera') && <ModelCameraInspector data={data} onChange={change} />}
        {workspace === 'animation' && <ModelBaseLightingInspector data={data} onChange={change} />}
        {selectedSceneObject && <ModelSceneObjectInspector data={data} object={selectedSceneObject} onChange={change} />}
        {selectedPrimitive && (workspace === 'material' || workspace === 'modeling' || workspace === 'animation')
          ? <ModelPrimitiveInspector data={data} object={selectedPrimitive} onChange={change} workspace={workspace === 'material' ? 'material' : 'modeling'} />
          : !selectedSceneObject && workspace !== 'render' && <ModelNodeInspector data={data} resource={selectedResource} selection={selection} onChange={change} workspace={workspace} />}
        {selection && !selectedSceneObject && workspace !== 'material' && <ModelWorldDimensions data={data} selection={selection}
          measurement={worldMeasurement?.source === data && worldMeasurement.key === modelSelectionKey(selection) ? worldMeasurement.value : null}
          inventory={primary?.inventory} onChange={change} />}
        {workspace !== 'material' && !selectedSceneObject && <ModelSceneControls data={data} resource={selectedResource} selection={selection} onChange={change} workspace={workspace} />}
        </>}
      </fieldset></ModelAnimationKeyProvider>
    </div> },
    { id: 'timeline', title: '3D Animation', render: () => <fieldset disabled={stale} className="h-full min-h-0 overflow-hidden bg-[#0b1220]">
      <ModelContentTimeline content={content} model={model} selection={selection} onSelectObject={target => select(target)} />
    </fieldset> },
  ])
  return <DetailWorkspaceShell session={session} main={main} draft={draft} dirty={model.dirty} draftError={model.error} clipMode
    focus={focused} onFocusChange={setFocused} onEscape={() => { if (!editSelection) return false; setEditSelection(null); return true }} onClose={onClose}>
    <ModelWorkspaceNavigation workspace={workspace} onWorkspace={next => { if (next !== 'modeling') setEditSelection(null); setWorkspace(next) }} />
    <ModelPanelDock key={workspace} registry={registry} focused={focused} workspace={workspace} />
    {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}
      items={buildModelSceneContextMenu({
        selectionCount: contextSelections.length, selectableCount: visibleTargets.length,
        removableCount: contextTargets.primitiveIds.length + contextTargets.instanceIds.length + (contextTargets.sceneObjectIds?.length ?? 0),
        isolationActive: isolatedKeys !== undefined, sourceDisabled: stale, visibility: contextMenu.visibility,
        editModeReason, editing: !!editSelection && editSelection.objectId === editTarget?.id,
        onEditMode: () => {
          if (editSelection && editSelection.objectId === editTarget?.id) { setEditSelection(null); return }
          if (!editTarget || editModeReason) return
          setSelected(createLayerSelection([modelSelectionKey({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: editTarget.id })]))
          setEditSelection({ objectId: editTarget.id, sourceFingerprint: topologyFingerprint(primitiveMeshSnapshot(editTarget.geometry)), mode: 'vertex', ids: [] }); setPropertiesTab('modifiers'); setWorkspace('modeling')
        },
        onRename: contextMenu.rename ? () => setRenameRequest({ id: contextMenu.rename!.id, name: contextMenu.rename!.name }) : undefined,
        onSelectAll: selectAll, onClearSelection: () => setSelected(createLayerSelection([])), onToggleIsolation: toggleIsolation,
        onDelete: () => deleteTargets(contextTargets), onToggleFlag: (flag, value) => {
          if (contextMenu.visibility && !stale) change(setModelTreeFlag(data, contextMenu.visibility, flag, value, primary?.inventory))
        },
      })} />}
  </DetailWorkspaceShell>
}
