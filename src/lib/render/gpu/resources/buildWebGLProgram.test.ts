import { expect, it, vi } from 'vitest'
import { buildWebGLProgram } from './buildWebGLProgram'
import type { GLContext } from './index'
import { GpuBackendUnavailableError } from './GpuBackendUnavailableError'

/** Opaque handle fixture: records ownership, not shader compilation correctness. */
function fixture(fragmentOK = true, linkOK = true) {
  const shaders = [{id:1},{id:2}], program = {id:3}
  const gl = {VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    createShader:vi.fn().mockReturnValueOnce(shaders[0]).mockReturnValueOnce(shaders[1]),
    shaderSource:vi.fn(),compileShader:vi.fn(),getShaderParameter:vi.fn(shader => shader===shaders[0] || fragmentOK),
    getShaderInfoLog:() => 'compile failed',deleteShader:vi.fn(),createProgram:() => program,
    attachShader:vi.fn(),linkProgram:vi.fn(),getProgramParameter:() => linkOK,getProgramInfoLog:() => 'link failed',deleteProgram:vi.fn()}
  return {gl,shaders,program,context:gl as unknown as GLContext}
}
it('deletes temporary shaders while transferring only the successful program', () => {
  const f = fixture()
  expect(buildWebGLProgram(f.context,'vs','fs')).toBe(f.program)
  expect(f.gl.deleteShader.mock.calls.flat()).toEqual(f.shaders)
  expect(f.gl.deleteProgram).not.toHaveBeenCalled()
})
it('deletes the first shader too when the second shader fails compilation', () => {
  const f = fixture(false)
  expect(() => buildWebGLProgram(f.context,'vs','fs')).toThrow(GpuBackendUnavailableError)
  expect(new Set(f.gl.deleteShader.mock.calls.flat())).toEqual(new Set(f.shaders))
  expect(f.gl.deleteShader).toHaveBeenCalledTimes(2)
})
it('deletes failed programs and both temporary shaders on link failure', () => {
  const f = fixture(true,false)
  expect(() => buildWebGLProgram(f.context,'vs','fs')).toThrow('link failed')
  expect(f.gl.deleteProgram).toHaveBeenCalledWith(f.program)
  expect(f.gl.deleteShader).toHaveBeenCalledTimes(2)
})
