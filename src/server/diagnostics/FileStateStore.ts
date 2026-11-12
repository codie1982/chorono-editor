import { constants } from 'node:fs'
import { mkdir, lstat, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { decodeDiagnosticDepot, encodeDiagnosticDepot, MAX_DEPOT_BYTES } from './depotCodec'
import { DiagnosticRepositoryError, type DiagnosticDepotState } from './types'

/** Private atomic state-file owner for a single-host local filesystem.
 *
 * Each operation acquires a filesystem mkdir lock, so separate repository
 * instances/processes cannot concurrently replace counts. A crashed writer's
 * leftover .write-lock fails closed: an operator must verify no active writer
 * before removing it; no timeout steals a possibly live lock. Shared network
 * filesystems/multi-host replicas are unsupported. Each instance admits at most
 * 32 pending operations and waits at most 1s for another writer. No timers run
 * while idle, and no raw request/network/user data is retained here.
 */
export class FileStateStore {
  private pending = 0
  private tail: Promise<unknown> = Promise.resolve()
  private readonly root: string

  constructor(directory: string) { this.root = path.resolve(directory) }

  /** Execute one finite load/change/save atomically relative to other owners.
   * Callback data is private to this operation. Write succeeds before its value
   * escapes; failure never ACKs an uncommitted count. No mutation is cached. */
  transact<T>(work: (state: DiagnosticDepotState) => { state: DiagnosticDepotState; value: T }): Promise<T> {
    if (this.pending >= 32) return Promise.reject(new DiagnosticRepositoryError('depot-busy'))
    this.pending++
    const task = this.tail.then(() => this.exclusive(work))
    this.tail = task.catch(() => {})
    return task.finally(() => { this.pending-- })
  }

  /** Lock lifecycle encloses load and durable rename. Files use owner-only
   * permissions. Atomic rename prevents partial JSON after ordinary restart. */
  private async exclusive<T>(work: (state: DiagnosticDepotState) => { state: DiagnosticDepotState; value: T }): Promise<T> {
    let locked = false
    const lock = path.join(this.root, '.write-lock')
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      const directory = await lstat(this.root)
      if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0) {
        throw new DiagnosticRepositoryError('depot-unavailable')
      }
      for (let attempt = 0; attempt < 51; attempt++) {
        try { await mkdir(lock, { mode: 0o700 }); locked = true; break }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          if (attempt === 50) throw new DiagnosticRepositoryError('depot-busy')
          await new Promise(resolve => setTimeout(resolve, 20))
        }
      }
      const result = work(await this.load())
      await this.save(result.state)
      return result.value
    } catch (error) {
      if (error instanceof DiagnosticRepositoryError) throw error
      throw new DiagnosticRepositoryError('depot-unavailable')
    } finally { if (locked) await rm(lock, { recursive: true, force: true }) }
  }

  /** Read at most maxBytes+1 actual bytes; stat alone cannot enforce a cap. */
  private async load(): Promise<DiagnosticDepotState> {
    let file
    try { file = await open(path.join(this.root, 'state.json'), constants.O_RDONLY | constants.O_NOFOLLOW) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 2, receipts: [], groups: [], triage: [] }
      throw error
    }
    try {
      const size = (await file.stat()).size
      if (size > MAX_DEPOT_BYTES) throw new DiagnosticRepositoryError('depot-capacity')
      const bytes = Buffer.alloc(size + 1)
      let used = 0
      while (used < bytes.length) {
        const result = await file.read(bytes, used, bytes.length - used, null)
        if (!result.bytesRead) break
        used += result.bytesRead
      }
      if (used > size) throw new DiagnosticRepositoryError('depot-unavailable')
      return decodeDiagnosticDepot(bytes.subarray(0, used).toString('utf8'))
    } finally { await file.close() }
  }

  /** Flush the new private file before replacing the last committed version.
   * Temp files are always removed, including disk-full/rename failures. */
  private async save(state: DiagnosticDepotState): Promise<void> {
    const text = encodeDiagnosticDepot(state), temporary = path.join(this.root, `.state-${randomUUID()}.tmp`)
    let file
    try {
      file = await open(temporary, 'wx', 0o600)
      await file.writeFile(text, 'utf8'); await file.sync(); await file.close(); file = undefined
      await rename(temporary, path.join(this.root, 'state.json'))
      const directory = await open(this.root, 'r')
      try { await directory.sync() } finally { await directory.close() }
    } finally { await file?.close(); await rm(temporary, { force: true }) }
  }
}
