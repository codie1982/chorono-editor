import { describe, it, expect } from 'vitest'
import { pairEditor, pollEditor, answerEditor, disconnect, callEditorTool } from '../broker'
import { executeEditorJob, type MCPHost } from '../editor'
import { emptyScene } from '../../defaults'
import type { ChronoScene } from '../../types'

function fakeEditor() {
  let scene = emptyScene(), revision = 0
  const history: ChronoScene[] = [], future: ChronoScene[] = []
  const host = { editor: {
    getScene: () => scene, getRevision: () => revision, isTransactionActive: () => false,
    dispatchCommand: (command: any) => { history.push(scene); scene = command.execute(scene); revision++; future.length = 0 },
    undo: () => { if (history.length) { future.push(scene); scene = history.pop()!; revision++ } },
    redo: () => { if (future.length) { history.push(scene); scene = future.pop()!; revision++ } },
  }, assets: new Map(), selectedTimelineId: '', currentTimeMs: 0, selectTimeline: () => {}, seek: () => {}, playToggle: () => {}, setSpeed: () => {} } as unknown as MCPHost
  const paired = pairEditor('Test editor')
  const controller = new AbortController()
  const pump = (async () => {
    while (!controller.signal.aborted) {
      const job = await pollEditor(paired.id, paired.token, controller.signal)
      if (!job) continue
      try { answerEditor(paired.id, paired.token, job.id, await executeEditorJob(job, host)) }
      catch (error) { answerEditor(paired.id, paired.token, job.id, undefined, (error as Error).message) }
    }
  })()
  return { paired, host, call: (name: string, args: any = {}) => callEditorTool(name, { ...args, sessionId: paired.id }), close: async () => { controller.abort(); await pump; disconnect(paired.id, paired.token) } }
}

describe('live editor broker', () => {
  it('routes preferred aliases and legacy calls through identical retry, revision and atomic command gates', async () => {
    const editor = fakeEditor()
    try {
      const created = await editor.call('create_layer', { kind: 'rect', patch: { name: 'Human clock at 09:05' }, requestId: 'canonical-create' })
      const repeated = await editor.call('create_layer', { kind: 'rect', patch: { name: 'Human clock at 09:05' }, requestId: 'canonical-create' })
      expect(repeated).toEqual(created)
      const id = created.addedLayerIds[0]
      await expect(editor.call('create_object', { kind: 'rect', patch: { name: 'Human clock at 09:05' }, requestId: 'canonical-create' })).rejects.toThrow('different arguments')
      await expect(editor.call('replace_layer_fields', { layerId: id, patch: { opacity: .2 }, expectedRevision: 0 })).rejects.toThrow('revision conflict')
      expect(await editor.call('get_layer', { layerId: id })).toEqual(await editor.call('describe_layer', { layerId: id }))
      const before = structuredClone(editor.host.editor.getScene())
      await editor.call('batch_actions', { actions: [
        { name: 'create_timeline', arguments: { id: 'intro', durationMs: 1000 } },
        { name: 'upsert_keyframes', arguments: { timelineId: 'intro', layerId: id, property: 'opacity', keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 1000, value: 1 }] } },
      ] })
      expect(editor.host.editor.getScene().layers[0].name).toBe('Human clock at 09:05')
      expect(editor.host.editor.getScene().timelines[0].tracks[0].keyframes).toHaveLength(2)
      expect(await editor.call('get_timeline', { timelineId: 'intro' })).toEqual(await editor.call('describe_timeline', { timelineId: 'intro' }))
      expect(await editor.call('evaluate_timeline_values', { timeMs: 500 })).toEqual(await editor.call('evaluate_at_time', { timeMs: 500 }))
      await editor.call('undo')
      expect(editor.host.editor.getScene()).toEqual(before)
      await expect(editor.call('batch_actions', { actions: [
        { name: 'create_layer', arguments: { kind: 'circle' } },
        { name: 'replace_layer_fields', arguments: { layerId: 'missing', patch: { opacity: 0 } } },
      ] })).rejects.toThrow('not found')
      expect(editor.host.editor.getScene()).toEqual(before)
      await expect(editor.call('batch_actions', { actions: [
        { name: 'get_layer', arguments: { layerId: id } },
      ] })).rejects.toThrow('cannot be used in a native batch')
    } finally { await editor.close() }
  })
  it('edits timeline-owned audio through the native tools with one undo per clip operation', async () => {
    const editor = fakeEditor()
    try {
      await editor.call('create_timeline', { id: 'sound', durationMs: 1000 })
      await editor.call('update_timeline', { timelineId: 'sound', patch: { layerIds: [] } })
      const source = { id: 'sound_asset', name: 'voice.wav', type: 'audio' as const, url: 'data:audio/wav;base64,AA==', durationMs: 4000 }
      editor.host.editor.dispatchCommand({ label: 'Fixture source', execute: scene => ({ ...scene, assets: [source] }), undo: scene => scene })
      await editor.call('add_audio_clip', { assetId: source.id, timelineId: 'sound', layerId: 'voice', startMs: 500 })
      const scene = editor.host.editor.getScene()
      expect(scene.timelines[0].layerIds).toContain('voice')
      expect(scene.composition.durationMs).toBe(4500)
      await editor.call('set_audio_gain', { layerId: 'voice', gainDb: -6.020599913279624 })
      await editor.call('set_audio_fades', { layerId: 'voice', fadeInMs: 1000, fadeOutMs: 500 })
      await editor.call('trim_audio_clip', { layerId: 'voice', startMs: 1500, endMs: 4000 })
      const trimmed = structuredClone(editor.host.editor.getScene())
      expect(trimmed.layers[0]).toMatchObject({ startMs: 1500, endMs: 4000, audio: { startOffsetMs: 1000, volume: .5 } })
      await editor.call('split_audio_clip', { layerId: 'voice', timeMs: 2500, rightLayerId: 'voice_right' })
      expect(editor.host.editor.getScene().layers[1]).toMatchObject({ id: 'voice_right', startMs: 2500, audio: { startOffsetMs: 2000, assetId: source.id } })
      await editor.call('undo')
      expect(editor.host.editor.getScene()).toEqual(trimmed)
      await editor.call('redo')
      expect(editor.host.editor.getScene().layers[1].id).toBe('voice_right')
      await editor.call('move_audio_clip', { layerId: 'voice_right', startMs: 0 })
      expect(editor.host.editor.getScene().layers[1]).toMatchObject({ startMs: 0, endMs: 1500, audio: { startOffsetMs: 2000 } })
      await expect(editor.call('patch_audio_clip', { layerId: 'voice', patch: { inventedProperty: true } })).rejects.toThrow(/Unknown audio/)
      await expect(editor.call('set_audio_gain', { layerId: 'voice', gainDb: 99 })).rejects.toThrow('Invalid arguments')
      await editor.call('set_audio_master', { gainDb: -6.020599913279624, muted: true })
      expect(editor.host.editor.getScene().composition).toMatchObject({ audioVolume: .5, audioMuted: true })
      await editor.call('set_keyframes', { timelineId: 'sound', layerId: 'voice', property: 'audio.volume', keyframes: [{ timeMs: 0, value: .2 }, { timeMs: 4000, value: .8 }] })
      await expect(editor.call('set_audio_gain', { layerId: 'voice', gainDb: 0 })).rejects.toThrow('supply timeMs')
      await editor.call('set_audio_gain', { layerId: 'voice', gainDb: 0, timeMs: 2000 })
      expect(editor.host.editor.getScene().timelines[0].tracks.find(track => track.target === 'layers.voice.audio.volume')?.keyframes.find(key => key.timeMs === 2000)?.value).toBe(1)
    } finally { await editor.close() }
  })
  it('applies scripts exactly once and preserves ids used by subsequent tools', async () => {
    const editor = fakeEditor()
    try {
      const first = await editor.call('run_script', { code: `scene.add('circle').set({name:'Hero'})`, requestId: 'once' })
      const again = await editor.call('run_script', { code: `scene.add('circle').set({name:'Hero'})`, requestId: 'once' })
      expect(again.revision).toBe(first.revision)
      expect(editor.host.editor.getScene().layers).toHaveLength(1)
      const id = first.layers[0].id
      await editor.call('batch_actions', { expectedRevision: first.revision, actions: [
        { name: 'create_timeline', arguments: { id: 'intro', durationMs: 2000 } },
        { name: 'set_keyframes', arguments: { timelineId: 'intro', layerId: id, property: 'opacity', keyframes: [{timeMs:0,value:0},{timeMs:2000,value:1}] } },
      ] })
      expect(editor.host.editor.getScene().timelines[0].tracks[0].target).toBe(`layers.${id}.opacity`)
      await editor.call('undo')
      expect(editor.host.editor.getScene().timelines).toHaveLength(0)
      expect(editor.host.editor.getScene().layers).toHaveLength(1)
    } finally { await editor.close() }
  })
  it('prepares a plan without edits and commits without replaying code', async () => {
    const editor = fakeEditor()
    try {
      const plan = await editor.call('run_script', { code: `scene.add('rect')`, dryRun: true })
      expect(editor.host.editor.getScene().layers).toHaveLength(0)
      const applied = await editor.call('apply_script_plan', { planId: plan.planId })
      expect(applied.layers[0].id).toBe(plan.layers[0].id)
      await expect(editor.call('apply_script_plan', { planId: plan.planId })).rejects.toThrow('expired')
    } finally { await editor.close() }
  })
  it('rejects stale revisions and rolls back failed batches', async () => {
    const editor = fakeEditor()
    try {
      await editor.call('create_object', { kind: 'rect' })
      await expect(editor.call('create_object', { kind: 'circle', expectedRevision: 0 })).rejects.toThrow('revision conflict')
      await expect(editor.call('batch_actions', { actions: [
        { name: 'create_object', arguments: {kind:'circle'} },
        { name: 'patch_object', arguments: {layerId:'missing',patch:{opacity:0}} },
      ] })).rejects.toThrow('not found')
      expect(editor.host.editor.getScene().layers).toHaveLength(1)
    } finally { await editor.close() }
  })
  it('rejects ambiguous sessions and invalid tokens', async () => {
    const a = fakeEditor(), b = fakeEditor()
    try {
      await expect(callEditorTool('get_scene', {})).rejects.toThrow('Multiple editors')
      await expect(pollEditor(a.paired.id, 'wrong')).rejects.toThrow('not authorized')
    } finally { await a.close(); await b.close() }
  })
  it('deletes animated objects without leaving orphan tracks and supports undo', async () => {
    const editor = fakeEditor()
    try {
      const created = await editor.call('run_script', {code:`const g=scene.add('group'),c=scene.add('circle');c.parent(g);c.key('opacity',0,0).key('opacity',1000,1);`})
      const groupId = created.layers.find((l: any)=>l.type==='group').id
      await editor.call('delete_layer',{layerId:groupId})
      expect(editor.host.editor.getScene().layers).toHaveLength(0)
      expect(editor.host.editor.getScene().timelines[0].tracks).toHaveLength(0)
      await editor.call('undo')
      expect(editor.host.editor.getScene().layers).toHaveLength(2)
      expect(editor.host.editor.getScene().timelines[0].tracks).toHaveLength(1)
    } finally {await editor.close()}
  })
  it('captures live runtime overrides instead of resetting a state machine', async () => {
    const editor = fakeEditor()
    try {
      await editor.call('run_script',{code:`scene.createTimeline({id:'intro'});const sm=scene.addStateMachine('test');sm.addState('intro','intro');`})
      editor.host.getLiveFrame = () => ({overrides:new Map([['layers.hero.opacity',0.7]]),paramValues:new Map([['energy',1]])})
      const result = await editor.call('evaluate_frame')
      expect(result.values['layers.hero.opacity']).toBe(0.7)
      await expect(editor.call('evaluate_frame',{timeMs:1000})).rejects.toThrow('specify timelineIds')
    } finally {await editor.close()}
  })
})
