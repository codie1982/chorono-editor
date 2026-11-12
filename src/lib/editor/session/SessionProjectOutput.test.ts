import { describe, expect, it } from 'vitest'
import { emptyScene, newImageLayer, newRectLayer } from '../../defaults'
import { assetSourcePool } from '../../asset/sources'
import { acquireSceneText } from '../../export/text'
import { readSessionProject } from './SessionProject'
import { saveSessionCheckpoint, restoreSessionCheckpoint } from '../persistence/recovery/SessionCheckpointIO'
import type { SessionCheckpointStore } from '../persistence/recovery/IndexedDbSessionStore'
import type { SessionCheckpoint } from '../persistence/recovery/SessionCheckpoint'
import type { HistoryState } from '../history'

function historyWithRemovedMedia(url: string): HistoryState {
  const before = emptyScene(), image = newImageLayer('image', 40, 40); image.id = 'image-layer'
  before.layers = [image]; before.assets = [{ id: 'image', name: 'Original image', type: 'image', url }]
  const moved = { ...before, layers: [{ ...image, transform: { ...image.transform, x: 42.5 } }] }
  const present = { ...before, layers: [{ ...newRectLayer(), id: 'manual' }], assets: [] }
  return { past: [before, moved], present, future: [moved] }
}
/** Controlled IO port. Native transaction rollback is covered by the browser
 * adapter acceptance, while these tests exercise real conversion/source leases. */
function memoryStore() {
  const records = new Map<string, SessionCheckpoint>(), media = new Map<string, Blob>()
  const store: SessionCheckpointStore = {
    read: async id => records.get(id), latest: async () => Array.from(records.keys()).at(-1) ?? null,
    hasAsset: async (id, url) => media.has(id + url), readAsset: async (id, url) => media.get(id + url),
    write: async (record, assets) => { records.set(record.id, structuredClone(record)); assets.forEach((blob, url) => media.set(record.id + url, blob)) },
  }
  return { store, records, media }
}
describe('session project IO', () => {
  it('embeds history-only media once and opens pending Undo/Redo under the saved session ID', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>'
    const source = assetSourcePool.create(new Blob([svg], { type: 'image/svg+xml' }))
    try {
      const history = historyWithRemovedMedia(source.url), original = JSON.stringify(history)
      const output = await acquireSceneText(history.present, 'editor-json', { session: { sessionId: 'saved-session', history } })
      try {
        const project = JSON.parse(output.value.text), opened = readSessionProject(project)
        expect(opened.sessionId).toBe('saved-session'); expect(opened.history.past).toHaveLength(2); expect(opened.history.future).toHaveLength(1)
        expect(opened.history.past[0].assets[0].url).toMatch(/^data:image\/svg\+xml;base64,/)
        expect(await (await fetch(opened.history.past[0].assets[0].url)).text()).toBe(svg)
        expect(opened.history.past[1].layers[0].transform.x).toBe(42.5)
        expect(project.editorSession.media).toHaveLength(1); expect(project.assets).toHaveLength(0)
        expect(JSON.stringify(history)).toBe(original)
      } finally { output.release() }
    } finally { source.release() }
  })
  it('does not duplicate present media bytes inside its history media table', async () => {
    const source = assetSourcePool.create(new Blob(['svg bytes'], { type: 'image/svg+xml' }))
    try {
      const old = historyWithRemovedMedia(source.url), history = { ...old, present: old.past[1] }
      const output = await acquireSceneText(history.present, 'editor-json', { session: { sessionId: 'same', history } })
      try {
        const project = JSON.parse(output.value.text)
        expect(project.editorSession.media[0]).toMatchObject({ presentAssetIndex: 0 })
        expect(project.editorSession.media[0].dataUrl).toBeUndefined()
        expect(readSessionProject(project).history.past[0].assets[0].url).toBe(project.assets[0].url)
      } finally { output.release() }
    } finally { source.release() }
  })
  it('atomically retains removed media for recovery and remaps it across all restored stacks', async () => {
    const source = assetSourcePool.create(new Blob(['historic bytes'], { type: 'application/octet-stream' })), data = memoryStore()
    try {
      const history = historyWithRemovedMedia(source.url)
      const metadata = { version: 2 as const, id: 'session__slot', sessionId: 'session', slotId: 'slot', sequence: 4, savedAt: 10 }
      await saveSessionCheckpoint(history.present, metadata, data.store, undefined, undefined, history)
      const record = data.records.get(metadata.id)!
      expect(record.history?.past).toHaveLength(2); expect(record.assetUrls).toEqual([source.url])
      const restored = await restoreSessionCheckpoint(record, data.store)
      try {
        expect(restored.history.past).toHaveLength(2); expect(restored.history.future).toHaveLength(1)
        const url = restored.history.past[0].assets[0].url
        expect(url).not.toBe(source.url); expect(await (await fetch(url)).text()).toBe('historic bytes')
        expect(restored.history.future[0].assets[0].url).toBe(url)
      } finally { restored.release() }
    } finally { source.release() }
  })
  it('opens legacy source checkpoints and rejects malformed project history before adoption', async () => {
    const scene = emptyScene(), data = memoryStore()
    const old = { version: 1 as const, id: 'old', sequence: 1, savedAt: 1, json: JSON.stringify(scene), assetUrls: [] }
    const restored = await restoreSessionCheckpoint(old, data.store)
    expect(restored.history).toEqual({ present: scene, past: [], future: [] }); restored.release()
    expect(() => readSessionProject({ ...scene, editorSession: { version: 99 } } as never)).toThrow(/Unsupported/)
  })
})
