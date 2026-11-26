import { MeshDeformationClip } from './MeshDeformationClip'

const MAGIC = new TextEncoder().encode('CHMD2D01')
const PREFIX_BYTES = MAGIC.byteLength + 4
const MAX_HEADER_BYTES = 64 * 1024

interface ClipHeader {
  schemaVersion: 1
  topologyHash: string
  vertexCount: number
  componentCount: 2 | 3
  sampleCount: number
  solverVersion?: string
  sourceRecipeHash?: string
}

/**
 * Binary codec for portable raw Mesh2D deformation assets.
 *
 * Layout is `CHMD2D01`, little-endian uint32 JSON-header byte length, UTF-8
 * header, Float64 sample times, then Float32 sample-major positions. Decoding
 * validates every count before allocating and copies into owned typed buffers;
 * trailing bytes and unsupported versions are rejected. This raw format favors
 * correctness and deterministic playback; compression is a future codec.
 */
export class MeshDeformationBinaryCodec {
  decode(buffer: ArrayBuffer): MeshDeformationClip {
    if (buffer.byteLength < PREFIX_BYTES) throw new Error('Mesh deformation asset is truncated')
    const bytes = new Uint8Array(buffer)
    if (!MAGIC.every((value, index) => bytes[index] === value)) throw new Error('Mesh deformation asset magic is invalid')
    const view = new DataView(buffer)
    const headerLength = view.getUint32(MAGIC.byteLength, true)
    if (headerLength < 2 || headerLength > MAX_HEADER_BYTES || PREFIX_BYTES + headerLength > buffer.byteLength) {
      throw new RangeError('Mesh deformation header length is invalid')
    }
    let header: ClipHeader
    try {
      header = JSON.parse(new TextDecoder().decode(bytes.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLength))) as ClipHeader
    } catch {
      throw new Error('Mesh deformation header JSON is invalid')
    }
    this.validateHeader(header)
    const timesBytes = this.safeProduct(header.sampleCount, Float64Array.BYTES_PER_ELEMENT)
    const positionValues = this.safeProduct(header.sampleCount, header.vertexCount, header.componentCount)
    const positionsBytes = this.safeProduct(positionValues, Float32Array.BYTES_PER_ELEMENT)
    const expected = PREFIX_BYTES + headerLength + timesBytes + positionsBytes
    if (expected !== buffer.byteLength) throw new RangeError('Mesh deformation binary length does not match its header')
    let offset = PREFIX_BYTES + headerLength
    const times = new Float64Array(header.sampleCount)
    for (let index = 0; index < times.length; index++, offset += 8) times[index] = view.getFloat64(offset, true)
    const positions = new Float32Array(positionValues)
    for (let index = 0; index < positions.length; index++, offset += 4) positions[index] = view.getFloat32(offset, true)
    return new MeshDeformationClip({ ...header, sampleTimesMs: times, positions })
  }

  /** Encodes one owned clip into a new ordinary ArrayBuffer. */
  encode(clip: MeshDeformationClip): ArrayBuffer {
    const header: ClipHeader = {
      schemaVersion: 1,
      topologyHash: clip.topologyHash,
      vertexCount: clip.vertexCount,
      componentCount: clip.componentCount,
      sampleCount: clip.sampleCount,
      solverVersion: clip.solverVersion,
      sourceRecipeHash: clip.sourceRecipeHash,
    }
    const headerBytes = new TextEncoder().encode(JSON.stringify(header))
    if (headerBytes.byteLength > MAX_HEADER_BYTES) throw new RangeError('Mesh deformation header exceeds its byte limit')
    const times = clip.sampleTimes(), positions = clip.packedPositions()
    const total = PREFIX_BYTES + headerBytes.byteLength + times.byteLength + positions.byteLength
    const buffer = new ArrayBuffer(total), bytes = new Uint8Array(buffer), view = new DataView(buffer)
    bytes.set(MAGIC, 0)
    view.setUint32(MAGIC.byteLength, headerBytes.byteLength, true)
    bytes.set(headerBytes, PREFIX_BYTES)
    let offset = PREFIX_BYTES + headerBytes.byteLength
    times.forEach(value => { view.setFloat64(offset, value, true); offset += 8 })
    positions.forEach(value => { view.setFloat32(offset, value, true); offset += 4 })
    return buffer
  }

  private validateHeader(header: ClipHeader): void {
    if (!header || header.schemaVersion !== 1) throw new Error('Mesh deformation schema version is unsupported')
    if (typeof header.topologyHash !== 'string' || !header.topologyHash) throw new Error('Mesh deformation topology hash is missing')
    if (!Number.isSafeInteger(header.vertexCount) || header.vertexCount < 1) throw new RangeError('Mesh deformation vertex count is invalid')
    if (header.componentCount !== 2 && header.componentCount !== 3) throw new RangeError('Mesh deformation component count is invalid')
    if (!Number.isSafeInteger(header.sampleCount) || header.sampleCount < 1) throw new RangeError('Mesh deformation sample count is invalid')
  }

  private safeProduct(...values: number[]): number {
    const product = values.reduce((result, value) => result * value, 1)
    if (!Number.isSafeInteger(product) || product < 1 || product > 0x7fffffff) throw new RangeError('Mesh deformation dimensions exceed supported limits')
    return product
  }
}
