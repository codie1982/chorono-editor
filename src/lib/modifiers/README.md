# Modifier execution

The shared abstraction is `Modifier<TValue, TContext, TDescriptor>`, not a
geometry base class. `Modifier`, `ModifierRegistry`, `ModifierStack` and their
portable records have no scene, spline, mesh, React, renderer or filesystem
imports. The geometry adapter supplies those domain contracts separately.

## Ownership and execution

- `Modifier.ts`: one immutable runtime operation. Owns a detached, deeply frozen
  settings record; validates its settings and implements `evaluate`. Public
  `execute(input, context)` skips disabled operations. Algorithms borrow input,
  return new data and must not mutate the input or allocate platform resources.
- `ModifierRegistry.ts`: composition-owned factories, descriptors and defaults.
  Type identifiers are unique. Registration order is chooser order. Categories
  are general strings; geometry registrations use `spline` and `mesh`.
- `ModifierStack.ts`: owns a detached source and an ordered list of immutable
  instances. `execute(context, stopBefore?)` starts from that source every time,
  runs active instances in order, validates intermediate values through an
  injected domain policy, and returns only the final successful value. Errors
  identify the responsible instance. It writes no object and retains no result.
  `toRecord()` returns portable data, never runtime instances.
- `GeometryStackEvaluator.ts`: geometry admission adapter for the general stack.
  Validates shape/Spline/Mesh kinds, topology and budgets. Wrong conversion order
  fails; disabling an operation preserves its input representation. A new Mesh
  strategy can change connectivity if it returns valid Mesh data within budgets.
- `builtins.ts`: registers concrete classes. Each class owns its descriptor,
  defaults, setting validation and algorithm. Neither the runner nor the form
  switches on concrete operation names. Conversion entries are non-addable and
  remain in the viewport Convert menu.
- `ModifierStackService.ts`: Layer adapter. Captures original geometry once,
  migrates legacy conversion-v1 on explicit edits, executes the stack and returns
  one final Layer retaining ID, placement, paint and lifetime. The command layer
  commits that result once after complete success; Undo restores the exact source.
- `editor/modifiers/commands.ts`: add, settings, execute, enable, move, remove,
  source rebuild and bake. `makeExecuteModifierStackCmd(scene, id, patches)`
  stages all supplied settings, executes the entire stack, and returns one CAS
  command. Stale source or any invalid step leaves scene/history untouched.

## Minimal general example

This example intentionally uses numbers, showing that the base is not tied to
geometry. The concrete Mesh Smooth and Subdivision algorithms use the same classes
with `ModifierGeometry` and `GeometryModifierDescriptor` instead.

```ts
import { Modifier, ModifierRegistry, ModifierStack } from '@/lib/modifiers'
import type { ModifierDescriptor } from '@/lib/modifiers'

class Gain extends Modifier<number, void> {
  static readonly descriptor: ModifierDescriptor = {
    type: 'gain', label: 'Gain', category: 'signal', addable: true,
    fields: [{ key: 'factor', label: 'Factor', kind: 'number' }],
  }
  readonly descriptor = Gain.descriptor
  validate() {
    if (typeof this.settings.factor !== 'number' || !Number.isFinite(this.settings.factor))
      throw new Error('A finite factor is required.')
  }
  protected evaluate(value: number) { return value * Number(this.settings.factor) }
}
const registry = new ModifierRegistry<number, void>().register({
  descriptor: Gain.descriptor, create: record => new Gain(record),
  defaults: () => ({ factor: 2 }),
})
const pending = new ModifierStack({ version: 1, source: 10,
  modifiers: [registry.newRecord('gain', 'gain-1', 10)],
}, registry, { validateValue(value) {
  if (!Number.isFinite(value)) throw new Error('Invalid result.')
} })
const result = pending.execute() // 20; commit only after successful execution
```

Production classes currently registered: Convert Spline, Convert 2D Mesh,
Offset, Outline, Chamfer, Fillet, Smooth, Subdivision and Deformation Clip.
Subdivision defaults to constrained Delaunay and separately offers Grid/Karelaj;
it does not use midpoint 1→4 triangle splitting.
[Mesh modeling algorithms and limits](../../geometry/mesh2d/modeling/README.md). `MeshExtension.test.ts`
registers a test-only grid detail strategy using the existing grid generator,
verifying that new connectivity works without changing runner or panel.

## Data, units and compatibility

`Layer.modifierStack` v1 stores `{ source, modifiers }`; ordinary `spline` or
`mesh2d` fields are a portable result snapshot. Rendering recomputes from the
canonical recipe, never treats that snapshot as the next input. An instance ID
is layer-local, stable across save/undo/clone; classes never enter scene JSON.
Legacy `geometryConversion` v1 remains readable and migrates on the next explicit
stack edit. Two simultaneous recipes are rejected. Flat scenes retain behavior.

Geometry is source-local, x-right/y-down pixels; transforms and paint are outside
the pipeline. Offset/Outline reuse existing planar/Boolean algorithms, Chamfer
and Fillet use native corner solvers with identity local-to-working matrices.
Single conversion preserves Bézier curves; multi-object union samples at the
saved local tolerance. Mesh sampling reuses `SplineToMeshConverter` and Earcut.
Existing numerical limits and degeneracy refusals remain in those owners.

Generated Spline IDs are deterministic per modifier and retained source IDs stay
stable. Explicit point/contour targets capture connectivity identity; changed
upstream topology refuses instead of silently rebinding those IDs. Mesh pins
protect connectivity/rest positions. Deformation clips capture both topology
and rest identity: upstream changes require explicitly rebinding the clip.
Disabled clip asset references still count in `AssetIndex` for orphan protection.

Static modifier settings/source do not accept independent geometry timeline,
expression, binding or wire writers. Outer transform/paint animation remains
supported; Deformation Clip uses the existing composition-ms resolver and owns
no dense samples. Animated modifier parameters need a future time contract.

Generated points are read-only while geometry operations are active. Disable
those operations or use undoable Bake stack for direct point editing. A
conversion-only Spline still accepts point edits as its authored conversion
override. Source rebuild explicitly clears such overrides.

## Render/output lifecycle and verification

`scene.ts` projects stacks before Boolean operands and instance resolution;
render, bounds, picking and runtime compilation share that result. Editable JSON
validates recipes. Runtime compilation strictly flattens source metadata to
ordinary geometry; malformed recipes cannot export stale snapshots. Viewport
projection hides a malformed externally supplied layer, whereas strict IO throws.

The derived-result cache holds at most eight weak-source entries and an estimated
16 MiB payload. It retains no scenes, workers, DOM or GPU resources.
`clearModifierGeometryCache()` releases it explicitly; entries are otherwise
bounded/evicted. Source/history contain no dense per-frame caches. Maximum stack
length is 32; domain source/output budgets apply before publication.

Run `npm test`, `npm run mcp:build`, `npm run build` with Next stopped. Core tests
exercise a non-geometric registry, immutable settings, order, failure atomicity
and repeated execution. Geometry/Mesh tests cover non-cumulative settings,
multiple pending changes, arbitrary removal/toggle/order, topology extension,
source migration, source editing/bake, persistence, clone, render/runtime and
asset lifetime. The isolated native Canvas/Edit host is prepared with
`node scripts/perf/geometry-conversion.mjs /tmp/chorono-conversion-qa` and served
with `node scripts/perf/serve.mjs /tmp/chorono-conversion-qa 2012`.
