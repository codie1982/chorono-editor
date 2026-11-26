import { describe, expect, it } from 'vitest'
import { MeshDeformationBinaryCodec } from './MeshDeformationBinaryCodec'
import { MeshDeformationClip } from './MeshDeformationClip'

function fixture(): MeshDeformationClip {
  return new MeshDeformationClip({
    topologyHash: 'topology-a',
    vertexCount: 2,
    componentCount: 3,
    sampleTimesMs: Float64Array.from([0, 100, 300]),
    positions: Float32Array.from([
      0, 0, 5, 10, 0, 6,
      0, 10, 7, 10, 20, 8,
      0, 30, 9, 10, 60, 10,
    ]),
    solverVersion: 'fixture-1',
    sourceRecipeHash: 'recipe-a',
  })
}

describe('MeshDeformationClip', () => {
  it('interpolates x/y by explicit non-uniform sample time and ignores z', () => {
    expect(Array.from(fixture().samplePositions(200))).toEqual([0, 20, 10, 40])
  })

  it('clamps by default and wraps only when loop playback is requested', () => {
    const clip = fixture()
    expect(Array.from(clip.samplePositions(400))).toEqual([0, 30, 10, 60])
    expect(Array.from(clip.samplePositions(400, true))).toEqual([0, 10, 10, 20])
  })

  it('rejects invalid time ordering and position sizes', () => {
    expect(() => new MeshDeformationClip({
      topologyHash: 'a', vertexCount: 1, componentCount: 2,
      sampleTimesMs: Float64Array.from([0, 0]), positions: Float32Array.from([0, 0, 1, 1]),
    })).toThrow('increase strictly')
    expect(() => new MeshDeformationClip({
      topologyHash: 'a', vertexCount: 2, componentCount: 2,
      sampleTimesMs: Float64Array.from([0]), positions: Float32Array.from([0, 0]),
    })).toThrow('length does not match')
  })
})

describe('MeshDeformationBinaryCodec', () => {
  it('round-trips raw typed samples and metadata', () => {
    const codec = new MeshDeformationBinaryCodec()
    const decoded = codec.decode(codec.encode(fixture()))
    expect(decoded.topologyHash).toBe('topology-a')
    expect(decoded.componentCount).toBe(3)
    expect(decoded.solverVersion).toBe('fixture-1')
    expect(Array.from(decoded.samplePositions(200))).toEqual([0, 20, 10, 40])
  })

  it('rejects bad magic and trailing bytes', () => {
    const codec = new MeshDeformationBinaryCodec()
    const encoded = codec.encode(fixture())
    new Uint8Array(encoded)[0] = 0
    expect(() => codec.decode(encoded)).toThrow('magic')
    const valid = codec.encode(fixture()), trailing = new Uint8Array(valid.byteLength + 1)
    trailing.set(new Uint8Array(valid))
    expect(() => codec.decode(trailing.buffer)).toThrow('length does not match')
  })
})
