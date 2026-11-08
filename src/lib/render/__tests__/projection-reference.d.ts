/** Test-build alias supplied by scripts/perf/projection.mjs. It selects the
 * immutable pre-change module, resolved against its original source directory. */
declare module 'projection-reference' {
  export const materializeRenderScene: typeof import('@/lib/render/materializeOverrides').materializeRenderScene
}
/** Test-only strategy module supplied by scripts/perf/same-realm.mjs. */
declare module 'projection-strategy' {
  export const materializeRenderScene: typeof import('@/lib/render/materializeOverrides').materializeRenderScene
  export function selectProjection(side:number,control:boolean):void
  export function resetProjectionCounts():void
  export function projectionCounts():{reference:number;current:number}
}
