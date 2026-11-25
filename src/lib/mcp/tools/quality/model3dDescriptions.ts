/** Boxed-model authoring contract. The tool owns static source fields while the
 * existing asset importer owns bytes and the main Timeline owns only outer 2D
 * layer animation. */
export const model3dDescriptions: Readonly<Record<string, string>> = {
  update_model3d: 'Deep-merge the supplied static position/rotation/scale, camera and lighting fields of one imported model3d source layer; optionally resize its outer 2D box in composition pixels. Omitted nested fields, asset id, source version, 2D transform and existing tracks stay intact. Rotation/yaw/pitch/FOV use degrees; internal coordinates use normalized presentation units. Thin instances and other layer kinds refuse. One undoable source edit, not an inner-Timeline key or model-file replacement.',
}
