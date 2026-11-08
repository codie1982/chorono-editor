import type { GPUCapabilityReport } from '../GPUCapabilities'
import type { GPUParticleDrawParams } from './ParticleGPUBackend'
import { ParticleBufferPacker, FLOATS_PER_PARTICLE } from './ParticleBufferPacker'
import { buildParticleShaderSources } from './WebGLParticleShader'
import { buildWebGLProgram, GpuStorageOwner, GpuBackendUnavailableError, gpuStorageAllocator, gpuColorBytes, type GLContext } from '../resources'
import type { ResourceAllocator } from '@/lib/resources/budget'

const STRIDE_BYTES = FLOATS_PER_PARTICLE * 4
const ATTRIBUTES = [
  { name:'a_position',size:2,offset:0 }, { name:'a_size',size:1,offset:2 },
  { name:'a_rotation',size:1,offset:3 }, { name:'a_opacity',size:1,offset:4 },
  { name:'a_color',size:4,offset:5 }, { name:'a_shapeId',size:1,offset:9 },
  { name:'a_shapeParam',size:1,offset:10 },
] as const

/**
 * Context-local program/VAO/VBO + CPU staging ownership. prepare preflights both
 * backing pixels and staging/VBO growth before allocation. No initial 50k store:
 * the existing packer's growth policy determines capacity. ResourceBudget owns
 * eviction ordering; GpuStorageOwner supplies job protection/idle destruction.
 * Draw submission, projection, blend state and performance queries belong to
 * the backend. Mutable buffers never enter scene JSON/history.
 */
export class WebGLParticleResources {
  private readonly owner: GpuStorageOwner
  private readonly packer = new ParticleBufferPacker()
  private program: WebGLProgram | null = null
  private quad: WebGLBuffer | null = null
  private instances: WebGLBuffer | null = null
  private vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null = null
  private instanceExt: ANGLE_instanced_arrays | null = null
  private vaoExt: OES_vertex_array_object | null = null
  private capacityBytes = 0
  private locations: Record<string,number> = {}
  private transform: WebGLUniformLocation | null = null
  private starPoints: WebGLUniformLocation | null = null

  /** No allocation until prepare. Native destruction clears query state through
   * onRelease but does not unregister the reusable backend's diagnostics. */
  constructor(private readonly gl: GLContext, private readonly canvas: HTMLCanvasElement,
    private readonly isGL2: boolean, private readonly cap: GPUCapabilityReport,
    private readonly onRelease: () => void, budget: ResourceAllocator = gpuStorageAllocator) {
    this.owner = new GpuStorageOwner(budget, () => this.destroy())
  }

  /** Pack/upload live data after accounting old + replacement working sets.
   * Returned count is alive instances, in input order. Source data is not mutated.
   * Borrowed canvas/storage remains protected through this JS job. */
  prepare(params: GPUParticleDrawParams): number {
    const { backingW:w, backingH:h } = params
    const pixels = gpuColorBytes(w,h), staging = this.packer.requiredCapacity(params.instances.length) * 4
    const capacity = Math.max(this.capacityBytes, staging)
    const bytes = pixels + 48 + capacity + staging
    const changed = !this.program || this.canvas.width !== w || this.canvas.height !== h || capacity !== this.capacityBytes
    this.owner.prepare(bytes, changed ? () => {
      if (!this.program) this.initialize()
      if (this.canvas.width !== w) this.canvas.width = w
      if (this.canvas.height !== h) this.canvas.height = h
      this.packer.prepareCapacity(params.instances.length)
      if (capacity !== this.capacityBytes) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.instances)
        this.gl.bufferData(this.gl.ARRAY_BUFFER,capacity,this.gl.DYNAMIC_DRAW)
        this.capacityBytes = capacity
      }
      if (this.gl.getError() !== this.gl.NO_ERROR) throw new Error('GPU particle storage allocation failed.')
    } : undefined)
    const count = this.packer.pack(params.instances,params.cfg,params.relativeTime,params.layerAlpha)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.instances)
    if (count) this.gl.bufferSubData(this.gl.ARRAY_BUFFER,0,this.packer.getBuffer().subarray(0,count*FLOATS_PER_PARTICLE))
    return count
  }

  /** Bind immutable geometry layout and current projection before submission. */
  bind(matrix: Float32Array, starPoints: number): void {
    const gl = this.gl
    gl.useProgram(this.program); gl.uniformMatrix3fv(this.transform,false,matrix); gl.uniform1i(this.starPoints,starPoints)
    if (this.vao) this.bindVao(this.vao)
    else this.setupAttributes()
  }
  /** Native instanced draw; caller owns timer and draw-count recording. */
  draw(count: number): void {
    const gl = this.gl
    if (this.isGL2) (gl as WebGL2RenderingContext).drawArraysInstanced(gl.TRIANGLES,0,6,count)
    else this.instanceExt!.drawArraysInstancedANGLE(gl.TRIANGLES,0,6,count)
    if (this.vao) this.bindVao(null)
  }
  /** Force invalidation on native loss/dispose; old canvas borrows expire. */
  clear(): void { this.owner.clear() }
  /** Explicit panel cleanup preserves active current-job borrows. */
  clearIdle(): void { this.owner.clearIdle() }
  /** Actual current stores, excluding default canvas already tracked elsewhere. */
  getSnapshot() { return { bufferBytes:(this.quad?48:0)+this.capacityBytes,stagingBytes:this.packer.getBuffer().byteLength,
    cleanupFailed:this.owner.getSnapshot().failedCleanup } }

  /** Allocate bounded handles/program only after the owner reserves bytes. */
  private initialize(): void {
    const gl = this.gl
    if (!this.isGL2) {
      this.instanceExt = gl.getExtension('ANGLE_instanced_arrays'); this.vaoExt = gl.getExtension('OES_vertex_array_object')
      gl.getExtension('OES_standard_derivatives')
      if (!this.instanceExt) throw new GpuBackendUnavailableError('ANGLE_instanced_arrays unavailable.')
    }
    const source = buildParticleShaderSources(this.isGL2,this.cap.supportsStandardDerivatives)
    this.program = buildWebGLProgram(gl,source.vertex,source.fragment)
    for (const a of ATTRIBUTES) this.locations[a.name] = gl.getAttribLocation(this.program,a.name)
    this.locations.a_corner = gl.getAttribLocation(this.program,'a_corner')
    this.transform = gl.getUniformLocation(this.program,'u_transform'); this.starPoints = gl.getUniformLocation(this.program,'u_starPoints')
    this.quad = gl.createBuffer(); this.instances = gl.createBuffer()
    if (!this.quad || !this.instances) throw new Error('GPU particle buffer allocation failed.')
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad)
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,.5,.5,-.5,-.5,.5,.5,-.5,.5]),gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.instances); gl.bufferData(gl.ARRAY_BUFFER,0,gl.DYNAMIC_DRAW)
    this.vao = this.isGL2 ? (gl as WebGL2RenderingContext).createVertexArray() : this.vaoExt?.createVertexArrayOES() ?? null
    if (this.vao) { this.bindVao(this.vao); this.setupAttributes(); this.bindVao(null) }
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND)
  }
  /** Layout is the authoritative 11-float packer format; offsets are in bytes. */
  private setupAttributes(): void {
    const gl = this.gl, corner = this.locations.a_corner
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad); gl.enableVertexAttribArray(corner)
    gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0); this.divisor(corner,0)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.instances)
    for (const a of ATTRIBUTES) {
      const location = this.locations[a.name]
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,a.size,gl.FLOAT,false,STRIDE_BYTES,a.offset*4); this.divisor(location,1)
    }
  }
  /** Native/extension adapters preserve identical VAO semantics. */
  private bindVao(vao: typeof this.vao): void {
    if (this.isGL2) (this.gl as WebGL2RenderingContext).bindVertexArray(vao as WebGLVertexArrayObject | null)
    else this.vaoExt?.bindVertexArrayOES(vao)
  }
  /** Native/ANGLE divisors use instance steps with identical units. */
  private divisor(location: number, value: number): void {
    if (this.isGL2) (this.gl as WebGL2RenderingContext).vertexAttribDivisor(location,value)
    else this.instanceExt!.vertexAttribDivisorANGLE(location,value)
  }
  /** VAOs release their buffer references before buffer deletion. Partial
   * cleanup keeps each remaining handle visible for idempotent retry. */
  private destroy(): void {
    const gl = this.gl
    this.onRelease()
    gl.useProgram(null); gl.bindBuffer(gl.ARRAY_BUFFER,null)
    if (this.vao) {
      this.bindVao(null)
      if (this.isGL2) (gl as WebGL2RenderingContext).deleteVertexArray(this.vao as WebGLVertexArrayObject)
      else this.vaoExt?.deleteVertexArrayOES(this.vao)
      this.vao = null
    }
    if (this.instances) { gl.deleteBuffer(this.instances); this.instances = null }
    if (this.quad) { gl.deleteBuffer(this.quad); this.quad = null }
    if (this.program) { gl.deleteProgram(this.program); this.program = null }
    this.canvas.width = this.canvas.height = 0; this.capacityBytes = 0; this.packer.clear()
  }
}
