import { flushSync } from 'react-dom'
import { geometryModifierRegistry, modifierStackService } from '@/lib/modifiers'
import { fixture, current, frames, assert, equal } from './splineHarness'

/** Real 20-row stack layout: bounded independent scrolling and selection reveal
 * must leave the outer settings panel in place. No geometry change is needed. */
export async function checkModifierListScroll(): Promise<string> {
  const scene = fixture(), layer = scene.layers[1], stack = modifierStackService.stackFor(layer)
  const input = modifierStackService.evaluator.execute(stack, { layerId: layer.id })
  const modifiers = Array.from({ length: 20 }, (_, index) => geometryModifierRegistry.newRecord('offset', `scroll-${index}`, input, false))
  scene.layers[1] = modifierStackService.withGeometry(layer, { ...stack, modifiers }, input)
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTool('select') }); await frames()
  const history = document.querySelector<HTMLDetailsElement>('[aria-label="Source / History"]')!
  assert(history && !history.open, 'Spline source history must start closed')
  flushSync(() => history.querySelector('summary')!.click()); await frames()
  const region = document.querySelector<HTMLElement>('[aria-label="Ordered modifiers"]')!
  const frame = document.querySelector<HTMLElement>('[aria-label="Modifier stack"]')!
  assert(parseFloat(getComputedStyle(frame).borderLeftWidth) > 0, 'Modifier stack has no enclosing frame')
  assert(region.scrollHeight > region.clientHeight && region.clientHeight <= 288, '20 modifiers grew the list instead of scrolling')
  const beforeKeys = structuredClone(current().editor.getScene())
  flushSync(() => { region.focus(); region.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })) }); await frames()
  equal(current().editor.getScene(), beforeKeys, 'Focused modifier scrolling nudged the selected object')
  const panel = region.closest('aside')!, outerScroll = panel.scrollTop
  region.scrollTop = region.scrollHeight
  const last = region.querySelector<HTMLButtonElement>('[data-modifier-id="scroll-19"] button[aria-pressed]')!
  flushSync(() => last.click()); await frames()
  assert(last.getAttribute('aria-pressed') === 'true' && region.scrollTop > 0, 'Last modifier could not be selected in the scroll list')
  const source = region.querySelector<HTMLButtonElement>(':scope > button')!
  flushSync(() => source.click()); await frames()
  assert(region.scrollTop < 5 && panel.scrollTop === outerScroll, 'Selection reveal scrolled the outer panel or hid Source')
  assert(document.querySelector('[aria-label="Modifier stack"] > div button')?.textContent === 'Execute stack', 'Execute control disappeared into the list')
  return 'Modifier stack has a full frame and an independently bounded 20-row scroll region; Source/last-row selection remains reachable without scrolling Execute, pickers or the outer panel.'
}
