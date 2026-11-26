import { hashMesh2DCanonical } from '@/lib/geometry/mesh2d'
import { MeshDeformationBinaryCodec, MeshDeformationClip } from '@/lib/mesh2d'
import { editorResourceBudget, type ResourceAllocator, type ResourceReservation } from '@/lib/resources/budget'
import { cancelledJobError } from '@/lib/resources/jobs'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'
import type { BakeAdapter, BakePreparationContext, BakeSourceIdentity } from '../BakeContracts'

const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024 ** 2
const CODEC_OVERHEAD_RESERVE = 64 * 1024

/** Serializable recipe for one fixed-topology dense vertex clip. Times are
 * clip-local milliseconds; positions are supplied separately as runtime input. */
export interface MeshDeformationBakeRecipe {
  version: 1
  kind: 'meshDeformation'
  source: BakeSourceIdentity
  layerId: string
  topologyHash: string
  vertexCount: number
  componentCount: 2 | 3
  sampleTimesMs: readonly number[]
  solverVersion: string
  sourceRecipeHash: string
}

export interface MeshDeformationBakeReport {
  readonly vertexCount: number
  readonly componentCount: 2 | 3
  readonly sampleCount: number
  readonly durationMs: number
  readonly payloadBytes: number
  readonly encodedBytes: number
  readonly topologyHash: string
  readonly sourceRecipeHash: string
  readonly codec: 'CHMD2D01'
}

/**
 * Owns a prepared clip, encoded bytes and their preview-budget reservation.
 *
 * Access is valid only until `release`. BakeService calls release on cancel,
 * stale, failed commit, successful ownership transfer and disposal. The binary
 * buffer is borrowed only inside `withEncodedBytes`; callers must copy/adopt it
 * synchronously and must not mutate it.
 */
export class MeshDeformationBakePreview {
  readonly recipe: MeshDeformationBakeRecipe
  readonly report: MeshDeformationBakeReport
  private clipValue: MeshDeformationClip | undefined
  private encodedValue: ArrayBuffer | undefined
  private reservation: ResourceReservation | undefined

  constructor(input: {
    recipe: MeshDeformationBakeRecipe
    report: MeshDeformationBakeReport
    clip: MeshDeformationClip
    encoded: ArrayBuffer
    reservation: ResourceReservation
  }) {
    this.recipe = input.recipe
    this.report = input.report
    this.clipValue = input.clip
    this.encodedValue = input.encoded
    this.reservation = input.reservation
  }

  /** Borrow the immutable runtime clip while this preview is live. */
  get clip(): MeshDeformationClip {
    if (!this.clipValue) throw new Error('Mesh deformation bake preview was released')
    return this.clipValue
  }

  /** Borrow encoded CHMD2D01 bytes synchronously without an additional copy. */
  withEncodedBytes<T>(consume: (bytes: ArrayBuffer) => T): T {
    if (!this.encodedValue) throw new Error('Mesh deformation bake preview was released')
    return consume(this.encodedValue)
  }

  /** Idempotently releases the budget charge and dense preview references. */
  release(): void {
    this.reservation?.release()
    this.reservation = undefined
    this.clipValue = undefined
    this.encodedValue = undefined
  }
}

export interface MeshDeformationBakeAdapterOptions {
  readonly allocator?: ResourceAllocator
  readonly maxPayloadBytes?: number
}

/**
 * Converts sampled fixed-topology positions into the existing runtime/binary
 * clip format behind the common BakeAdapter contract.
 *
 * Source geometry and solver positions are borrowed and never mutated. The
 * adapter validates topology/shape before allocation, reserves worst-case peak
 * preview bytes, then shrinks the charge to retained clip + encoded storage.
 */
export class MeshDeformationBakeAdapter implements BakeAdapter<MeshDeformationBakeRecipe, MeshDeformationBakePreview> {
  readonly kind = 'meshDeformation'
  private readonly codec = new MeshDeformationBinaryCodec()
  private readonly allocator: ResourceAllocator
  private readonly maxPayloadBytes: number

  constructor(
    private readonly geometry: Mesh2DGeometry,
    private readonly positions: Float32Array,
    options: MeshDeformationBakeAdapterOptions = {},
  ) {
    this.allocator = options.allocator ?? editorResourceBudget
    this.maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES
    if (!Number.isSafeInteger(this.maxPayloadBytes) || this.maxPayloadBytes < 1) {
      throw new RangeError('Mesh deformation bake payload limit is invalid')
    }
  }

  /** Prepares one owned clip and binary payload; no scene/asset mutation occurs. */
  prepare(recipe: MeshDeformationBakeRecipe, context: BakePreparationContext): MeshDeformationBakePreview {
    this.validateRecipe(recipe)
    const sampleCount = recipe.sampleTimesMs.length
    const positionValues = safeProduct(sampleCount, recipe.vertexCount, recipe.componentCount)
    if (this.positions.length !== positionValues) {
      throw new RangeError('Mesh deformation sampled positions do not match the recipe dimensions')
    }
    const payloadBytes = safeAdd(safeProduct(sampleCount, Float64Array.BYTES_PER_ELEMENT), this.positions.byteLength)
    if (payloadBytes > this.maxPayloadBytes) {
      throw new RangeError(`Mesh deformation payload exceeds ${this.maxPayloadBytes} bytes`)
    }
    checkCancelled(context.signal)
    const peakBytes = safeAdd(safeProduct(payloadBytes, 3), CODEC_OVERHEAD_RESERVE)
    const reservation = this.allocator.reserve('preview', peakBytes)
    if (!reservation) throw new RangeError('Mesh deformation preview exceeds the managed resource budget')
    try {
      checkCancelled(context.signal)
      context.reportProgress({ value: .1, phase: 'validate', message: 'Topology and dense sample dimensions validated.' })
      const clip = new MeshDeformationClip({
        topologyHash: recipe.topologyHash,
        vertexCount: recipe.vertexCount,
        componentCount: recipe.componentCount,
        sampleTimesMs: Float64Array.from(recipe.sampleTimesMs),
        positions: this.positions,
        solverVersion: recipe.solverVersion,
        sourceRecipeHash: recipe.sourceRecipeHash,
      })
      checkCancelled(context.signal)
      context.reportProgress({ value: .55, phase: 'encode', message: 'Encoding portable deformation clip.' })
      const encoded = this.codec.encode(clip)
      checkCancelled(context.signal)
      const retainedBytes = safeAdd(clip.byteLength, encoded.byteLength)
      if (!reservation.resize(retainedBytes)) throw new RangeError('Mesh deformation retained preview exceeds the managed resource budget')
      reservation.commit()
      const report: MeshDeformationBakeReport = {
        vertexCount: clip.vertexCount,
        componentCount: clip.componentCount,
        sampleCount: clip.sampleCount,
        durationMs: clip.durationMs,
        payloadBytes: clip.byteLength,
        encodedBytes: encoded.byteLength,
        topologyHash: clip.topologyHash,
        sourceRecipeHash: recipe.sourceRecipeHash,
        codec: 'CHMD2D01',
      }
      context.reportProgress({ value: .95, phase: 'preview', message: 'Deformation preview and binary asset are ready.' })
      return new MeshDeformationBakePreview({ recipe, report, clip, encoded, reservation })
    } catch (error) {
      reservation.release()
      throw error
    }
  }

  private validateRecipe(recipe: MeshDeformationBakeRecipe): void {
    if (recipe.kind !== this.kind || recipe.version !== 1) throw new Error('Mesh deformation bake recipe version is unsupported')
    if (!recipe.layerId || recipe.source.ownerId !== recipe.layerId || recipe.source.kind !== 'mesh2dGeometry') {
      throw new Error('Mesh deformation bake source identity is invalid')
    }
    const geometryHash = hashMeshDeformationBakeGeometry(this.geometry)
    if (recipe.source.revision !== geometryHash || recipe.topologyHash !== this.geometry.topology.topologyHash) {
      throw new Error('Mesh deformation bake geometry is stale')
    }
    if (recipe.vertexCount !== this.geometry.topology.vertexIds.length) {
      throw new RangeError('Mesh deformation vertex count does not match its topology')
    }
    if (!recipe.solverVersion || !recipe.sourceRecipeHash) throw new Error('Mesh deformation provenance is incomplete')
  }
}

/** Creates a deterministic recipe/source identity for one Mesh2D geometry. */
export function createMeshDeformationBakeRecipe(input: {
  readonly layerId: string
  readonly geometry: Mesh2DGeometry
  readonly componentCount: 2 | 3
  readonly sampleTimesMs: readonly number[]
  readonly solverVersion: string
  /** Stable hash/version of solver settings, fields, pins and other inputs. */
  readonly sourceVersion: string
}): MeshDeformationBakeRecipe {
  const geometryHash = hashMeshDeformationBakeGeometry(input.geometry)
  const sourceRecipeHash = hashMesh2DCanonical('mesh-deformation-recipe-v1', [
    `geometry:${geometryHash}`,
    `solver:${input.solverVersion}`,
    `source:${input.sourceVersion}`,
    `components:${input.componentCount}`,
    `samples:${input.sampleTimesMs.length}`,
    ...input.sampleTimesMs.map(time => `t:${String(time)}`),
  ])
  return {
    version: 1,
    kind: 'meshDeformation',
    source: { kind: 'mesh2dGeometry', ownerId: input.layerId, revision: geometryHash },
    layerId: input.layerId,
    topologyHash: input.geometry.topology.topologyHash,
    vertexCount: input.geometry.topology.vertexIds.length,
    componentCount: input.componentCount,
    sampleTimesMs: Array.from(input.sampleTimesMs),
    solverVersion: input.solverVersion,
    sourceRecipeHash,
  }
}

/** Hashes rest positions plus connectivity identity, excluding appearance and transforms. */
export function hashMeshDeformationBakeGeometry(geometry: Mesh2DGeometry): string {
  return hashMesh2DCanonical('mesh-deformation-source-v1', [
    `topology:${geometry.topology.topologyHash}`,
    `positions:${geometry.positions.length}`,
    ...geometry.positions.map(value => `p:${String(value)}`),
  ])
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledJobError()
}

function safeProduct(...values: number[]): number {
  const result = values.reduce((product, value) => product * value, 1)
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError('Mesh deformation bake dimensions exceed supported limits')
  return result
}

function safeAdd(...values: number[]): number {
  const result = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError('Mesh deformation bake byte size exceeds supported limits')
  return result
}
