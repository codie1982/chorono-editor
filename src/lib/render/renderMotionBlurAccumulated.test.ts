import {afterEach,expect,it,vi} from 'vitest'
import {emptyScene,newRectLayer,DEFAULT_MOTION_BLUR} from '@/lib/defaults'
import {renderMotionBlurAccumulated} from './renderMotionBlurAccumulated'
import {gpuMotionBlur} from './gpu/effects/GPUMotionBlur'
import {renderSurfacePool} from './resources/CanvasSurfacePool'
import type {CanvasRenderer} from './CanvasRenderer'

afterEach(() => vi.restoreAllMocks())

/** Minimal caller fixture activates the velocity gate without native rendering. */
function fixture() {
  const scene=emptyScene(),layer=newRectLayer()
  layer.motionBlur={...DEFAULT_MOTION_BLUR,enabled:true,baked:false}
  scene.layers=[layer]
  vi.spyOn(gpuMotionBlur,'begin').mockReturnValue(true)
  const cancel=vi.spyOn(gpuMotionBlur,'cancel').mockImplementation(() => {})
  const overrides=new Map([[`layers.${layer.id}.transform.x`,100]])
  const invoke=(renderer:CanvasRenderer) => renderMotionBlurAccumulated(renderer,{} as CanvasRenderingContext2D,
    layer,overrides,new Map(),new Map(),scene,500,new Set())
  return {cancel,invoke}
}
it('releases the sample lease and pass when nested rendering throws', () => {
  const {cancel,invoke}=fixture(),release=vi.fn()
  vi.spyOn(renderSurfacePool,'acquire').mockReturnValue({canvas:{} as HTMLCanvasElement,
    context:{setTransform(){},clearRect(){}} as unknown as CanvasRenderingContext2D,release})
  expect(() => invoke({renderSingleLayer(){throw new Error('nested render failed')}} as unknown as CanvasRenderer)).toThrow('nested render failed')
  expect(release).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledOnce()
})
it('cancels a begun pass if sample admission fails before a lease exists', () => {
  const {cancel,invoke}=fixture()
  vi.spyOn(renderSurfacePool,'acquire').mockImplementation(() => {throw new RangeError('sample admission failed')})
  expect(() => invoke({} as CanvasRenderer)).toThrow('sample admission failed')
  expect(cancel).toHaveBeenCalledOnce()
})
