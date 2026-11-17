/** Explicit portable empty glTF scene. The marker distinguishes an intentional
 * empty authoring container from malformed/degenerate imported geometry.
 * A fresh JSON document is returned; no GPU, URL or mutable shared state exists.
 */
export function emptyModelSceneDocument() {
  return { asset: { version: '2.0', generator: 'Chorono' }, scene: 0,
    scenes: [{ name: 'Empty 3D Scene', nodes: [], extras: { choronoEmptyScene: true } }], nodes: [] }
}
