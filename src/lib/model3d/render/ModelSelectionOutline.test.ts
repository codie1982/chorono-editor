import { BoxGeometry, Group, Mesh, MeshBasicMaterial, SkinnedMesh } from 'three'
import { describe, expect, it } from 'vitest'
import { ModelSelectionOutline } from './ModelSelectionOutline'

describe('ModelSelectionOutline', () => {
  it('borrows static geometry, tracks world placement and releases deselected hulls', () => {
    const geometry = new BoxGeometry(1, 1, 1), material = new MeshBasicMaterial()
    const parent = new Group(), mesh = new Mesh(geometry, material)
    parent.position.set(2, 3, 4); parent.add(mesh); parent.updateMatrixWorld(true)
    const outline = new ModelSelectionOutline()
    expect(outline.configure([parent]).has(parent)).toBe(true)
    expect(outline.root.children).toHaveLength(1)
    const hull = outline.root.children[0] as Mesh
    expect(hull.geometry).toBe(geometry)
    expect(hull.matrix.elements[12]).toBeCloseTo(2)
    expect(mesh.children).toHaveLength(0)
    parent.position.x = 5; parent.updateMatrixWorld(true); outline.configure([parent])
    expect(outline.root.children[0]).toBe(hull)
    expect(hull.matrix.elements[12]).toBeCloseTo(5)
    outline.configure([])
    expect(outline.root.children).toHaveLength(0)
    outline.dispose(); geometry.dispose(); material.dispose()
  })

  it('leaves skinned selections to the box fallback', () => {
    const geometry = new BoxGeometry(1, 1, 1), material = new MeshBasicMaterial()
    const mesh = new SkinnedMesh(geometry, material), outline = new ModelSelectionOutline()
    expect(outline.configure([mesh]).has(mesh)).toBe(false)
    expect(outline.root.children).toHaveLength(0)
    outline.dispose(); geometry.dispose(); material.dispose()
  })
})
