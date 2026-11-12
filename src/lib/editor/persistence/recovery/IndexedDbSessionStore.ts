import type { SessionCheckpoint } from './SessionCheckpoint'

export interface SessionCheckpointStore {
  read(id: string): Promise<unknown>
  latest(): Promise<string | null>
  hasAsset(id: string, url: string): Promise<boolean>
  readAsset(id: string, url: string): Promise<Blob | undefined>
  write(record: SessionCheckpoint, assets: ReadonlyMap<string, Blob>, signal?: AbortSignal): Promise<void>
}

/** Local browser adapter. Each tab has an independent checkpoint/asset namespace;
 * the origin's latest pointer is only a fallback for a newly opened tab. A single
 * transaction commits source, new media and removal of that tab's unused media.
 * Failed/quota/aborted writes keep the prior record and media intact. Runtime
 * handles never enter this database. No network/server or account is involved.
 * close aborts outstanding transactions and closes the owned connection.
 */
export class IndexedDbSessionStore implements SessionCheckpointStore {
  private connection?: Promise<IDBDatabase>
  private closed = false
  private readonly active = new Set<IDBTransaction>()
  constructor(private readonly factory: IDBFactory | undefined, private readonly name = 'chorono-editor-recovery-v1') {}
  private open(): Promise<IDBDatabase> {
    if (this.closed) return Promise.reject(new Error('Local recovery store is closed.'))
    if (!this.factory) return Promise.reject(new Error('Browser storage is unavailable. Save Scene JSON before leaving.'))
    if (!this.connection) this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(this.name, 1)
      let expired = false
      const timer = setTimeout(() => { expired = true; reject(new Error('Local recovery storage could not open. Close older Chorono tabs and retry.')) }, 5000)
      request.onblocked = () => { expired = true; clearTimeout(timer); reject(new Error('Local recovery storage is blocked by another tab.')) }
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('sessions', { keyPath: 'id' })
        db.createObjectStore('assets', { keyPath: ['session', 'url'] })
        db.createObjectStore('meta')
      }
      request.onerror = () => { clearTimeout(timer); reject(request.error) }
      request.onsuccess = () => {
        clearTimeout(timer)
        if (this.closed || expired) { request.result.close(); return }
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
    }).catch(error => { this.connection = undefined; throw error })
    return this.connection!
  }
  /** Wait for native transaction settlement, including cancellation. */
  private settle(tx: IDBTransaction, signal?: AbortSignal): Promise<void> {
    this.active.add(tx)
    return new Promise((resolve, reject) => {
      const abort = () => { try { tx.abort() } catch { /* Already settled. */ } }
      const finish = (error?: unknown) => { this.active.delete(tx); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve() }
      tx.oncomplete = () => finish()
      tx.onabort = () => finish(tx.error ?? new Error('Local recovery write was cancelled.'))
      tx.onerror = () => { /* onabort reports final failure. */ }
      signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort()
    })
  }
  private async get<T>(store: string, key: IDBValidKey, keysOnly = false): Promise<T | undefined> {
    const db = await this.open(), tx = db.transaction(store, 'readonly'), done = this.settle(tx)
    const request = keysOnly ? tx.objectStore(store).getKey(key) : tx.objectStore(store).get(key)
    let result: T | undefined
    request.onsuccess = () => { result = request.result as T | undefined }
    await done; return result
  }
  read(id: string): Promise<unknown> { return this.get('sessions', id) }
  async latest(): Promise<string | null> { return (await this.get<{ id: string }>('meta', 'latest'))?.id ?? null }
  async hasAsset(id: string, url: string): Promise<boolean> { return (await this.get('assets', [id, url], true)) !== undefined }
  async readAsset(id: string, url: string): Promise<Blob | undefined> { return (await this.get<{ blob: Blob }>('assets', [id, url]))?.blob }

  /** Atomically replace this tab's last good record. Recheck cached asset keys
   * inside the write transaction; stale preparation must fail, never save a
   * scene with missing bytes. Only unreferenced media of this tab is removed. */
  async write(record: SessionCheckpoint, assets: ReadonlyMap<string, Blob>, signal?: AbortSignal): Promise<void> {
    const db = await this.open(), tx = db.transaction(['sessions', 'assets', 'meta'], 'readwrite'), done = this.settle(tx, signal)
    if (signal?.aborted) { await done; return }
    const media = tx.objectStore('assets'), wanted = new Set(record.assetUrls)
    for (const url of record.assetUrls) {
      const blob = assets.get(url)
      if (blob) media.put({ session: record.id, url, blob })
      else {
        const check = media.getKey([record.id, url])
        check.onsuccess = () => { if (check.result === undefined) tx.abort() }
      }
    }
    const cursor = media.openKeyCursor(IDBKeyRange.bound([record.id, ''], [record.id, '\uffff']))
    cursor.onsuccess = () => { const entry = cursor.result; if (!entry) return
      if (!wanted.has((entry.key as string[])[1])) media.delete(entry.primaryKey)
      entry.continue()
    }
    tx.objectStore('sessions').put(record)
    const latest = tx.objectStore('meta').get('latest')
    latest.onsuccess = () => { if (!latest.result || latest.result.savedAt <= record.savedAt) tx.objectStore('meta').put({ id: record.id, savedAt: record.savedAt }, 'latest') }
    await done
  }
  close(): void {
    this.closed = true
    for (const tx of Array.from(this.active)) try { tx.abort() } catch { /* Native transaction already settled. */ }
    void this.connection?.then(db => db.close(), () => {})
  }
}
