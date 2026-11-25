import { fillSchema, strokeSchema } from '../../../style/paintSchema'

type Schema = Record<string, unknown>
const id = { type: 'string', minLength: 1, maxLength: 128, description: 'Stable source ID from get_scene, never a display name or panel index.' }
const number = { type: 'number' }, localPoint = { description: 'One layer-local {x,y} anchor in logical px.', type: 'object', additionalProperties: false, properties: { x: number, y: number }, required: ['x', 'y'] }
const ids = { type: 'array', minItems: 1, maxItems: 1000, uniqueItems: true, items: id }
/** Strict operation variants keep mode/IDs/settings unambiguous; unsupported
 * fields refuse rather than being stored as a supposedly working UI feature. */
function variant(kind: string, properties: Schema, required: string[] = []): Schema {
  return { type: 'object', additionalProperties: false, properties: { kind: { const: kind, description: `Exact native operation/action discriminator: ${kind}.` }, ...properties }, required: ['kind', ...required] }
}
const selection = { type: 'object', additionalProperties: false, properties: { mode: { enum: ['point', 'edge', 'object'] }, ids }, required: ['mode', 'ids'], description: 'Explicit source selection; does not change ephemeral editor selection or edit mode.' }
const topology = { oneOf: [
  ...['delete', 'close', 'open', 'reverse', 'break', 'fuse', 'resetTangents'].map(kind => variant(kind, {})),
  variant('pasteTangents', { tangents: { type: 'object', additionalProperties: false, properties: { type: { enum: ['corner', 'smooth', 'bezier', 'bezierCorner'] }, in: localPoint, out: localPoint }, required: ['type'], description: 'Point type and optional in/out handle offsets relative to each target anchor, in layer-local px. Anchors remain fixed.' } }, ['tangents']),
  variant('split', { t: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 }, edgeId: id }),
  variant('addVertex', { edgeId: id, t: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 }, pointType: { enum: ['preserve', 'corner', 'smooth', 'bezier', 'bezierCorner'], description: 'Default preserve keeps the exact curve. Corner removes the new handles; bezier mirrors the shorter split handle and can reshape the edge.' } }, ['edgeId', 't']),
  variant('simplify', { tolerancePx: { type: 'number', minimum: .001, maximum: 1000, description: 'Maximum continuous source-curve deviation in layer-local px; default .5. Retained anchors, sharp corners and contour/hole ownership stay intact.' } }),
  variant('smooth', {}),
  variant('subdivide', { parts: { type: 'integer', minimum: 2, maximum: 64, description: 'Equal-parameter pieces per edge of selected Objects, including holes; default 2. Exact curve subdivision.' } }),
  variant('interpolation', { tolerancePx: { type: ['number', 'null'], minimum: .01, maximum: 10, description: 'Object adaptive sampling tolerance in layer-local px. Null removes the preference and restores legacy consumer defaults. No source vertices are added.' } }, ['tolerancePx']),
  ...['trim', 'extend'].map(kind => variant(kind, { edgeId: id, t: { type: 'number', minimum: 0, maximum: 1, description: 'Clicked edge parameter. Trim removes the containing intersection interval; Extend picks the nearer open end on a single-edge contour.' } }, ['edgeId', 't'])),
  variant('copy', { x: number, y: number }), ...['connect', 'weld'].map(kind => variant(kind, { tolerancePx: { type: 'number', minimum: 0, description: 'Composition-pixel tolerance for Weld; Connect adds a straight bridge.' } })),
  variant('refine', { t: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 }, edgeId: id }), variant('divide', { parts: { type: 'integer', minimum: 2, maximum: 64 } }),
] }
const primitiveFields: Record<string, Schema> = {
  line: { x1: number, y1: number, x2: number, y2: number }, rectangle: { width: number, height: number, cornerRadius: { type: 'number', minimum: 0 }, cornerMode: { enum: ['sharp', 'chamfered', 'rounded'] } }, circle: { radius: number },
  ellipse: { radiusX: number, radiusY: number }, arc: { radius: number, startAngle: number, endAngle: number },
  donut: { outerRadius: number, innerRadius: number }, ngon: { sides: { type: 'integer', minimum: 3, maximum: 1000 }, radius: number, roundness: { type: 'number', minimum: 0, maximum: 1 } },
  star: { points: { type: 'integer', minimum: 3, maximum: 1000 }, outerRadius: number, innerRadius: number, roundness: { type: 'number', minimum: 0, maximum: 1 } },
}
/** Canonical new spline edit schema. UI-only gestures map to explicit draw/ID
 * operations. Layer-local points/transforms and world-pixel solver amounts are
 * deliberately separate; primitive params stay kind-specific. */
export function splineOperationSchema(): Schema {
  return documentSplineSchema({ description: 'One native spline operation; prepare is read-only, Apply commits its exact result. Solvers use bounded workers. No implicit UI selection, snapping or playback changes.', oneOf: [
    variant('topology', { selection, action: topology }, ['selection', 'action']),
    ...Object.entries(primitiveFields).map(([primitive, properties]) => variant('append', { primitive: { const: primitive }, params: { type: 'object', additionalProperties: false, properties, required: Object.keys(properties).filter(key => !['cornerRadius', 'cornerMode', 'roundness'].includes(key)) }, x: number, y: number, name: { type: 'string', maxLength: 256 } }, ['primitive', 'params'])),
    variant('draw', { points: { type: 'array', maxItems: 2048, items: localPoint, description: 'Local NEW anchors; omit the existing start/end endpoint coordinates and reference their IDs instead.' }, startPointId: id, endPointId: id, autoClose: { type: 'boolean', description: 'Close at >=3 anchors; two-anchor lines stay open. Explicit per operation, no global preference mutation.' }, name: { type: 'string', maxLength: 256 } }, ['points']),
    variant('transform', { selection, transform: { type: 'object', additionalProperties: false, properties: { x: number, y: number, rotation: number, scaleX: { type: 'number', exclusiveMinimum: 0 }, scaleY: { type: 'number', exclusiveMinimum: 0 } }, minProperties: 1, description: 'Local px, clockwise degrees, positive scale factors around selected anchor-bounds center.' } }, ['selection', 'transform']),
    variant('movePoint', { pointId: id, x: number, y: number }, ['pointId', 'x', 'y']),
    variant('pointType', { pointIds: ids, pointType: { enum: ['corner', 'smooth', 'bezier', 'bezierCorner'] } }, ['pointIds', 'pointType']),
    variant('edgeType', { edgeIds: ids, edgeType: { enum: ['line', 'cubic'] } }, ['edgeIds', 'edgeType']),
    { ...variant('paint', { fill: { ...fillSchema(), type: 'object', description: 'Complete fill record (solid/gradient/image/none); omitted stroke remains unchanged. Validated by shared paint rules.' }, stroke: { ...strokeSchema(), type: 'object', description: 'Complete stroke record, including none; omitted fill remains unchanged. Preserve authored width/color when disabling stroke.' } }), anyOf: [{ required: ['fill'] }, { required: ['stroke'] }] },
    variant('attach', { sourceLayerId: id }, ['sourceLayerId']), variant('detach', { objectIds: ids }, ['objectIds']),
    variant('offset', { selection, resultMode: { enum: ['append', 'replace'], description: 'Append is the legacy default; Replace updates only selected complete contours and retains their Object ownership.' }, settings: { type: 'object', additionalProperties: false, properties: { distancePx: { type: 'number', exclusiveMinimum: 0, maximum: 10000 }, side: { enum: ['left', 'right', 'both', 'inside', 'outside'] }, join: { enum: ['miter', 'bevel', 'round'] }, miterLimit: { type: 'number', minimum: 1, maximum: 100 }, tolerancePx: { type: 'number', minimum: .05, maximum: 5 } }, required: ['distancePx', 'side', 'join', 'miterLimit', 'tolerancePx'] } }, ['selection', 'settings']),
    variant('chamfer', { pointIds: { ...ids, maxItems: 128 }, distancePx: { type: 'number', minimum: .1, maximum: 10000, description: 'Cut distance along each adjacent world-space edge, not a radius.' } }, ['pointIds', 'distancePx']),
    variant('fillet', { pointIds: { ...ids, maxItems: 64 }, radiusPx: { type: 'number', minimum: .1, maximum: 10000, description: 'Circular composition-pixel radius; ambiguous, singular or overlapping solutions refuse.' } }, ['pointIds', 'radiusPx']),
    { ...variant('boolean', { targets: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'object', additionalProperties: false, properties: { layerId: id, subShapeId: id }, required: ['layerId'] }, description: 'Ordered operands: first A, remaining B. Whole layers or SubShapes of one spline. Sources are retained in an owned recipe group.' }, ownerId: { ...id, description: 'Existing Boolean recipe group ID to re-edit; omit targets.' }, settings: { type: 'object', additionalProperties: false, properties: { operation: { enum: ['union', 'subtract', 'intersect', 'xor'] }, reverse: { type: 'boolean' }, tolerancePx: { type: 'number', minimum: .05, maximum: 5 } }, required: ['operation', 'reverse', 'tolerancePx'] } }, ['settings']), oneOf: [{ required: ['targets'], not: { required: ['ownerId'] } }, { required: ['ownerId'], not: { required: ['targets'] } }] },
  ] })
}

/** Add domain-specific field docs before generic catalog enrichment. This owns
 * names/units only; validation keywords remain unchanged. */
function documentSplineSchema(schema: Schema): Schema {
  const descriptions: Record<string, string> = {
    selection: 'Explicit source selection; no panel mode or UI selection write.', action: 'Native mode-owned topology action.',
    mode: 'point, edge or object source IDs; object means normalized SubShape including its contours.', ids: 'Unique stable source IDs, in meaningful endpoint/operand order.',
    pointIds: 'Unique stable spline point IDs.', edgeIds: 'Unique stable spline segment IDs.', objectIds: 'Whole SubShape IDs including their contours.',
    pointId: 'Existing spline point ID.', startPointId: 'Existing open start endpoint; points contains NEW anchors only.', endPointId: 'Existing open endpoint reached after the new anchors, joined by ID.',
    layerId: 'Existing source layer ID.', sourceLayerId: 'Static unreferenced source spline consumed by Attach; target paint remains authoritative.', subShapeId: 'Optional source SubShape ID within the specified spline layer.',
    x: 'Layer-local horizontal px.', y: 'Layer-local vertical px.', x1: 'First endpoint local x px.', y1: 'First endpoint local y px.', x2: 'Second endpoint local x px.', y2: 'Second endpoint local y px.',
    width: 'Local geometry/stroke width in px.', height: 'Local geometry height in px.', radius: 'Primitive radius in local px.', radiusX: 'Horizontal local radius px.', radiusY: 'Vertical local radius px.', outerRadius: 'Outer primitive radius px.', innerRadius: 'Inner primitive radius px.',
    primitive: 'Implemented spline primitive kind; params must match this exact kind.', params: 'Kind-specific native generator parameters, in local px/degrees.', name: 'Optional source Object name.',
    cornerRadius: 'Rectangle local corner radius px.', cornerMode: 'Native rectangle corner style.', roundness: 'Normalized native corner roundness 0–1.', sides: 'Integer polygon side count.',
    t: 'Strictly interior edge parameter fraction, not arc length.', edgeId: 'Optional Refine/Split edge ID within the explicit selected edges.', parts: 'Equal-parameter subdivision count per edge (2–64).',
    transform: 'Local affine delta around selected anchor-bounds center.', rotation: 'Clockwise rotation delta in degrees.', scaleX: 'Positive horizontal scale factor.', scaleY: 'Positive vertical scale factor.',
    pointType: 'Native point tangent/handle mode.', edgeType: 'Native line or cubic segment type.', settings: 'Exact solver settings; quality and topology limits refuse rather than silently clamp.',
    distancePx: 'Positive world/composition-pixel offset or cut amount, according to operation kind.', side: 'Left/Right for open contours; Inside/Outside for closed boundaries; Both emits both open offsets.',
    join: 'Miter, bevel or round parallel-boundary join.', miterLimit: 'Maximum miter ratio before explicit bevel fallback.', tolerancePx: 'World-space curve approximation tolerance in px.',
    operation: 'Boolean area operation; union/subtract/intersect/xor. This is not SubShape combineMode.', reverse: 'Reverse A-minus-B subtraction order; other operations retain operand meaning.',
    type: 'Source variant discriminator; choose the exact supported enum.', color: 'Authored source color string.', gradient: 'Native linear/radial gradient record.', angle: 'Gradient angle in degrees.', stops: 'Ordered color stops at normalized offsets.', offset: 'Normalized stop position, or authored trim phase as named.',
    image: 'Versioned shared image asset placement within the local paint box.', version: 'Required source payload version 1.', assetId: 'Image asset registry ID; media is not embedded in this payload.', fit: 'Cover, Contain, or fill (UI Stretch).', offsetX: 'Local image horizontal px after fit.', offsetY: 'Local image vertical px after fit.', scale: 'Positive image scale factor after fit.', rotationDeg: 'Clockwise image rotation degrees.',
    alignment: 'Stroke placement relative to the path.', dashArray: 'Nonnegative authored dash lengths in local px.', lineCap: 'Stroke endpoint cap.', lineJoin: 'Stroke corner join.', trim: 'Authored stroke visibility window; geometry is retained.', start: 'Normalized stroke trim start.', end: 'Normalized stroke trim end.', segmentLength: 'Moving segment fraction of the stroke.',
  }
  const visit = (node: any, path = '') => {
    for (const [key, entry] of Object.entries(node.properties ?? {}) as [string, any][]) {
      // Numeric/ID schema fragments are reused. Descriptions belong to their
      // occurrence, otherwise documenting x leaks its units into radius/angle.
      const child = node.properties[key] = { ...entry }
      child.description ??= descriptions[key] ?? `${key} native source option.`
      visit(child, key)
    }
    if (node.items && !Array.isArray(node.items)) { node.items.description ??= path === 'points' ? 'One local {x,y} point or primitive vertex count as typed.' : 'One typed native source array entry.'; visit(node.items, path) }
    for (const group of ['oneOf', 'anyOf', 'allOf']) for (const child of node[group] ?? []) visit(child, path)
  }
  visit(schema); return schema
}
