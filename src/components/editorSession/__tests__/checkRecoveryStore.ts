import { IndexedDbSessionStore } from '@/lib/editor/persistence/recovery/IndexedDbSessionStore'
import { decodeCheckpoint, type SessionCheckpoint } from '@/lib/editor/persistence/recovery/SessionCheckpoint'
import { emptyScene } from '@/lib/defaults'

/** Native IndexedDB acceptance, deliberately isolated from both user drafts and
 * the reload fixture's own checkpoint. Tests atomic settlement and ownership,
 * not a JavaScript Map pretending to reproduce browser transaction behavior. */
export async function checkRecoveryStore() {
  const store = new IndexedDbSessionStore(indexedDB, 'chorono-recovery-adapter-acceptance')
  const record = (id: string, sequence: number, assetUrls: string[]): SessionCheckpoint => ({ version: 1, id, sequence, savedAt: sequence, json: JSON.stringify(emptyScene()), assetUrls })
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
  const results: { name: string; passed: boolean; error?: string }[] = []
  const check = async (name: string, work: () => Promise<void>) => { try { await work(); results.push({ name, passed: true }) } catch (error) { results.push({ name, passed: false, error: String(error) }) } }
  try {
    await check('atomic record and Blob survive connection close/reopen', async () => {
      await store.write(record('a', 1, ['blob:one']), new Map([['blob:one', new Blob(['original'], { type: 'text/plain' })]]))
      const reopened = new IndexedDbSessionStore(indexedDB, 'chorono-recovery-adapter-acceptance')
      try { assert(decodeCheckpoint(await reopened.read('a'))?.sequence === 1, 'Record missing'); assert(await (await reopened.readAsset('a', 'blob:one'))?.text() === 'original', 'Media bytes changed') } finally { reopened.close() }
    })
    await check('missing media abort rolls back record and previous asset deletion', async () => {
      let refused = false
      try { await store.write(record('a', 2, ['blob:missing']), new Map()) } catch { refused = true }
      assert(refused, 'Incomplete checkpoint committed')
      assert(decodeCheckpoint(await store.read('a'))?.sequence === 1, 'Prior record replaced')
      assert(await store.hasAsset('a', 'blob:one'), 'Prior media deleted')
    })
    await check('new source garbage-collects only that tab media', async () => {
      await store.write(record('b', 3, ['blob:one']), new Map([['blob:one', new Blob(['other tab'])]]))
      await store.write(record('a', 4, []), new Map())
      assert(!await store.hasAsset('a', 'blob:one'), 'Orphan bytes retained')
      assert(await (await store.readAsset('b', 'blob:one'))?.text() === 'other tab', 'Another tab media removed')
    })
    await check('cancelled write leaves last good record intact', async () => {
      const abort = new AbortController(); abort.abort(); let refused = false
      try { await store.write(record('a', 5, []), new Map(), abort.signal) } catch { refused = true }
      assert(refused, 'Aborted write succeeded'); assert(decodeCheckpoint(await store.read('a'))?.sequence === 4, 'Aborted write replaced source')
    })
    await check('old delayed writes cannot steal the latest-workspace pointer', async () => {
      await store.write(record('newer', 100, []), new Map()); await store.write(record('older', 10, []), new Map())
      assert(await store.latest() === 'newer', 'Older write became latest workspace')
    })
  } finally { store.close() }
  return { passed: results.every(item => item.passed), results }
}
