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
