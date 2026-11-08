import { expect, it, vi } from 'vitest'
import { ImportActivity } from './ImportActivity'
import { EditorDocumentLifetime } from '../../editor/lifecycle/EditorDocumentLifetime'

const reading = { stage: 'reading' as const, label: 'Reading', progress: 0.1 }
it('captures document identity; cancelled old callbacks cannot clear a new operation', () => {
  const documents = new EditorDocumentLifetime(), activity = new ImportActivity(), get = () => documents.signal
  const old = activity.begin('Old', get); old.report(reading)
  documents.replace()
  expect(old.signal.aborted).toBe(true); expect(old.isCurrent()).toBe(false)
  expect(activity.getSnapshot()).toMatchObject({ active: 0, settling: 1, progress: null })
  const current = activity.begin('New', get); current.report(reading)
  old.report({ ...reading, label: 'Late old progress' }); old.finish()
  expect(activity.getSnapshot()).toMatchObject({ active: 1, settling: 0, label: 'New', progress: reading })
  expect(current.isCurrent()).toBe(true); current.finish()
  expect(activity.getSnapshot()).toMatchObject({ active: 0, settling: 0, label: null })
})
it('tracks overlapping live actions by newest action, not callback arrival', () => {
  const activity = new ImportActivity(), doc = new AbortController(), get = () => doc.signal
  const first = activity.begin('First', get), second = activity.begin('Second', get)
  second.report(reading); first.report({ ...reading, label: 'Late first' })
  expect(activity.getSnapshot()).toMatchObject({ active: 2, label: 'Second', progress: reading })
  second.finish(); expect(activity.getSnapshot()).toMatchObject({ active: 1, label: 'First' })
  first.finish(); first.finish(); expect(activity.getSnapshot().active).toBe(0)
})
it('user cancel retains settlement records and never aborts the borrowed document', () => {
  const activity = new ImportActivity(), doc = new AbortController(), op = activity.begin('Old', () => doc.signal)
  activity.cancel(); expect(op.signal.aborted).toBe(true); expect(doc.signal.aborted).toBe(false)
  expect(activity.getSnapshot()).toMatchObject({ active: 0, settling: 1 })
  activity.start(); const next = activity.begin('Next', () => doc.signal); op.finish()
  expect(next.isCurrent()).toBe(true); next.finish()
})
it('has stable snapshots until updates, subscriptions detach, and stopped scopes reject', () => {
  const activity = new ImportActivity(), doc = new AbortController(), listener = vi.fn()
  const before = activity.getSnapshot(), off = activity.subscribe(listener)
  expect(activity.getSnapshot()).toBe(before)
  const op = activity.begin('File', () => doc.signal); expect(listener).toHaveBeenCalled()
  off(); listener.mockClear(); activity.stop(); expect(listener).not.toHaveBeenCalled()
  expect(op.isCurrent()).toBe(false); expect(() => activity.begin('File', () => doc.signal)).toThrow('cancelled')
  activity.start(); op.finish(); doc.abort()
  expect(() => activity.begin('File', () => doc.signal)).toThrow('cancelled')
})
it('bounds unsettled permission/native actions without abandoning their owners', () => {
  const activity = new ImportActivity(), doc = new AbortController()
  const operations = Array.from({ length: 130 }, () => activity.begin('File', () => doc.signal))
  activity.cancel(); expect(() => activity.begin('Denied', () => doc.signal)).toThrow('Too many')
  operations.forEach(op => op.finish()); expect(activity.begin('Accepted', () => doc.signal).isCurrent()).toBe(true)
})
