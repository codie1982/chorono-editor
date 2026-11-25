# Rigid simulation execution

This directory owns the execution boundary for deterministic 2D rigid-body
bakes. It does not own scene publication, resource budgeting, track
compilation, React UI, or MCP transport.

## Entry points and data flow

- `RigidBodySimulationExecutor` is the small contract consumed by
  `RigidBodyBakeAdapter`.
- `RigidBodySimulationRunner` executes a versioned `RigidBodyBakeRecipe` with
  fixed ticks and produces transient `Float64Array` sample times and poses.
- `RigidBodyWorkerClient` runs that executor in a one-shot browser Worker.
- `rigidBodySimulation.worker.ts` owns the Worker-side runner and transfers
  the two result buffers back without serializing dense pose data as JSON.

The complete flow is:

1. `BakeService` validates source revision and asks the adapter to prepare.
2. The adapter reserves a bounded preview budget.
3. The Worker performs fixed-step Matter simulation and reports tick progress.
4. The main thread validates the transferred dimensions, creates a
   `RigidPoseClip`, and compiles ordinary editable tracks.
5. Preview ownership remains transient until the caller explicitly commits.
6. Commit publishes the tracks and versioned bake record in one undo step.

The dense solver buffers, Worker instance, Matter bodies, timers, and abort
listeners are runtime-owned resources. They are never stored in normal scene
JSON or undo snapshots. Every success, failure, timeout, and cancellation path
terminates the one-shot Worker and detaches its listeners. A Worker failure
after simulation starts is reported; it is not silently rerun inline because
that would duplicate expensive work and blur failure semantics.

## Coordinates and time

- positions are composition pixels with positive Y downward;
- angles are clockwise, unwrapped degrees;
- recipe gravity is metres per second squared and uses `pixelsPerMeter` at the
  physics adapter boundary;
- `stepHz` defines deterministic integer solver ticks;
- `sampleFps` selects editable output samples and does not change solver time.

Cancellation is cooperative and checked at fixed ticks. Worker execution uses
a finite deadline. The inline compatibility path yields to the host at a
bounded tick interval and preserves the same recipe/result meaning.

## Minimal use

```ts
const executor = RigidBodyWorkerClient.isSupported()
  ? new RigidBodyWorkerClient()
  : new RigidBodySimulationRunner()

const result = await executor.simulate(recipe, {
  signal: abortController.signal,
  reportProgress: ({ tick, totalTicks }) => updateProgress(tick / totalTicks),
})
```

Callers normally construct `RigidBodyBakeAdapter` instead. In a supported
browser it selects the Worker automatically; tests and non-browser runtimes use
the inline runner or inject an executor explicitly.

## Current limits

The Worker moves solver execution only. Resource reservation, clip validation,
track compilation, preview ownership, and the final scene transaction remain
on the owning application layers. The Worker is deliberately one-shot; shared
pools and cross-job caches require measured demand and explicit stale-result
ownership before they are introduced.
