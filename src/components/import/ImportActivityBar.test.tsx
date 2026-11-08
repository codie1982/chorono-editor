import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ImportActivityBar } from './ImportActivityBar'

it('has an accessible cancel control and reports finalizing instead of premature completion', () => {
  const html = renderToStaticMarkup(createElement(ImportActivityBar, { activeCount: 1, settlingCount: 1, label: 'scene.png',
    progress: { stage: 'complete', label: 'Done', progress: 1 }, onCancel() {} }))
  expect(html).toContain('Cancel imports'); expect(html).toContain('role="status"')
  expect(html).toContain('Finalizing import'); expect(html).not.toContain('>Done<')
  expect(html).toContain('1 cancelled'); expect(html).toContain('settling')
})
it('shows settlement without offering an ineffective cancel button, then disappears when idle', () => {
  const props = { activeCount: 0, settlingCount: 1, label: null, progress: null, onCancel() {} }
  const html = renderToStaticMarkup(createElement(ImportActivityBar, props))
  expect(html).toContain('Finishing cancelled work'); expect(html).not.toContain('<button')
  expect(renderToStaticMarkup(createElement(ImportActivityBar, { ...props, settlingCount: 0 }))).toBe('')
})
