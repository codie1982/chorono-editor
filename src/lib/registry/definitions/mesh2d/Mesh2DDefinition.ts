import { DEFAULT_TRANSFORM } from '@/lib/defaults'
import { StructuredGridMesh2DGenerator } from '@/lib/geometry'
import { writePropertyPath } from '@/lib/scene/properties/writePropertyPath'
import type { Layer } from '@/lib/types'
import type { StructuredGridMesh2DSource } from '@/lib/types/mesh2d'
import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { appearanceGroup, fillGroup, geometryGroup, transformGroup } from '../sharedSchemas'

let mesh2DCounter = 0
const generator = new StructuredGridMesh2DGenerator()

/** Creates a complete, portable structured-grid Mesh2D layer. */
export function newStructuredGridMesh2DLayer(): Layer {
  mesh2DCounter++
  const mesh2d = generator.generate({ width: 240, height: 160, columns: 8, rows: 6 })
  return {
    id: `mesh2d_${Date.now().toString(36)}_${mesh2DCounter}`,
    name: `Mesh2D Grid ${mesh2DCounter}`,
    type: 'mesh2d',
    transform: { ...DEFAULT_TRANSFORM, anchorX: 120, anchorY: 80 },
    opacity: 1,
    size: { width: 240, height: 160 },
    style: { fill: { type: 'solid', color: '#3B82F6', opacity: 100 } },
    mesh2d,
  }
}

/**
 * Regenerates one structured-grid layer from a complete source recipe.
 *
 * The operation is pure and returns a full layer snapshot suitable for one
 * `makeUpdateLayerCmd` undo step. A pivot that was centered on the previous
 * source remains centered after resizing; a custom pivot is preserved.
 * Invalid or over-budget recipes throw before the source layer is changed.
 */
export function regenerateStructuredGridMesh2DLayer(
  layer: Layer,
  source: StructuredGridMesh2DSource,
): Layer {
  if (layer.type !== 'mesh2d' || !layer.mesh2d) throw new Error('Expected a structured-grid Mesh2D layer')
  const previous = layer.mesh2d.source
  const mesh2d = generator.generate(source)
  const centeredX = Math.abs(layer.transform.anchorX - previous.width / 2) <= 1e-9
  const centeredY = Math.abs(layer.transform.anchorY - previous.height / 2) <= 1e-9
  return {
    ...layer,
    size: { width: source.width, height: source.height },
    transform: {
      ...layer.transform,
      anchorX: centeredX ? source.width / 2 : layer.transform.anchorX,
      anchorY: centeredY ? source.height / 2 : layer.transform.anchorY,
    },
    mesh2d,
  }
}

const meshGeometryGroup = (): PropertyGroup => geometryGroup([
  { id: 'meshWidth', path: 'mesh2d.source.width', group: 'Geometry', label: 'Width', valueType: 'number', animatable: false, defaultValue: 240, min: 1, max: 8192, step: 1 },
  { id: 'meshHeight', path: 'mesh2d.source.height', group: 'Geometry', label: 'Height', valueType: 'number', animatable: false, defaultValue: 160, min: 1, max: 8192, step: 1 },
  { id: 'meshColumns', path: 'mesh2d.source.columns', group: 'Geometry', label: 'Columns', valueType: 'number', animatable: false, defaultValue: 8, min: 1, max: 256, step: 1,
    help: 'Horizontal cell count. Changing it regenerates topology and invalidates future topology-bound data.' },
  { id: 'meshRows', path: 'mesh2d.source.rows', group: 'Geometry', label: 'Rows', valueType: 'number', animatable: false, defaultValue: 6, min: 1, max: 256, step: 1,
    help: 'Vertical cell count. Changing it regenerates topology and invalidates future topology-bound data.' },
  { id: 'meshDiagonal', path: 'mesh2d.source.diagonal', group: 'Geometry', label: 'Quad Diagonal', valueType: 'select', animatable: false, defaultValue: 'topLeftToBottomRight', fullWidth: true,
    options: [
      { value: 'topLeftToBottomRight', label: 'Top-left → bottom-right' },
      { value: 'topRightToBottomLeft', label: 'Top-right → bottom-left' },
    ],
  },
])

const regeneratedPaths = new Set([
  'mesh2d.source.width',
  'mesh2d.source.height',
  'mesh2d.source.columns',
  'mesh2d.source.rows',
  'mesh2d.source.diagonal',
])

/** Structured-grid Mesh2D definition and derived-geometry edit strategy. */
export const mesh2DDefinition: LayerDefinition = {
  kind: 'mesh2d',
  label: 'Structured Grid',
  iconKey: 'box3d',
  category: 'Mesh & Surface',
  createDefault: newStructuredGridMesh2DLayer,
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => [transformGroup(), appearanceGroup(), meshGeometryGroup(), fillGroup()],
  applyPropertyChange(layer, path, value) {
    const updated = writePropertyPath(layer, path, value, true)
    if (!regeneratedPaths.has(path)) return updated
    if (!updated.mesh2d || updated.mesh2d.source.kind !== 'structuredGrid') {
      throw new Error('Mesh2D source is missing or unsupported')
    }
    const source = updated.mesh2d.source
    // Compare pivot ownership with the pre-edit recipe. Passing `updated`
    // would make a formerly centred pivot appear custom after width/height
    // has already changed in the temporary source snapshot.
    return regenerateStructuredGridMesh2DLayer(layer, {
      ...source,
      columns: Number(source.columns),
      rows: Number(source.rows),
      width: Number(source.width),
      height: Number(source.height),
    })
  },
}
