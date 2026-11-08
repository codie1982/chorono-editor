import { describe, expect, it } from 'vitest'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { buildParticleAffineTransformMatrix, buildParticleTransformMatrix } from './WebGLInstancedQuadBackend'

function apply(matrix: Float32Array, x: number, y: number) {
  return { x:matrix[0] * x + matrix[3] * y + matrix[6], y:matrix[1] * x + matrix[4] * y + matrix[7] }
}

describe('particle GPU backing transform', () => {
  it('retains parent rotation, child placement, canvas pan, zoom and DPR exactly once', () => {
    const parent=Matrix2D.translation(200,100).rotate(90)
    const child=Matrix2D.translation(30,40)
    const canvas=Matrix2D.scale(2).translate(7,-3).scale(1.5)
    const matrix=buildParticleAffineTransformMatrix(1280,720,canvas.multiply(parent).multiply(child))
    const clip=apply(matrix,10,20)
    // Child-local (10,20) → world (140,140) → backing pixels (434,414).
    expect(clip.x).toBeCloseTo(434 * 2 / 1280 - 1,6)
    expect(clip.y).toBeCloseTo(1 - 414 * 2 / 720,6)
  })

  it('keeps a repeater or nonuniformly scaled parent affine without losing shear', () => {
    const matrix=buildParticleAffineTransformMatrix(680,420,new Matrix2D(1.5,0.25,0.4,0.8,123,56))
    const clip=apply(matrix,-15,35)
    expect(clip.x).toBeCloseTo(114.5 * 2 / 680 - 1,6)
    expect(clip.y).toBeCloseTo(1 - 80.25 * 2 / 420,6)
  })

  it('preserves reflections and offscreen backing dimensions', () => {
    const matrix=buildParticleAffineTransformMatrix(960,720,new Matrix2D(-1.25,0.4,0.7,2,320,20))
    const clip=apply(matrix,80,90)
    expect(clip.x).toBeCloseTo(283 * 2 / 960 - 1,6)
    expect(clip.y).toBeCloseTo(1 - 232 * 2 / 720,6)
  })

  it('matches the legacy root-layer path including its anchor when no parent basis is needed', () => {
    const display={x:22,y:-5,rotationDeg:42,scaleX:1.6,scaleY:0.4}
    const ax=14,ay=9
    const layer=Matrix2D.translation(display.x+ax,display.y+ay).rotate(display.rotationDeg)
      .scale(display.scaleX,display.scaleY).translate(-ax,-ay)
    const current=buildParticleAffineTransformMatrix(640,360,layer)
    const legacy=buildParticleTransformMatrix(640,360,display,ax,ay)
    Array.from(legacy).forEach((value,index)=>expect(current[index]).toBeCloseTo(value,6))
  })

  it('projects doubled backing pixels identically at double device resolution', () => {
    const layer=new Matrix2D(1.3,-0.2,0.4,0.9,70,35)
    const ordinary=buildParticleAffineTransformMatrix(640,360,layer)
    const doubled=buildParticleAffineTransformMatrix(1280,720,Matrix2D.scale(2).multiply(layer))
    expect(Array.from(doubled)).toEqual(Array.from(ordinary))
  })

  it('rejects invalid backing sizes and nonfinite affine data before a GL uniform upload', () => {
    expect(()=>buildParticleAffineTransformMatrix(0,720,Matrix2D.identity())).toThrow('positive dimensions')
    expect(()=>buildParticleAffineTransformMatrix(960,Infinity,Matrix2D.identity())).toThrow('finite values')
    expect(()=>buildParticleAffineTransformMatrix(960,720,new Matrix2D(1,0,0,1,NaN,0))).toThrow('finite values')
  })
})
