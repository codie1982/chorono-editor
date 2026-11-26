import { describe, expect, it } from 'vitest'
import { newGroupLayer } from '@/lib/registry/definitions/scene/GroupDefinition'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { makePivotCommand } from '@/lib/rig2d/commands'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { acceptsPivotPick } from './usePivotPicking'
import { selectedPivotRelations, viewportPivots } from './pivotViewport'

function setup() {
  const group = newGroupLayer(); group.id = 'g'
  group.transform = { ...group.transform, x: 20, y: 30, rotationDeg: 90, anchorX: 0, anchorY: 0 }
  const parts = ['root','lower','target','other'].map((id,i) => {
    const layer = newRectLayer()
    return { ...layer, id, parentId: group.id, transform: { ...layer.transform, x: i*40, y: 0, anchorX: 0, anchorY: 0 } }
  })
  let scene = { ...emptyScene(), layers: [group, ...parts] }
  scene = makePivotCommand(scene,'lower',{kind:'link',driverId:'root'}).execute(scene)
  scene = makePivotCommand(scene,'root',{kind:'ik',lowerId:'lower',targetId:'target'}).execute(scene)
  return scene
}
describe('viewport pivot relationships', () => {
  it('shows both directed connections once from any IK participant, omitting unrelated layers', () => {
    const { layers } = setup()
    const expected = [{from:'lower',to:'root',kind:'link'}, {from:'lower',to:'target',kind:'ik'}]
    for (const ids of [['root'],['lower'],['target'],['root','lower','target']]) {
      expect(selectedPivotRelations(layers,new Set(ids))).toEqual(expected)
    }
    expect(selectedPivotRelations(layers,new Set(['other']))).toEqual([])
  })
  it('uses the solved pose inside a transformed group and excludes an invisible ancestor', () => {
    const scene = setup()
    const overrides = evaluateSceneFrame(scene,0,{baseOverrides:new Map([['layers.target.transform.x',40],['layers.target.transform.y',40]])}).overrides
    const point = viewportPivots(scene,0,overrides)('target')!
    expect(point.x).toBeCloseTo(-20)
    expect(point.y).toBeCloseTo(70)
    expect(viewportPivots(scene,0,new Map([['layers.g.hidden',true]]))('lower')).toBeNull()
  })
  it('accepts only a sibling at each pick step and preserves a separate target', () => {
    const [group,root,lower,target,other] = setup().layers
    const pick = {ownerId:root.id,step:'lower' as const}
    expect([group,root,lower,target,other].filter(item=>acceptsPivotPick(pick,root,item))).toEqual([lower])
    expect(acceptsPivotPick({ownerId:root.id,step:'driver'},root,group)).toBe(false)
    const end = {ownerId:root.id,step:'target' as const,lowerId:lower.id}
    expect(acceptsPivotPick(end,root,target)).toBe(true)
    expect(acceptsPivotPick(end,root,lower)).toBe(false)
  })
})
