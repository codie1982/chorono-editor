import { fixtureEditor } from './browser-detail'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'

/** Exercises production React controls/history in the loopback-only fixture.
 * Synthetic DOM events supplement, not replace, trusted pointer verification.
 * Assertions compare actual committed source and history, never a UI surrogate.
 */
export async function checkModelClips(): Promise<string> {
  const results: string[] = [], tick = () => new Promise(resolve => setTimeout(resolve, 100))
  const root = () => document.querySelector<HTMLElement>('[aria-label="Item detail editor"]')!
  const source = () => fixtureEditor().getCommittedScene()
  const button = (text: string) => Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === text)!
  const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
  const click = async (el: HTMLElement) => { if (!el) throw new Error('Missing control'); el.click(); await tick() }
  const enter = async (el: HTMLInputElement, value: string) => {
    if (!el) throw new Error('Missing numeric input'); el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); await tick()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick()
  }
  const field = (label: string) => root().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  const schemaField = (label: string) => root().querySelector<HTMLInputElement>(`fieldset[aria-label="${label}"] input[type="text"]`)!
  const choose = async (label: string, value: string) => {
    const select = root().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await tick()
  }
  const check = async (name: string, run: () => Promise<void>) => { try { await run(); results.push(`PASS ${name}`) } catch (error) { results.push(`FAIL ${name}: ${String(error)}`); throw error } }
  try {
    await click(document.getElementById('reset-document')!)
    const before = source(), count = fixtureEditor().getCommittedHistory().past.length
    await check('open/create/key/seek remain private; evaluated inspector samples the local clip', async () => {
      await click(document.getElementById('open-model-detail')!); await click(button('+ Clip'))
      await choose('Content key channels', 'model3d.rotation.y'); await click(button('◆ Set Key'))
      await enter(field('Content time (ms)'), '1000'); await enter(schemaField('Rotation Y (deg)'), '90')
      await enter(field('Content time (ms)'), '500')
      assert(Number(schemaField('Rotation Y (deg)').value) === 45, 'Local interpolation not reflected in inspector')
      assert(source() === before && fixtureEditor().getCommittedHistory().past.length === count, 'Private edits touched main source')
      assert(root().querySelectorAll('[data-kf-id]').length === 2, 'Expected exactly two private key glyphs')
    })
    await check('key value/time/easing edit uses the sheet; local Undo/Redo restores actual keys', async () => {
      await click(button('Select all keys')); await click(button('Edit selected keys'))
      const rows = root().querySelectorAll('tbody tr'), last = rows[1]
      await click(last.querySelectorAll<HTMLButtonElement>('td')[2].querySelector('button')!)
      await enter(root().querySelector<HTMLInputElement>('input[aria-label="Key value"]')!, '120')
      assert(Number(schemaField('Rotation Y (deg)').value) === 60, 'Key sheet value did not update evaluated frame')
      await click(button('Undo')); assert(Number(schemaField('Rotation Y (deg)').value) === 45, 'Local Undo failed')
      await click(button('Redo')); assert(Number(schemaField('Rotation Y (deg)').value) === 60, 'Local Redo failed')
      const easing = root().querySelector<HTMLSelectElement>('tbody tr select')!
      easing.value = 'easeIn'; easing.dispatchEvent(new Event('change', { bubbles: true })); await tick()
      assert(Number(schemaField('Rotation Y (deg)').value) < 60, 'Easing edit did not affect local frame')
      await click(root().querySelector<HTMLButtonElement>('button[title="Close spreadsheet"]')!)
    })
    await check('Curve shows only private keys and shares local easing Undo with Keys', async () => {
      await click(button('Curve'))
      assert(root().querySelectorAll('[data-curve-key-id]').length === 2, 'Private curve projection is empty or mixed')
      await click(button('All')); await click(button('Bezier')); await click(button('Undo'))
      assert(source() === before, 'Curve easing changed main source before Apply')
      await click(button('Keys'))
    })
    await check('Apply creates one main Undo; global keys/manual items/assets are unchanged', async () => {
      await click(button('Apply & return'))
      assert(!document.querySelector('[aria-label="Item detail editor"]'), 'Apply did not close')
      const next = source(), animation = next.layers[1].model3d!.animation!
      assert(next.timelines === before.timelines && next.layers[0] === before.layers[0] && next.assets === before.assets, 'Unrelated source changed')
      assert(animation.clips[0].tracks[0].target === 'layers.content.model3d.rotation.y', 'Private address not persisted')
      assert(fixtureEditor().getCommittedHistory().past.length === count + 1, 'Apply did not create exactly one Undo')
      assert(Number(evaluateSceneFrame(parseSceneJson(JSON.stringify(next)), 500).overrides.get('layers.robot.model3d.rotation.y')) < 60, 'Saved frame differs')
      await click(document.getElementById('main-undo')!); assert(source() === before, 'Main Undo failed')
      await click(document.getElementById('main-redo')!); assert(source() === next, 'Main Redo failed')
    })
    await check('reopen retains key IDs; second clip is separate; Cancel/Discard retains saved work', async () => {
      const saved = source(), originalIds = saved.layers[1].model3d!.animation!.clips[0].tracks[0].keyframes.map(k => k.id)
      await click(document.getElementById('open-model-detail')!)
      assert(Array.from(root().querySelectorAll<HTMLElement>('[data-kf-id]')).map(el => el.dataset.kfId).join() === originalIds.join(), 'Reopen lost key identity')
      await click(button('+ Clip')); assert(!root().querySelector('[data-kf-id]'), 'Clips mixed into one timeline')
      await click(button('Cancel')); assert(root().querySelector('[aria-label="Unsaved detail changes"]'), 'Dirty exit was silent')
      await click(button('Stay')); await click(button('Cancel')); await click(button('Discard & return'))
      assert(source() === saved, 'Cancel overwrote saved content')
    })
    await check('stale main edit disables Apply and survives discard', async () => {
      await click(document.getElementById('open-model-detail')!); await click(button('+ Clip'))
      await click(document.getElementById('external-edit')!); assert(button('Apply & return').disabled, 'Stale apply allowed')
      await click(button('Cancel')); await click(button('Discard & return'))
      assert(source().layers[0].name === 'Manual update while detail open', 'Manual edit was lost')
    })
  } catch { /* Report the first failure without hiding completed assertions. */ }
  return results.join('\n')
}
