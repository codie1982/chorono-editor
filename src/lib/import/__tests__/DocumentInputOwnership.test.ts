import { afterEach, expect, it, vi } from 'vitest'
import { SvgDocumentHandler } from '../handlers/document/SvgDocumentHandler'
import { ChoronoSceneHandler } from '../handlers/document/ChoronoSceneHandler'
import { BoundedTextReader } from '../../resources/io'
import { ResourceBudget } from '../../resources/budget'
import { svgImporter } from '../../svg/SvgImporter'
import { emptyScene, newRectLayer } from '../../defaults'
import { ImportManager } from '../ImportManager'
import { releaseImportSources } from '../resources/importSources'

const svg = '<svg width="64" height="32"><script>alert(1)</script><rect width="64" height="32" onclick="bad()"/></svg>'
afterEach(() => vi.restoreAllMocks())
it('SVG sanitizer scope covers all text copies before DOM conversion and preserves a sanitized owned source', async () => {
  const file = new File([svg], 'art.svg'), budget = new ResourceBudget({ maxBytes: 65536 }), layer = newRectLayer()
  const convert = vi.spyOn(svgImporter, 'import').mockImplementation(text => {
    expect(text).not.toContain('<script'); expect(text).not.toContain('onclick')
    expect(budget.getSnapshot().chargedBytes).toBe(file.size * 9)
    return { layers: [layer], width: 64, height: 32, warnings: [] }
  })
  const text = vi.spyOn(file, 'text'), handler = new SvgDocumentHandler(new BoundedTextReader({ budget }))
  const preflight = await handler.preflight(file)
  expect(preflight.summary.estimatedLayers).toBe(1); expect(convert).not.toHaveBeenCalled()
  const result = await handler.handle(file)
  expect(result.layers).toEqual([layer]); expect(result.warnings).toHaveLength(2); expect(text).not.toHaveBeenCalled()
  const saved = await (await fetch(result.assets[0].url!)).text()
  expect(saved).toContain('<rect'); expect(saved).not.toContain('onclick')
  expect(budget.getSnapshot().chargedBytes).toBe(0)
  releaseImportSources(result); await Promise.resolve(); await expect(fetch(result.assets[0].url!)).rejects.toThrow()
})
it('SVG text denial happens before sanitizer/DOM/source work; progress cancellation and conversion errors clean up', async () => {
  const file = new File([svg], 'art.svg'), budget = new ResourceBudget({ maxBytes: file.size * 9 - 1 })
  const convert = vi.spyOn(svgImporter, 'import'), source = vi.spyOn(URL, 'createObjectURL')
  await expect(new SvgDocumentHandler(new BoundedTextReader({ budget })).handle(file)).rejects.toThrow('SVG sanitizer text')
  expect(convert).not.toHaveBeenCalled(); expect(source).not.toHaveBeenCalled(); expect(budget.getSnapshot().chargedBytes).toBe(0)
  const admitted = new ResourceBudget({ maxBytes: 65536 }), handler = new SvgDocumentHandler(new BoundedTextReader({ budget: admitted })), abort = new AbortController()
  const during = new AbortController()
  await expect(handler.handle(file, {}, progress => { if (progress.stage === 'parsing') during.abort() }, { signal: during.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(convert).not.toHaveBeenCalled(); expect(source).not.toHaveBeenCalled(); expect(admitted.getSnapshot().chargedBytes).toBe(0)
  convert.mockImplementation(() => { throw new Error('DOM conversion failed') })
  await expect(handler.handle(file)).rejects.toThrow('DOM conversion failed'); expect(admitted.getSnapshot().chargedBytes).toBe(0)
})
it('late SVG cancellation inside source construction releases creator ownership instead of leaking a result', async () => {
  vi.spyOn(svgImporter, 'import').mockReturnValue({ layers: [newRectLayer()], width: 64, height: 32, warnings: [] })
  const budget = new ResourceBudget({ maxBytes: 65536 }), handler = new SvgDocumentHandler(new BoundedTextReader({ budget })), abort = new AbortController()
  const create = vi.spyOn(URL, 'createObjectURL'), revoke = vi.spyOn(URL, 'revokeObjectURL')
  await expect(handler.handle(new File([svg], 'art.svg'), {}, progress => { if (progress.stage === 'complete') abort.abort() }, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  await Promise.resolve(); expect(create).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith(create.mock.results[0].value)
  expect(budget.getSnapshot().chargedBytes).toBe(0)
})
it('scene merge preserves editable data and preflight syntax warnings while IO/capacity/abort remain fatal', async () => {
  const scene = emptyScene(); scene.layers = [newRectLayer()]
  const file = new File([JSON.stringify(scene)], 'scene.json'), text = vi.spyOn(file, 'text'), budget = new ResourceBudget({ maxBytes: 65536 })
  const handler = new ChoronoSceneHandler(new BoundedTextReader({ budget })), manager = new ImportManager(); manager.registerHandler(handler)
  const preflight = await handler.preflight(file); expect(preflight.summary.estimatedLayers).toBe(1)
  const result = await manager.importFileAs(file, 'application/chorono+json')
  expect(result.commands[0].execute(emptyScene()).layers).toEqual(scene.layers); expect(text).not.toHaveBeenCalled(); expect(budget.getSnapshot().chargedBytes).toBe(0)
  expect((await handler.preflight(new File(['{broken'], 'scene.json'))).warnings[0]).toContain('Cannot parse JSON')
  const denied = new ChoronoSceneHandler(new BoundedTextReader({ maxInputBytes: 1 }))
  await expect(denied.preflight(file)).rejects.toThrow('input byte limit')
  const abort = new AbortController(); abort.abort()
  await expect(handler.preflight(file, {}, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  const during = new AbortController()
  await expect(handler.handle(file, {}, progress => { if (progress.stage === 'parsing') during.abort() }, { signal: during.signal })).rejects.toMatchObject({ name: 'AbortError' })
})
