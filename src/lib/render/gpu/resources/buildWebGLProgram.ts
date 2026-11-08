import type { GLContext } from './index'
import { GpuBackendUnavailableError } from './GpuBackendUnavailableError'

/** Compile/link one context-owned program. Temporary shaders are deleted on
 * every path, including second-shader failure; failed programs are deleted too.
 * Returned program belongs to the caller until deleteProgram/context loss.
 * Driver memory size is opaque; resource owners bound their program count. */
export function buildWebGLProgram(gl: GLContext, vertex: string, fragment: string): WebGLProgram {
  let vs: WebGLShader | null = null, fs: WebGLShader | null = null, program: WebGLProgram | null = null
  try {
    vs = compile(gl, gl.VERTEX_SHADER, vertex)
    fs = compile(gl, gl.FRAGMENT_SHADER, fragment)
    program = gl.createProgram()
    if (!program) throw new GpuBackendUnavailableError('WebGL createProgram failed.')
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new GpuBackendUnavailableError(`WebGL program link failed: ${gl.getProgramInfoLog(program) ?? 'unknown'}`)
    return program
  } catch (error) { if (program) gl.deleteProgram(program); throw error }
  finally { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs) }
}

/** Failed shader ownership is discharged before propagation. */
function compile(gl: GLContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new GpuBackendUnavailableError('WebGL createShader failed.')
  try {
    gl.shaderSource(shader, source); gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new GpuBackendUnavailableError(`WebGL shader compile failed: ${gl.getShaderInfoLog(shader) ?? 'unknown'}`)
    return shader
  } catch (error) { gl.deleteShader(shader); throw error }
}
