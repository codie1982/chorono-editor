import { expect, it } from 'vitest'
import { nativeToolArguments } from './NativeArguments'

it('keeps authorization out of native source data without stripping user nested metadata', () => {
  const input = { expectedRevision: 10, readToken: 'secret', requestId: 'retry', sessionId: 'tab',
    layerId: 'hero', patch: { metadata: { requestId: 'authored-user-field' } } }
  const payload = nativeToolArguments(input)
  expect(payload).toEqual({ layerId: 'hero', patch: input.patch })
  expect(input.readToken).toBe('secret')
})
