/** Transport hints for the versioned source DTO. Domain validators remain
 * authoritative for safe paths, reserved variables, cycles, capability and the
 * aggregate scene budget; this schema never runs a saved formula. */
export function propertyExpressionSchema() {
  const reference = { type: 'object', required: ['propertyPath', 'valueType'], properties: {
    layerId: { type: 'string', minLength: 1, maxLength: 256, description: 'Stable layer ID; omit for a scene parameter.' },
    propertyPath: { type: 'string', minLength: 1, maxLength: 256, description: 'Layer-local numeric path, or the stable scene parameter ID when layerId is absent.' },
    valueType: { type: 'string', enum: ['number'], description: 'A2 supports finite numeric sources.' },
  }, additionalProperties: false }
  return { type: 'object', required: ['version', 'fields'], properties: {
    version: { type: 'integer', enum: [1], description: 'Serialized property-expression envelope version; currently 1.' },
    fields: { type: 'object', maxProperties: 128, description: 'Layer-local numeric target paths. Preserve other records when replacing this map. Target keys/bindings/Wires remain protected by playback diagnostics; do not attach a competing driver.', additionalProperties: {
      type: 'object', required: ['resultType', 'formula', 'timelineId', 'sources'], properties: {
        resultType: { type: 'string', enum: ['number'], description: 'Finite numeric output, in the target property’s own units.' },
        formula: { type: 'string', maxLength: 4096, description: 'Whitelist expression with pi/e, timeMs/timeSec/timeNormalized and explicitly named sources. No host JavaScript or property access.' },
        timelineId: { type: 'string', minLength: 1, maxLength: 256, description: 'Explicit owning timeline; its local playback/external clock is used.' },
        sources: { type: 'object', maxProperties: 16, description: 'Own identifier names to stable refs; clock/constants/prototype names are reserved.', additionalProperties: reference },
        timeOffsetMs: { type: 'number', description: 'Clone/Array delay after local clock mapping, in ms.' },
        min: { type: 'number', description: 'Optional inclusive output minimum in source units; errors retain authored fallback.' },
        max: { type: 'number', description: 'Optional inclusive output maximum in source units; errors retain authored fallback.' },
      }, additionalProperties: false,
    } },
  }, description: 'Live numeric property expressions v1: at most 512 per scene, 128 per layer, 16 named sources. Source numeric leaves remain authored fallback; programs/output frames are never saved.' }
}
