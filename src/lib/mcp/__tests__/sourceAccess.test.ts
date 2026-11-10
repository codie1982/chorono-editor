import { describe, expect, it, vi } from 'vitest'
import { fakeEditor } from './support/fakeEditor'
import { executeEditorJob } from '../editor'
import { openClientConnection } from '../broker'
import { emptyScene } from '../../defaults'
import { SourceAccessError } from '../source/SourceAccessError'
import { assetSourcePool } from '../../asset/sources'

/** Explicit source authority; these tests never use the compatibility fixture's
 * automatic read helper for the operation being admitted or rejected. */
const access = (read: any) => ({ expectedRevision: read.revision, readToken: read.readToken })

describe('mandatory source read and compare-and-swap', () => {
  it('rejects missing revision, missing read, guessed token, forged arguments and unregistered old clients', async () => {
    const editor = fakeEditor()
    try {
      await expect(editor.rawCall('create_layer', { kind: 'rect' })).rejects.toMatchObject({ code: 'EXPECTED_REVISION_REQUIRED' })
      await expect(editor.rawCall('create_object', { kind: 'rect', expectedRevision: 0 })).rejects.toMatchObject({ code: 'SOURCE_READ_REQUIRED' })
      await expect(editor.rawCall('create_object', { kind: 'rect', expectedRevision: 0, readToken: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'SOURCE_READ_REQUIRED' })
      await expect(executeEditorJob({ id: 'forged', method: 'create_object', args: { kind: 'rect', expectedRevision: 0, readToken: 'f'.repeat(64) } }, editor.host)).rejects.toMatchObject({ code: 'SOURCE_READ_REQUIRED' })
      expect(() => openClientConnection('old', '1.1.0')).toThrow(expect.objectContaining({ code: 'SOURCE_PROTOCOL_REQUIRED' }))
      expect(editor.historyLength()).toBe(0); expect(editor.host.editor.getScene().layers).toHaveLength(0)
    } finally { await editor.close() }
  })

  it('rejects a stale edit without changing manual child, path or key data', async () => {
    const editor = fakeEditor()
    try {
      await editor.call('run_script', { code: `const group=scene.add('group'),clock=scene.add('text'),path=scene.addSpline('line',{x1:0,y1:0,x2:100,y2:0});clock.parent(group);clock.text='10:10';clock.key('opacity',0,1).key('opacity',1000,.5);` })
      const read = await editor.rawCall('get_scene')
      editor.host.editor.dispatchCommand({ label: 'Human adjustment', execute: scene => ({ ...scene,
        layers: scene.layers.map(layer => layer.type === 'text' ? { ...layer, text: { ...layer.text!, value: '09:05' } } : layer),
        timelines: scene.timelines.map(timeline => ({ ...timeline, tracks: timeline.tracks.map(track => ({ ...track,
          keyframes: track.keyframes.map(key => ({ ...key, easing: { type: 'easeOut' } })) })) })),
      }), undo: scene => scene })
      const preserved = structuredClone(editor.host.editor.getScene()), history = editor.historyLength()
      await expect(editor.rawCall('run_script', { code: `scene.layers.forEach(layer=>scene.remove(layer));`, ...access(read) })).rejects.toMatchObject({ code: 'SOURCE_REVISION_CONFLICT' })
      expect(editor.host.editor.getScene()).toEqual(preserved); expect(editor.historyLength()).toBe(history)
      const fresh = await editor.rawCall('get_scene'), clock = fresh.scene.layers.find((layer: any) => layer.type === 'text')
      const changed = await editor.rawCall('update_layer', { layerId: clock.id, textColor: '#22c55e', ...access(fresh) })
      expect(editor.host.editor.getScene().layers.find(layer => layer.id === clock.id)?.text?.value).toBe('09:05')
      expect(editor.host.editor.getScene().timelines).toEqual(preserved.timelines)
      expect(changed.changeSummary.changedPaths).toContain(`layers.${clock.id}.text.color`)
      expect(changed.changeSummary.removedLayerIds).toEqual([])
    } finally { await editor.close() }
  })

  it('binds reads and retry results to genuine connections even when labels and request ids match', async () => {
    const editor = fakeEditor('Hermes'), other = editor.createClient('Hermes')
    try {
      const read = await editor.rawCall('get_scene')
      await expect(other.rawCall('create_layer', { kind: 'rect', ...access(read) })).rejects.toMatchObject({ code: 'SOURCE_READ_SCOPE' })
      const args = { kind: 'rect', ...access(read), requestId: 'same' }
      const applied = await editor.rawCall('create_layer', args)
      editor.host.editor.dispatchCommand({ label: 'Human change after uncertain delivery', execute: scene => ({ ...scene, composition: { ...scene.composition, backgroundColor: '#123456' } }), undo: scene => scene })
      const history = editor.historyLength()
      expect(await editor.rawCall('create_layer', args)).toEqual(applied)
      expect(editor.historyLength()).toBe(history)
      const secondRead = await other.rawCall('get_scene')
      await other.rawCall('create_layer', { kind: 'circle', ...access(secondRead), requestId: 'same' })
      expect(editor.host.editor.getScene().layers).toHaveLength(2)
      await expect(editor.rawCall('create_object', args)).rejects.toThrow('different arguments')
    } finally { await editor.close() }
  })

  it('detects same-revision document replacement, active drag and undo invalidation', async () => {
    const editor = fakeEditor()
    try {
      const old = await editor.rawCall('get_scene')
      editor.replaceDocument(emptyScene(), old.revision)
      await expect(editor.rawCall('create_layer', { kind: 'rect', ...access(old) })).rejects.toMatchObject({ code: 'SOURCE_DOCUMENT_CHANGED' })
      editor.setTransactionActive(true)
      await expect(editor.rawCall('get_scene')).rejects.toMatchObject({ code: 'SOURCE_EDITOR_BUSY' })
      editor.setTransactionActive(false)
      const read = await editor.rawCall('get_scene')
      await editor.rawCall('create_layer', { kind: 'rect', ...access(read) })
      const beforeUndo = await editor.rawCall('get_scene')
      editor.host.editor.undo()
      await expect(editor.rawCall('create_layer', { kind: 'circle', ...access(beforeUndo) })).rejects.toMatchObject({ code: 'SOURCE_REVISION_CONFLICT' })
      const fresh = await editor.rawCall('get_scene')
      editor.setTransactionActive(true)
      await expect(editor.rawCall('create_layer', { kind: 'rect', ...access(fresh) })).rejects.toMatchObject({ code: 'SOURCE_EDITOR_BUSY' })
      expect(editor.host.editor.getScene().layers).toHaveLength(0)
    } finally { await editor.close() }
  })

  it('requires one outer grant for atomic batches and preserves plan ids with plan-bound authority', async () => {
    const editor = fakeEditor(), other = editor.createClient()
    try {
      const read = await editor.rawCall('get_scene')
      await editor.rawCall('batch_actions', { ...access(read), actions: [
        { name: 'create_layer', arguments: { kind: 'rect' } },
        { name: 'create_timeline', arguments: { id: 'intro', durationMs: 1000 } },
      ] })
      expect(editor.historyLength()).toBe(1)
      const planRead = await editor.rawCall('get_scene')
      const plan = await editor.rawCall('run_script', { code: `scene.add('circle').set({name:'Planned'})`, dryRun: true, ...access(planRead) })
      expect(plan.readToken).not.toBe(planRead.readToken)
      // Another explicit read must not invalidate the already prepared plan.
      await editor.rawCall('get_scene')
      await expect(other.rawCall('apply_script_plan', { planId: plan.planId, ...access(plan) })).rejects.toMatchObject({ code: 'SOURCE_READ_SCOPE' })
      const applied = await editor.rawCall('apply_script_plan', { planId: plan.planId, ...access(plan), requestId: 'plan-once' })
      expect(applied.layers.map((layer: any) => layer.id)).toEqual(plan.layers.map((layer: any) => layer.id))
      expect(await editor.rawCall('apply_script_plan', { planId: plan.planId, ...access(plan), requestId: 'plan-once' })).toEqual(applied)
      expect(editor.host.editor.getScene().layers).toHaveLength(2)
      const staleRead = await editor.rawCall('get_scene')
      const stalePlan = await editor.rawCall('run_script', { code: `scene.add('rect')`, dryRun: true, ...access(staleRead) })
      editor.host.editor.undo()
      await expect(editor.rawCall('apply_script_plan', { planId: stalePlan.planId, ...access(stalePlan) })).rejects.toMatchObject({ code: 'SOURCE_REVISION_CONFLICT' })
    } finally { await editor.close() }
  })

  it('rechecks the browser at execution time if a human edits after broker admission', async () => {
    const editor = fakeEditor()
    try {
      const read = await editor.rawCall('get_scene')
      editor.interceptJobs(job => {
        if (job.method !== 'create_object') return
        editor.interceptJobs()
        editor.host.editor.dispatchCommand({ label: 'Human race', execute: scene => ({ ...scene, composition: { ...scene.composition, backgroundColor: '#abcdef' } }), undo: scene => scene })
      })
      await expect(editor.rawCall('create_layer', { kind: 'rect', ...access(read) })).rejects.toMatchObject({ code: 'SOURCE_REVISION_CONFLICT' })
      expect(editor.historyLength()).toBe(1)
      expect(editor.host.editor.getScene().composition.backgroundColor).toBe('#abcdef')
      expect(editor.host.editor.getScene().layers).toHaveLength(0)
      const current = await editor.rawCall('get_scene')
      editor.interceptJobs(job => {
        if (job.method !== 'create_object') return
        editor.interceptJobs(); editor.replaceDocument(emptyScene(), current.revision)
      })
      await expect(editor.rawCall('create_layer', { kind: 'rect', ...access(current) })).rejects.toMatchObject({ code: 'SOURCE_DOCUMENT_CHANGED' })
      expect(editor.historyLength()).toBe(0)
    } finally { await editor.close() }
  })

  it('does not mint write authority from partial reads or reuse an old get_scene requestId result', async () => {
    const editor = fakeEditor()
    try {
      const a = await editor.rawCall('get_scene', { requestId: 'read' }), b = await editor.rawCall('get_scene', { requestId: 'read' })
      expect(b.readToken).not.toBe(a.readToken)
      expect((await editor.rawCall('get_scene_json')).readToken).toBeUndefined()
      await expect(editor.rawCall('create_layer', { kind: 'rect', ...access(a) })).rejects.toBeInstanceOf(SourceAccessError)
      await editor.rawCall('create_layer', { kind: 'rect', ...access(b) })
      const serialized = JSON.stringify(editor.host.editor.getScene())
      expect(serialized).not.toContain(b.readToken); expect(serialized).not.toContain('readToken')
    } finally { await editor.close() }
  })

  it('checks again at commit when a manual edit happens during asynchronous browser preparation', async () => {
    const editor = fakeEditor()
    let preparation: ReturnType<typeof vi.spyOn> | undefined
    try {
      const read = await editor.rawCall('get_scene')
      editor.interceptJobs(job => {
        if (job.method !== 'create_object') return
        editor.interceptJobs()
        // Admission already passed. Simulate a manual commit while the async
        // resource owner prepares this job; final commit must recheck source.
        preparation = vi.spyOn(assetSourcePool, 'withAssets').mockImplementationOnce(async (_assets, work) => {
          await Promise.resolve()
          editor.host.editor.dispatchCommand({ label: 'Human edit during preparation',
            execute: scene => ({ ...scene, composition: { ...scene.composition, backgroundColor: '#fedcba' } }), undo: scene => scene })
          return work()
        })
      })
      await expect(editor.rawCall('create_layer', { kind: 'rect', ...access(read) })).rejects.toMatchObject({ code: 'SOURCE_REVISION_CONFLICT' })
      expect(editor.host.editor.getScene().composition.backgroundColor).toBe('#fedcba')
      expect(editor.host.editor.getScene().layers).toHaveLength(0)
      expect(editor.historyLength()).toBe(1)
    } finally { preparation?.mockRestore(); await editor.close() }
  })
})
