import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, ShaderMaterial, Vector3, type Camera, type Scene, type WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js'
import { emptyModelSceneDocument } from './source/emptyModelScene'
import { modelFraming } from './render/modelFraming'
import { ModelAssetService } from './resources/ModelAssetService'
import { withModelContent } from './content/modelContent'
import { modelDefaults, validateModel } from './source/modelDefaults'
import { prepareModelSource } from './resources/modelInventory'
import { ModelComposition } from './render/ModelComposition'
import { addPrimitive, updatePrimitive, PRIMITIVE_SELECTION_INSTANCE } from './modeling/poly/primitiveSource'
import { calibrateModelInstance, DEFAULT_MODEL_MEASUREMENT } from './measurement/modelMeasurement'

afterEach(() => vi.unstubAllGlobals())
describe('explicit portable empty 3D scene', () => {
  it('keeps arbitrary empty/degenerate imports invalid while explicitly empty framing stays finite', () => {
    const root = new Object3D()
    expect(() => modelFraming(root)).toThrow(/bounds/)
    root.userData.choronoEmptyScene = true
    expect(modelFraming(root).radius).toBe(1)
    root.add(new Object3D()); expect(() => modelFraming(root)).toThrow(/bounds/)
  })
  it('loads the generated source through actual GLTFLoader and initializes editable 3D content with bounded ownership', async () => {
    vi.stubGlobal('ProgressEvent', class extends Event {})
    const service = new ModelAssetService(), json = JSON.stringify(emptyModelSceneDocument())
    const lease = await service.acquire({ id: 'empty', name: 'Empty 3D Scene.gltf', type: 'model3d', url: `data:model/gltf+json;base64,${btoa(json)}` })
    try {
      expect(lease.value.inventory).toBeDefined()
      expect(lease.value.isExplicitEmptyScene).toBe(true)
      const source = withModelContent(modelDefaults('empty'), lease.value.inventory!)
      expect(source.version).toBe(3); expect(Object.keys(source.content!.instances)).toEqual(['primary'])
      expect(() => validateModel(source)).not.toThrow()
      expect(source.content!.view.projection).toBe('perspective')
    } finally { lease.release(); service.clearIdle() }
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('shows the reusable grid only when inspection asks for it and never in output', async () => {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(emptyModelSceneDocument()), '')
    const source = prepareModelSource(gltf.scene, gltf.animations, gltf.parser, 'a'.repeat(64))
    const data = withModelContent(modelDefaults('empty'), source.inventory)
    const world = new ModelComposition(source, () => undefined)
    let grid: Mesh | undefined, renderedCamera: Camera | undefined
    const renderer = { render: (scene: Scene, camera: Camera) => { grid = scene.children.find(child => child.userData.choronoInspectionGrid) as Mesh | undefined; renderedCamera = camera } } as unknown as WebGLRenderer
    try {
      const camera = { ...data.camera, projection: 'perspective' as const, orthoHeight: 2.8 }
      world.configure(data, 600, 400, undefined, { camera, showGrid: true })
      world.draw(renderer)
      expect(grid?.visible).toBe(true)
      const geometry = grid!.geometry, firstStep = (grid!.material as ShaderMaterial).uniforms.majorStep.value as number
      world.configure(data, 600, 400, undefined, { camera: { ...camera, targetX: 1000, distance: 1000 }, showGrid: true })
      world.draw(renderer)
      expect(grid!.geometry).toBe(geometry)
      expect(grid!.position.x).toBe(1000)
      expect((grid!.material as ShaderMaterial).uniforms.majorStep.value).toBeGreaterThan(firstStep)
      world.configure(data, 600, 400, undefined, { camera: { ...camera, pitch: 90 }, showGrid: true })
      world.draw(renderer)
      const toTarget = new Vector3().sub(renderedCamera!.position)
      expect(renderedCamera!.up.dot(toTarget)).toBeCloseTo(0)
      expect(world.frame()).toEqual({ target: { x: 0, y: 0, z: 0 }, distance: 3.5, orthoHeight: 2.8 })
      source.root.userData.choronoEmptyScene = false
      world.configure(data, 600, 400, undefined, { camera, showGrid: true })
      expect(grid?.visible).toBe(true)
      world.configure(data, 600, 400, undefined, { camera, showGrid: false })
      expect(grid?.visible).toBe(false)
      world.configure(data, 600, 400)
      world.draw(renderer)
      expect(grid?.visible).toBe(false)
    } finally { world.dispose() }
  })
  it('projects and picks an authored primitive gizmo in the same 3D viewport', async () => {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(emptyModelSceneDocument()), '')
    const source = prepareModelSource(gltf.scene, gltf.animations, gltf.parser, 'b'.repeat(64))
    const data = addPrimitive(withModelContent(modelDefaults('empty'), source.inventory), source.inventory, 'box', 'boxA')
    const selection = { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'boxA' }
    const world = new ModelComposition(source, () => undefined)
    try {
      world.configure(data, 600, 400, undefined, { camera: { ...data.camera, projection: 'perspective', orthoHeight: 2.8 }, selection })
      const gizmo = world.gizmo(600, 400)!
      expect(gizmo).toBeTruthy()
      expect(gizmo.localUnitsPerPresentation).toBe(1)
      expect(gizmo.axes.x.x).not.toBe(gizmo.origin.x)
      expect(world.pick(gizmo.origin.x, gizmo.origin.y, 600, 400)).toEqual(selection)
      const hidden = updatePrimitive(data, 'boxA', object => ({ ...object, visible: false }))
      world.configure(hidden, 600, 400, undefined, { camera: { ...data.camera, projection: 'perspective', orthoHeight: 2.8 }, selection })
      expect(world.gizmo(600, 400)).toBeNull()
      expect(world.pick(gizmo.origin.x, gizmo.origin.y, 600, 400)).toBeNull()
    } finally { world.dispose() }
  })
  it('keeps a render-disabled primitive in the editor and a frozen primitive out of picking', async () => {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(emptyModelSceneDocument()), '')
    const source = prepareModelSource(gltf.scene, gltf.animations, gltf.parser, 'f'.repeat(64))
    const base = addPrimitive(withModelContent(modelDefaults('empty'), source.inventory), source.inventory, 'plane', 'floor')
    const data = updatePrimitive(base, 'floor', object => ({ ...object, renderable: false, frozen: true }))
    const selection = { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'floor' }
    const camera = { ...data.camera, pitch: 45, projection: 'perspective' as const, orthoHeight: 2.8 }
    const world = new ModelComposition(source, () => undefined)
    try {
      world.configure(data, 600, 400, undefined, { camera })
      expect(world.measure(selection)).not.toBeNull()
      expect(world.pick(300, 200, 600, 400)).toBeNull()
      expect(world.selectRegion({ kind: 'box', x: 0, y: 0, w: 600, h: 400 }, 'touching', 600, 400)).toEqual([])
      world.configure(data, 600, 400)
      expect(world.measure(selection)).toBeNull()
      expect(base.modeling?.objects[0].renderable).toBeUndefined()
    } finally { world.dispose() }
  })
  it('measures transformed world dimensions and applies imported instance calibration', async () => {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(emptyModelSceneDocument()), '')
    const empty = prepareModelSource(gltf.scene, gltf.animations, gltf.parser, 'e'.repeat(64))
    const box = addPrimitive(withModelContent(modelDefaults('empty'), empty.inventory), empty.inventory, 'box', 'boxA')
    const shaped = updatePrimitive(box, 'boxA', object => ({ ...object, geometry: { kind: 'box', width: 1, height: 3, depth: 2 }, rotation: { ...object.rotation, y: 90 } }))
    const primitive = { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'boxA' }
    const world = new ModelComposition(empty, () => undefined)
    try {
      const camera = { ...shaped.camera, projection: 'perspective' as const, orthoHeight: 2.8 }
      world.configure(shaped, 600, 400, undefined, { camera, showGrid: true, grid: DEFAULT_MODEL_MEASUREMENT })
      const dimensions = world.measure(primitive)!.selected
      expect(dimensions.width).toBeCloseTo(2); expect(dimensions.length).toBeCloseTo(1); expect(dimensions.height).toBeCloseTo(3)
      const scaled = { ...shaped, scale: 2 }
      world.configure(scaled, 600, 400, undefined, { camera })
      const doubled = world.measure(primitive)!.selected
      expect(doubled.width).toBeCloseTo(4); expect(doubled.length).toBeCloseTo(2); expect(doubled.height).toBeCloseTo(6)
    } finally { world.dispose() }

    const mesh = new Mesh(new BoxGeometry(1, 2, 3), new MeshBasicMaterial())
    const root = new Group(); root.add(mesh)
    const parser = { associations: new Map([[mesh, { nodes: 0 }]]), json: { nodes: [{ name: 'Body' }] } } as unknown as GLTFParser
    const imported = prepareModelSource(root, [], parser, 'f'.repeat(64))
    const composition = new ModelComposition(imported, () => undefined)
    const selection = { instanceId: 'primary', nodeId: 'n0' }
    const data = withModelContent(modelDefaults('imported'), imported.inventory)
    try {
      const camera = { ...data.camera, projection: 'perspective' as const, orthoHeight: 2.8 }
      composition.configure(data, 600, 400, undefined, { camera })
      const observed = composition.measure(selection)!.instance!.width
      const calibrated = calibrateModelInstance(data, imported.inventory, 'primary', observed, 2)
      composition.configure(calibrated, 600, 400, undefined, { camera })
      expect(composition.measure(selection)?.instance?.width).toBeCloseTo(2)
      expect(data.content!.instances.primary.calibration).toBeUndefined()
    } finally { composition.dispose(); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose() }
  })
  it('selects projected 3D bounds by square/circle/freehand and keeps isolation out of source', async () => {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(emptyModelSceneDocument()), '')
    const source = prepareModelSource(gltf.scene, gltf.animations, gltf.parser, 'c'.repeat(64))
    const base = withModelContent(modelDefaults('empty'), source.inventory)
    const left = addPrimitive(base, source.inventory, 'box', 'left')
    const both = updatePrimitive(addPrimitive(left, source.inventory, 'box', 'right'), 'right', object => ({ ...object, position: { ...object.position, x: 2 } }))
    const camera = { ...both.camera, yaw: 0, pitch: 0, projection: 'orthographic' as const, orthoHeight: 4 }
    const world = new ModelComposition(source, () => undefined)
    try {
      world.configure(both, 600, 400, undefined, { camera })
      const square = { kind: 'box' as const, x: 300, y: 130, w: 70, h: 140 }
      expect(world.selectRegion(square, 'inside', 600, 400)).toEqual([])
      expect(world.selectRegion(square, 'touching', 600, 400)).toEqual([{ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'left' }])
      expect(world.selectRegion({ kind: 'circle', cx: 300, cy: 200, r: 100 }, 'inside', 600, 400)).toEqual([{ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'left' }])
      expect(world.selectRegion({ kind: 'lasso', points: [{ x: 200, y: 100 }, { x: 380, y: 100 }, { x: 380, y: 300 }, { x: 200, y: 300 }] }, 'inside', 600, 400))
        .toEqual([{ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'left' }])
      world.configure(both, 600, 400, undefined, { camera, isolated: [{ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'left' }] })
      expect(world.pick(300, 200, 600, 400)).toEqual({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'left' })
      expect(world.pick(500, 200, 600, 400)).toBeNull()
      world.configure(both, 600, 400, undefined, { camera })
      expect(world.pick(500, 200, 600, 400)).toEqual({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'right' })
      expect(both.modeling!.objects.every(object => object.position.x === (object.id === 'right' ? 2 : 0))).toBe(true)
    } finally { world.dispose() }
  })
  it('isolates imported nodes only in inspection and restores the sampled pose', () => {
    const root = new Group(), left = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()), right = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    left.position.x = -1; right.position.x = 1; root.add(left, right)
    const parser = { associations: new Map([[left, { nodes: 0 }], [right, { nodes: 1 }]]), json: { nodes: [{ name: 'Left' }, { name: 'Right' }] } } as unknown as GLTFParser
    const source = prepareModelSource(root, [], parser, 'd'.repeat(64))
    const data = withModelContent(modelDefaults('imported'), source.inventory)
    const camera = { ...data.camera, yaw: 0, pitch: 0, projection: 'orthographic' as const, orthoHeight: 4 }
    const world = new ModelComposition(source, () => undefined)
    try {
      world.configure(data, 600, 400, undefined, { camera, selection: { instanceId: 'primary', nodeId: 'n0' } })
      const leftCenter = world.gizmo(600, 400)!.origin
      world.configure(data, 600, 400, undefined, { camera, selection: { instanceId: 'primary', nodeId: 'n1' } })
      const rightCenter = world.gizmo(600, 400)!.origin
      expect(world.pick(rightCenter.x, rightCenter.y, 600, 400)).toEqual({ instanceId: 'primary', nodeId: 'n1' })
      world.configure(data, 600, 400, undefined, { camera, isolated: [{ instanceId: 'primary', nodeId: 'n0' }] })
      expect(world.pick(leftCenter.x, leftCenter.y, 600, 400)).toEqual({ instanceId: 'primary', nodeId: 'n0' })
      expect(world.pick(rightCenter.x, rightCenter.y, 600, 400)).toBeNull()
      world.configure(data, 600, 400, undefined, { camera })
      expect(world.pick(rightCenter.x, rightCenter.y, 600, 400)).toEqual({ instanceId: 'primary', nodeId: 'n1' })
      expect(data.content!.instances.primary.nodes.n1.visible).toBe(true)
      const frozen = structuredClone(data)
      frozen.content!.instances.primary.nodes.n1.frozen = true
      world.configure(frozen, 600, 400, undefined, { camera })
      expect(world.pick(rightCenter.x, rightCenter.y, 600, 400)).toBeNull()
      expect(world.pick(leftCenter.x, leftCenter.y, 600, 400)).toEqual({ instanceId: 'primary', nodeId: 'n0' })
      const outputHidden = structuredClone(data)
      outputHidden.content!.instances.primary.nodes.n1.renderable = false
      world.configure(outputHidden, 600, 400, undefined, { camera })
      expect(world.measure({ instanceId: 'primary', nodeId: 'n1' })).not.toBeNull()
      world.configure(outputHidden, 600, 400)
      expect(world.measure({ instanceId: 'primary', nodeId: 'n1' })).toBeNull()
    } finally { world.dispose(); left.geometry.dispose(); right.geometry.dispose(); (left.material as MeshBasicMaterial).dispose(); (right.material as MeshBasicMaterial).dispose() }
  })
  it('projects saved camera roll in output and inspection without changing model placement', async () => {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(emptyModelSceneDocument()), '')
    const source = prepareModelSource(gltf.scene, gltf.animations, gltf.parser, 'a'.repeat(64))
    const data = withModelContent(modelDefaults('empty'), source.inventory)
    const world = new ModelComposition(source, () => undefined)
    let renderedCamera: Camera | undefined
    const renderer = { render: (_scene: Scene, camera: Camera) => { renderedCamera = camera } } as unknown as WebGLRenderer
    try {
      const front = { ...data.camera, yaw: 0, pitch: 0, roll: 0, projection: 'perspective' as const, orthoHeight: 2.8 }
      world.configure(data, 600, 400, undefined, { camera: front }); world.draw(renderer)
      const flat = new Vector3(1, 0, 0).project(renderedCamera!)
      world.configure(data, 600, 400, undefined, { camera: { ...front, roll: 90 } }); world.draw(renderer)
      const rolled = new Vector3(1, 0, 0).project(renderedCamera!)
      expect(flat.x).toBeGreaterThan(0)
      expect(rolled.x).toBeCloseTo(0)
      expect(rolled.y).toBeLessThan(0)
      data.camera = { ...data.camera, yaw: 0, pitch: 0, roll: 90 }
      world.configure(data, 600, 400); world.draw(renderer)
      expect(new Vector3(1, 0, 0).project(renderedCamera!).y).toBeCloseTo(rolled.y)
      world.configure(data, 600, 400, undefined, { camera: { ...front, yaw: 30, pitch: 90, roll: 45 } }); world.draw(renderer)
      const pole = new Vector3(1, 0, 0).project(renderedCamera!)
      expect(Number.isFinite(pole.x) && Number.isFinite(pole.y)).toBe(true)
    } finally { world.dispose() }
  })
})
