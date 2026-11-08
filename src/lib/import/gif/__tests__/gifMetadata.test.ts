import { expect, it } from 'vitest'
import { animatedGif, staticGif, partialGif } from './gifFixtures'
import { readGifMetadata } from '../readGifMetadata'
import { planGifSheet } from '../planGifSheet'
import { resolveGifLimits } from '../types'

it('scans GIF87a/89a dimensions/count without native decode and preserves square packing/padded bytes', () => {
  const limits = resolveGifLimits(), bytes = animatedGif(), original = bytes.slice()
  expect(readGifMetadata(staticGif().buffer, limits)).toEqual({ width: 4, height: 4, frameCount: 1 })
  const metadata = readGifMetadata(bytes.buffer, limits)
  expect(metadata).toEqual({ width: 4, height: 4, frameCount: 3 })
  expect(readGifMetadata(partialGif().buffer, limits)).toEqual(metadata)
  expect(planGifSheet(metadata, limits)).toMatchObject({ columns: 2, rows: 2, sheetWidth: 8, sheetHeight: 8, frameBytes: 64, sheetBytes: 256 })
  expect(bytes).toEqual(original)
  expect(() => planGifSheet(metadata, resolveGifLimits({ maxSheetBytes: 3 * 64 }))).toThrow('sprite sheet')
})

it('rejects truncated framing, palette/sub-block overruns, bad rectangles and missing/trailing terminators', () => {
  const limits = resolveGifLimits(), source = animatedGif()
  for (let end = 0; end < source.length; end++) expect(() => readGifMetadata(source.slice(0, end).buffer, limits)).toThrow(/GIF/)
  const first = Array.from(source).indexOf(0x2c)
  const mutations: ((bytes: Uint8Array) => void)[] = [
    b => { b[0] = 0 }, b => { b[6] = 0; b[7] = 0 }, b => { b[first + 5] = 5 },
    b => { b[first + 1] = 3 }, b => { b[first + 10] = 1 },
    b => { b[first + 11] = 255 }, b => { b[first + 9] = 0x87 },
  ]
  for (const mutate of mutations) { const bytes = source.slice(); mutate(bytes); expect(() => readGifMetadata(bytes.buffer, limits)).toThrow(/GIF/) }
  const extra = new Uint8Array(source.length + 1); extra.set(source)
  expect(() => readGifMetadata(extra.buffer, limits)).toThrow('trailing')
  const plainText = source.slice(); plainText[26] = 1
  expect(() => readGifMetadata(plainText.buffer, limits)).toThrow('plain-text')
})

it('enforces input/frame/dimension/count policy before native work and validates policy numbers', () => {
  const bytes = animatedGif()
  for (const policy of [{ maxInputBytes: bytes.length - 1 }, { maxFrames: 2 }, { maxDimension: 3 }, { maxFrameBytes: 63 }]) {
    expect(() => readGifMetadata(bytes.buffer, resolveGifLimits(policy))).toThrow(RangeError)
  }
  for (const policy of [{ maxFrames: 0 }, { maxInputBytes: Infinity }, { maxDimension: NaN }, { maxOutputBytes: -1 }]) expect(() => resolveGifLimits(policy)).toThrow(RangeError)
  expect(() => planGifSheet({ width: 4, height: 4, frameCount: 0 }, resolveGifLimits())).toThrow('Invalid')
  expect(() => planGifSheet({ width: 65535, height: 65535, frameCount: 3 }, resolveGifLimits())).toThrow('limit')
})
