import { expect, it } from 'vitest'
import { emptyScene } from '../../defaults'
import { isChoronoScene, parseSceneJson } from './SceneJsonConverter'

it('preserves IDs/unknown data and distinguishes merge-source minimum from full editor arrays', () => {
  const original = { ...emptyScene(), extension: { value: 'preserved' } }, text = JSON.stringify(original)
  expect(parseSceneJson(text, true)).toEqual(original)
  const fragment = { formatVersion: '1.0', layers: [], composition: original.composition }
  expect(isChoronoScene(fragment)).toBe(true); expect(isChoronoScene(fragment, true)).toBe(false)
  expect(() => parseSceneJson(JSON.stringify(fragment), true)).toThrow('complete Chorono scene')
})
it('rejects wrong roots/versions/null composition without hiding syntax errors', () => {
  for (const value of [null, [], {}, { formatVersion: '2.0', layers: [], composition: {} }, { formatVersion: '1.0', layers: [], composition: null }]) expect(isChoronoScene(value)).toBe(false)
  expect(() => parseSceneJson('{broken')).toThrow(SyntaxError)
  expect(() => parseSceneJson('{}')).toThrow('valid Chorono scene')
})
