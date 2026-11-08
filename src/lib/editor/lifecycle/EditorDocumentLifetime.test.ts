import { expect, it } from 'vitest'
import { EditorDocumentLifetime } from './EditorDocumentLifetime'

it('reset replaces identity before notifying listeners, even with identical scene content', () => {
  const lifetime = new EditorDocumentLifetime(), old = lifetime.signal
  let seen: AbortSignal | undefined
  old.addEventListener('abort', () => { seen = lifetime.signal })
  lifetime.replace()
  expect(old.aborted).toBe(true); expect(lifetime.signal.aborted).toBe(false)
  expect(seen).toBe(lifetime.signal); expect(seen).not.toBe(old)
})
it('StrictMode replay preserves identity while actual unmount aborts it', async () => {
  const lifetime = new EditorDocumentLifetime(), identity = lifetime.signal
  lifetime.stop(); lifetime.start(); await Promise.resolve()
  expect(identity.aborted).toBe(false); expect(lifetime.signal).toBe(identity)
  lifetime.stop(); await Promise.resolve(); expect(identity.aborted).toBe(true)
})
it('a pending old unmount cannot abort a synchronously replaced document', async () => {
  const lifetime = new EditorDocumentLifetime(), old = lifetime.signal
  lifetime.stop(); lifetime.replace(); lifetime.start(); await Promise.resolve()
  expect(old.aborted).toBe(true); expect(lifetime.signal.aborted).toBe(false)
})
