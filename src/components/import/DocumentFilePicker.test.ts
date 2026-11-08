import { afterEach, expect, it, vi } from 'vitest'
import { openDocumentFilePicker } from './DocumentFilePicker'
import { EditorDocumentLifetime } from '@/lib/editor/lifecycle/EditorDocumentLifetime'

/** Native-control port substitute, only for callback ownership/metadata checks. */
function platform(files = [new File(['svg'], 'file.svg')]) {
  const input = { type: '', accept: '', multiple: false, hidden: false, remove: vi.fn(), files, onchange: null as (() => void) | null, oncancel: null as (() => void) | null, click: vi.fn() }
  const create = vi.fn(() => input), append = vi.fn()
  vi.stubGlobal('document', { createElement: create, body: { append } })
  return { input, create, append }
}
afterEach(() => vi.unstubAllGlobals())
it('sets native picker options, returns selected metadata and detaches both callbacks', () => {
  const { input, append } = platform(), onFiles = vi.fn(), doc = new EditorDocumentLifetime()
  openDocumentFilePicker({ accept: 'image/*', multiple: true, getDocumentSignal: () => doc.signal, onFiles })
  expect(input).toMatchObject({ type: 'file', accept: 'image/*', multiple: true, hidden: true }); expect(append).toHaveBeenCalledWith(input); expect(input.click).toHaveBeenCalledOnce()
  input.onchange!(); expect(onFiles).toHaveBeenCalledWith(input.files)
  expect(input.onchange).toBeNull(); expect(input.oncancel).toBeNull(); expect(input.remove).toHaveBeenCalledOnce()
})
it('a selection from a replaced document cannot start import IO in the new document', () => {
  const { input } = platform(), onFiles = vi.fn(), doc = new EditorDocumentLifetime()
  openDocumentFilePicker({ accept: '.json', getDocumentSignal: () => doc.signal, onFiles })
  const lateChange = input.onchange!
  doc.replace(); expect(input.remove).toHaveBeenCalledOnce(); lateChange(); expect(onFiles).not.toHaveBeenCalled(); expect(input.onchange).toBeNull()
})
it('checks identity even if a custom host did not abort the old signal; cancel and empty selection publish nothing', () => {
  let doc = new AbortController(); const { input } = platform(), onFiles = vi.fn()
  openDocumentFilePicker({ accept: '.json', getDocumentSignal: () => doc.signal, onFiles })
  doc = new AbortController(); input.onchange!(); expect(onFiles).not.toHaveBeenCalled()
  openDocumentFilePicker({ accept: '.json', onFiles }); input.oncancel!()
  expect(input.onchange).toBeNull(); expect(onFiles).not.toHaveBeenCalled()
  input.files = []; openDocumentFilePicker({ accept: '.json', onFiles }); input.onchange!(); expect(onFiles).not.toHaveBeenCalled()
})
it('pre-aborted scope opens no control', () => {
  const { create } = platform(), doc = new AbortController(); doc.abort()
  openDocumentFilePicker({ accept: '.json', getDocumentSignal: () => doc.signal, onFiles: vi.fn() })
  expect(create).not.toHaveBeenCalled()
})

it('owns the hidden DOM control until native cancel and detaches the document listener', () => {
  const { input, append } = platform(), doc = new AbortController(), removeListener = vi.spyOn(doc.signal, 'removeEventListener')
  openDocumentFilePicker({ accept: '.json', getDocumentSignal: () => doc.signal, onFiles: vi.fn() })
  expect(append).toHaveBeenCalledOnce(); expect(input.remove).not.toHaveBeenCalled()
  input.oncancel!(); expect(input.remove).toHaveBeenCalledOnce(); expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
  doc.abort(); expect(input.remove).toHaveBeenCalledOnce()
})
it('native click failure and throwing consumers do not leave hidden controls or callbacks alive', () => {
  const { input } = platform()
  input.click.mockImplementationOnce(() => { throw new Error('native picker unavailable') })
  expect(() => openDocumentFilePicker({ accept: '.json', onFiles: vi.fn() })).toThrow('native picker unavailable')
  expect(input.remove).toHaveBeenCalledOnce(); expect(input.onchange).toBeNull()
  input.remove.mockClear()
  openDocumentFilePicker({ accept: '.json', onFiles: () => { throw new Error('consumer failed') } })
  expect(() => input.onchange!()).toThrow('consumer failed'); expect(input.remove).toHaveBeenCalledOnce(); expect(input.onchange).toBeNull()
})
