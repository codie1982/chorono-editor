import type { Model3DData } from '../types'
import type { ModelInventory } from '../content/types'
import { withModelContent } from '../content/modelContent'

export type ModelLengthUnit = 'm' | 'cm' | 'in' | 'px'
/** Scene-owned physical display policy. One 3D world unit is one metre;
 * px is a design pixel at the configured density, never a screen pixel. */
export interface ModelMeasurementSettings {
  unit: ModelLengthUnit
  pixelsPerInch: number
  gridBaseMeters: number
  subdivisions: number
}

export const DEFAULT_MODEL_MEASUREMENT: Readonly<ModelMeasurementSettings> = Object.freeze({ unit: 'cm', pixelsPerInch: 96, gridBaseMeters: .1, subdivisions: 5 })

/** Read legacy v4 and older sources without mutating them. */
export function modelMeasurement(data: Model3DData): ModelMeasurementSettings {
  return data.measurement ?? DEFAULT_MODEL_MEASUREMENT
}

/** Convert a finite linear display value to canonical metres. Coordinates,
 * dimensions and grid spacing share this converter; angles and scale do not. */
export function toModelMeters(value: number, settings: ModelMeasurementSettings): number {
  return value * ({ m: 1, cm: .01, in: .0254, px: .0254 / settings.pixelsPerInch }[settings.unit])
}

/** Convert canonical metres to the active scene display unit. */
export function fromModelMeters(meters: number, settings: ModelMeasurementSettings): number {
  return meters / toModelMeters(1, settings)
}

/** Compact dimension label; precision preserves ordinary centimetre edits. */
export function formatModelLength(meters: number, settings: ModelMeasurementSettings): string {
  return `${Number(fromModelMeters(meters, settings).toFixed(4))} ${settings.unit}`
}

/** Validate the bounded source policy before commit or portable load. */
export function assertModelMeasurement(value: ModelMeasurementSettings): void {
  if (!value || Object.keys(value).sort().join(',') !== 'gridBaseMeters,pixelsPerInch,subdivisions,unit'
    || !['m', 'cm', 'in', 'px'].includes(value.unit)
    || !Number.isFinite(value.pixelsPerInch) || value.pixelsPerInch < 24 || value.pixelsPerInch > 1200
    || !Number.isFinite(value.gridBaseMeters) || value.gridBaseMeters < .0001 || value.gridBaseMeters > 1000
    || !Number.isInteger(value.subdivisions) || value.subdivisions < 1 || value.subdivisions > 20)
    throw new Error('Invalid 3D measurement and grid settings.')
}

/** Explicitly promote a prepared legacy scene to v4 for the first settings
 * edit. Existing v4 data keeps its primitive source and IDs. A unit or density
 * change preserves the stored physical grid step and all object coordinates. */
export function updateModelMeasurement(data: Model3DData, inventory: ModelInventory, patch: Partial<ModelMeasurementSettings>): Model3DData {
  const settings = { ...modelMeasurement(data), ...patch }
  assertModelMeasurement(settings)
  const base = withModelContent(data, inventory)
  return { ...base, version: 4, modeling: base.modeling ?? { version: 1, objects: [] }, measurement: settings }
}

/** Calibrate one imported instance from an observed world-axis span and a
 * user-supplied real length in metres. The observed span already includes the
 * previous calibration, authored instance scale and outer 3D placement; this
 * ratio changes only the calibration factor. Other instances and glTF vertices
 * remain untouched. Degenerate spans and unsafe factors fail explicitly. */
export function calibrateModelInstance(data: Model3DData, inventory: ModelInventory, instanceId: string, observedMeters: number, desiredMeters: number): Model3DData {
  const base = withModelContent(data, inventory)
  const instance = base.content?.instances[instanceId]
  if (!instance || !Number.isFinite(observedMeters) || observedMeters <= 1e-9 || !Number.isFinite(desiredMeters) || desiredMeters <= 0)
    throw new Error('Choose a measurable imported model and a positive known length.')
  const factor = (instance.calibration?.metersPerNormalizedUnit ?? 1) * desiredMeters / observedMeters
  if (!Number.isFinite(factor) || factor < 1e-6 || factor > 1e6) throw new Error('3D calibration is outside supported scale limits.')
  return { ...base, version: 4, modeling: base.modeling ?? { version: 1, objects: [] }, measurement: modelMeasurement(base), content: { ...base.content!, instances: { ...base.content!.instances,
    [instanceId]: { ...instance, calibration: { revision: instance.revision, metersPerNormalizedUnit: factor } },
  } } }
}
