import { Modifier } from '../Modifier'
import type { GeometryModifierDescriptor, ModifierContext, ModifierGeometry } from '../geometryTypes'
import { targetSetting } from '../settings'
import { bandSettingsFields, defaultBandDraft, readBandDraft } from '../../spline/band/settingsFields'
import { bandSelection } from '../../spline/band/selection'
import { SplineBandBackend } from '../../spline/band/SplineBandBackend'
import { outlineToSpline } from '../../spline/outline/outlineToSpline'
import { Matrix2D } from '../../geometry/Matrix2D'
import { deleteSplineObjects } from '../../spline/topology/objects'
import { mergeSplineData } from '../../spline/factory/mergeSplineData'
import { stableModifierSpline } from './identity'
import { LIVE_OUTLINE_TYPE } from '../../spline/liveOutline/data'

/** Live source-driven band. The authored Layer retains its INPUT spline;
 * this strategy returns detached evaluated boundaries only. Object IDs/names
 * stay source-owned, generated boundary points get deterministic namespaces.
 * Source locks constrain editing, not rendering derived geometry. No mutation,
 * scene objects, guide paths or per-frame buffers enter the retained source. */
export class LiveOutlineModifier extends Modifier<ModifierGeometry, ModifierContext, GeometryModifierDescriptor> {
  static readonly descriptor: GeometryModifierDescriptor = { type: LIVE_OUTLINE_TYPE, label: 'Outline', category: 'spline', inputs: ['spline'], output: 'spline', sourceEditing: 'inputSpline', addable: true,
    description: 'Live band from editable source points. Local px; the source line remains editable. Bake explicitly for boundary points.',
    fields: [...bandSettingsFields, { key: 'objectIds', label: 'Source Objects', kind: 'objects' }] }
  /** Fresh static geometry defaults. Scope omits transient Edit selections. */
  static defaults() { return { ...defaultBandDraft(), objectIds: [] } }
  readonly descriptor = LiveOutlineModifier.descriptor
  /** Validate portable settings even when the owner is disabled. */
  validate(): void { readBandDraft(this.settings); targetSetting(this.settings, 'objectIds') }
  protected evaluate(input: ModifierGeometry): ModifierGeometry {
    if (input.kind !== 'spline') throw new Error('Outline requires a Spline source.')
    const data = input.spline, requested = targetSetting(this.settings, 'objectIds')
    const ids = requested.length ? requested.filter(id => !!data.subShapes[id]) : Object.keys(data.subShapes)
    if (!ids.length) return input
    const result = new SplineBandBackend().compute({ data, chains: bandSelection(data, 'object', ids), settings: readBandDraft(this.settings) })
    const incoming = outlineToSpline(result, Matrix2D.identity(), data.fillRule)
    incoming.subShapes = Object.fromEntries(Object.values(incoming.subShapes).map((object, i) => {
      const source = data.subShapes[result.objects[i].sourceObjectId!]
      return [source.id, { ...object, id: source.id, name: source.name, paint: { version: 1 as const, source: 'stroke' as const } }]
    }))
    return { kind: 'spline', spline: stableModifierSpline(data, mergeSplineData(deleteSplineObjects(data, ids), incoming), this.id) }
  }
}
