'use client'
import { useEffect, useMemo, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { usePlayback } from '@/app/hooks/usePlayback'
import { keyframePlaybackRange } from '@/lib/timeline/keyframePlaybackRange'
import { useEditorDisplayAvailable } from '@/components/editorDisplay/useEditorDisplay'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeKeyframeLayerSnapshotCmd } from '@/lib/editor/commands-keyframe'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { contentTimelineContext } from '@/lib/timeline/authoring/TimelineAuthoringContext'
import { modelEditBase } from '@/lib/model3d/content/modelEditBase'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { prepareRenderFrame } from '@/lib/render/prepareRenderFrame'
import { modelChannels, readModelChannelValue, sampleModelChannel } from '@/lib/model3d/animation/modelChannels'
import { isPrimitiveChannel, primitiveRenderPath } from '@/lib/model3d/animation/modelPrimitiveChannels'
import { modelClipCommand, type ModelClipDraft } from '@/lib/editor/detail'

/** One active detail transport and a validated editor adapter over the existing
 * bounded history/transaction owner. Seeks do not change source or main time.
 * Every source preview/commit validates the private draft before publication;
 * source edits key the selected clip, while no-clip edits retain static behavior.
 */
export function useModelClipEditor(content: ModelClipDraft, draft: EditorStateReturn) {
  const displayAvailable = useEditorDisplayAvailable()
  useEffect(() => { if (!displayAvailable) draft.cancelTransaction() }, [displayAvailable, draft.cancelTransaction])
  const [selectedId, select] = useState<string | null>(content.initial.initialState.activeClipId as string | null)
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>())
  const [error, setError] = useState<string | null>(null)
  const timeline = draft.scene.timelines.find(clip => clip.id === selectedId) ?? draft.scene.timelines[0] ?? null
  const nativeDuration = Math.max(1000, ...Object.values(draft.scene.layers[0].model3d?.content?.instances ?? {}).map(i => i.native ? (i.native.outMs - i.native.inMs) / i.native.speed : 0))
  const durationMs = timeline?.durationMs ?? nativeDuration
  const range = useMemo(() => timeline?.playKeyRange ? keyframePlaybackRange(timeline) : null, [timeline])
  const playback = usePlayback({ maxDuration: durationMs, wrapAtEnd: !!timeline?.loop, range, enabled: displayAvailable })
  const context = useMemo(() => timeline ? contentTimelineContext(draft.scene, content.owner.id, timeline.id) : undefined,
    [draft.scene, timeline, content.owner.id])
  const { handlePause, handleSeek } = playback
  useEffect(() => { handlePause(); handleSeek(0); setSelectedKeys(new Set()) }, [timeline?.id, handlePause, handleSeek])
  const dirty = useMemo(() => JSON.stringify(content.model(draft.scene)) !== JSON.stringify(content.owner.model3d), [content, draft.scene])

  const previewScene = useMemo(() => ({ ...draft.scene, timelines: timeline ? [timeline] : [] }), [draft.scene, timeline])
  const frame = useMemo(() => {
    const overrides = evaluateSceneFrame(previewScene, playback.currentTimeMs, { externalTime: timeline
      ? { timelineId: timeline.id, localTimeMs: playback.currentTimeMs } : undefined }).overrides
    for (const path of modelChannels(draft.scene.layers[0].model3d)) {
      const target = `layers.${content.owner.id}.${path}`
      if (!overrides.has(target)) continue
      const sampled = sampleModelChannel(path, overrides.get(target))
      if (isPrimitiveChannel(path)) {
        overrides.delete(target)
        overrides.set(`layers.${content.owner.id}.${primitiveRenderPath(draft.scene.layers[0].model3d!, path)}`, sampled)
      } else overrides.set(target, sampled)
    }
    return { overrides, layer: prepareRenderFrame(previewScene, playback.currentTimeMs, overrides).scene.layers[0] }
  }, [previewScene, timeline, playback.currentTimeMs, content.owner.id, draft.scene.layers])

  /** Wrap existing native commands rather than implementing another key engine.
   * A transaction preview may be ephemeral but must satisfy the same source cap.
   */
  const guarded = (command: EditorCommand) => modelClipCommand(content, command.label, scene => command.execute(scene))
  const editor: EditorStateReturn = { ...draft,
    dispatchCommand: command => { try { draft.dispatchCommand(guarded(command)); setError(null) } catch (failure) { setError(String(failure instanceof Error ? failure.message : failure)) } },
    previewTransaction: scene => { content.model(scene); draft.previewTransaction(scene) },
    commitTransaction: command => { draft.commitTransaction(guarded(command)); setError(null) },
  }

  /** Inspector values are evaluated at the local playhead. Source keys are
   * written from explicit edited inputs, never by copying an entire sampled
   * scene. Registered placement, camera, light, primitive and material edits
   * create keys; unregistered structural edits remain static.
   */
  const commandForLayer = (next: Layer, base = draft.getCommittedScene()): EditorCommand => {
    content.validateLayer(next)
    const layer = base.layers[0], paths = modelChannels(next.model3d)
      .filter(path => readModelChannelValue(frame.layer, path) !== undefined && readModelChannelValue(next, path) !== readModelChannelValue(frame.layer, path))
    const staticLayer = modelEditBase(next, layer, frame.layer, !!timeline)
    const patch = makeUpdateLayerCmd(layer.id, { model3d: staticLayer.model3d }, layer, { contentOwnerId: layer.id })
    const keys = timeline && context && paths.length ? makeKeyframeLayerSnapshotCmd(timeline.id, next, playback.currentTimeMs, paths, context) : null
    return { label: timeline ? 'Edit content key' : 'Edit model content', execute(scene) {
      const updated = patch.execute(scene); return keys ? keys.execute(updated) : updated
    }, undo: () => base }
  }
  const updateLayer = (next: Layer) => {
    playback.handlePause()
    try { editor.dispatchCommand(commandForLayer(next)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }

  /** Clip lifecycle metadata belongs only to this private projection. */
  const change = (label: string, transform: (scene: ChronoScene) => ChronoScene) => editor.dispatchCommand({ label, execute: transform, undo: () => draft.scene })
  return { editor, timeline, context, selectedKeys, setSelectedKeys, error, setError, select,
    playback, durationMs, previewScene, overrides: frame.overrides, previewLayer: frame.layer, updateLayer, commandForLayer, change, dirty }
}
