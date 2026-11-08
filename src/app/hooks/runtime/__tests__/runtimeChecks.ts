import { flushSync } from 'react-dom'
import type { ChronoScene } from '@/lib/types'
import type { FrameEvalResult, InteractiveRuntimeReturn } from '../../useInteractiveRuntime'
import { computeSegmentTime } from '@/lib/runtime/segmentPlayer'
import { runtimeFixture } from './runtimeFixture'
import type { installRuntimeFrameProbe } from './runtimeFrameProbe'

export interface RuntimeObservation {
  runtime: InteractiveRuntimeReturn; frame: FrameEvalResult; evaluations: number; wallMs: number
  seen: Array<{ type: string; refId?: string; dx?: number }>
  playback: { timeMs: number; isPlaying: boolean; toggle(): void }
}
export interface RuntimeCheckHost {
  mount(scene: ChronoScene): void
  unmount(): void
  replaceDefinition(): void
  read(): RuntimeObservation
  syncCount(): number
}

/** Observes existing real hooks via the standalone host's own controls/refs.
 * Before records known failures; after requires every invariant. All waits are
 * native RAF turns, with no injection/private bridge in a connected editor. */
export async function runRuntimeChecks(host: RuntimeCheckHost, probe: ReturnType<typeof installRuntimeFrameProbe>) {
  const results: Array<{ name: string; passed: boolean; details: unknown }> = []
  const check = (name: string, passed: boolean, details: unknown) => results.push({ name, passed, details })
  const mount = async (mode: Parameters<typeof runtimeFixture>[0] = 'plain') => {
    flushSync(() => host.mount(runtimeFixture(mode))); await probe.frames(5); probe.reset()
  }
  const stateId = () => host.read().runtime.smRuntimes.get('machine')?.currentStateId

  await mount()
  host.read().runtime.fireEvent({ type: 'customEvent', refId: 'set' })
  await probe.frames(6)
  let observation = host.read()
  check('paused custom event reaches trigger and rendered parameter exactly once',
    observation.frame.paramValues.get('value') === .75 && observation.seen.filter(event => event.refId === 'set').length === 1,
    { value: observation.frame.paramValues.get('value'), seen: observation.seen, raf: probe.read() })
  check('binding and expression wire follow the same frame',
    observation.frame.overrides.get('layers.card.transform.x') === 235
      && observation.frame.overrides.get('layers.card.transform.rotationDeg') === 67.5,
    { x: observation.frame.overrides.get('layers.card.transform.x'), rotation: observation.frame.overrides.get('layers.card.transform.rotationDeg') })

  await mount()
  host.read().runtime.setParamOverride('value', .5); await probe.frames(3)
  const beforeSame = host.read().evaluations
  for (let i = 0; i < 20; i++) flushSync(() => host.read().runtime.setParamOverride('value', .5))
  await probe.frames(3)
  const repeated = host.read().evaluations - beforeSame
  host.read().runtime.resetParams(); await probe.frames(3)
  const beforeReset = host.read().evaluations
  for (let i = 0; i < 20; i++) flushSync(() => host.read().runtime.resetParams())
  await probe.frames(3)
  const emptyResets = host.read().evaluations - beforeReset
  check('same parameter and empty reset do not reevaluate', repeated === 0 && emptyResets === 0, { repeated, emptyResets })

  await mount()
  for (let i = 0; i < 50; i++) host.read().runtime.fireEvent({ type: 'dragMove', dx: i, progress: i / 49 })
  await probe.frames(6)
  observation = host.read()
  const seen = observation.seen.filter(event => event.type === 'dragMove').map(event => event.dx)
  check('coalesced input preserves all FIFO payloads and final value',
    seen.length === 50 && seen.every((dx, i) => dx === i) && observation.frame.paramValues.get('value') === 1,
    { seen, value: observation.frame.paramValues.get('value'), raf: probe.read() })

  await mount()
  host.read().runtime.dispatchSMEvent('enter'); await probe.frames(5)
  check('direct SM dispatch updates a paused preview', stateId() === 'hover', { state: stateId() })

  await mount('guard')
  host.read().runtime.setParamOverride('value', .7); await probe.frames(4)
  check('parameter guard remains reactive without polling', stateId() === 'hover', { state: stateId(), raf: probe.read() })

  await mount('chain')
  host.read().runtime.setSMTestActive(true)
  host.read().runtime.dispatchSMEvent('enter'); await probe.frames(8)
  const emitted = host.read().seen.filter(event => event.refId === 'autoDone').length
  check('SM-emitted feedback traverses next-frame SM and trigger bridge once', stateId() === 'done' && emitted === 1,
    { state: stateId(), emitted })
  host.read().runtime.setSMTestActive(false); await probe.frames(3)

  await mount('blend')
  const syncBefore = host.syncCount()
  host.read().runtime.setSMTestActive(true)
  host.read().runtime.playSegment('segment', 'long', true)
  host.read().runtime.dispatchSMEvent('enter')
  await probe.frames(12)
  observation = host.read()
  const continuous = probe.read(), unchangedSyncs = host.syncCount() - syncBefore
  const segment = observation.runtime.segmentState
  const expected = segment ? computeSegmentTime(segment, observation.wallMs) / 1000 : NaN
  const scale = observation.frame.overrides.get('layers.card.transform.scaleX')
  check('segment and SM share one RAF owner', continuous.maximum === 1 && continuous.active === 1, continuous)
  check('segment wall time and blend endpoint remain correct', typeof scale === 'number' && Math.abs(scale - expected) < .02
    && observation.frame.overrides.get('layers.card.transform.y') === 100,
    { scale, expected, y: observation.frame.overrides.get('layers.card.transform.y') })
  check('unchanged SM definitions are not synced on ticks', unchangedSyncs === 0, { unchangedSyncs })
  const syncBeforeEdit = host.syncCount()
  flushSync(() => host.replaceDefinition()); await probe.frames(3)
  const editedSyncs = host.syncCount() - syncBeforeEdit
  check('replaced definition syncs once and preserves active state', editedSyncs === 1 && stateId() === 'hover',
    { editedSyncs, state: stateId() })
  host.read().runtime.stopSegment(); host.read().runtime.setSMTestActive(false); await probe.frames(4)
  const idleEvaluations = host.read().evaluations
  await probe.frames(8)
  check('stopped runtime has no RAF or idle evaluations', probe.read().active === 0 && host.read().evaluations === idleEvaluations,
    { raf: probe.read(), extraEvaluations: host.read().evaluations - idleEvaluations })

  await mount('blend')
  host.read().runtime.setSMTestActive(true)
  host.read().runtime.playSegment('segment', 'long', true)
  host.read().playback.toggle()
  await probe.frames(6); probe.reset()
  const startTime = host.read().playback.timeMs
  host.read().runtime.dispatchSMEvent('enter')
  host.read().runtime.fireEvent({ type: 'customEvent', refId: 'set' })
  await probe.frames(12)
  const playing = host.read(), playingProbe = probe.read()
  check('global playback supplies the sole steady runtime frame clock', playingProbe.maximum === 1 && playingProbe.active === 1
    && playing.playback.timeMs > startTime && playing.frame.paramValues.get('value') === .75,
    { raf: playingProbe, startTime, endTime: playing.playback.timeMs, value: playing.frame.paramValues.get('value') })
  host.read().playback.toggle(); await probe.frames(4)
  check('pausing global playback restores one segment/SM frame owner', probe.read().active === 1,
    { raf: probe.read(), isPlaying: host.read().playback.isPlaying })
  host.read().runtime.stopSegment(); host.read().runtime.setSMTestActive(false); await probe.frames(4)

  await mount()
  host.read().runtime.playSegment('segment', 'short', false)
  await probe.frames(1)
  for (let i = 0; i < 60 && host.read().runtime.segmentState; i++) await probe.frames(1)
  await probe.frames(3)
  check('non-loop segment completes and releases its frame demand', !host.read().runtime.segmentState && probe.read().active === 0,
    { segment: host.read().runtime.segmentState, raf: probe.read() })

  const zeroLength = runtimeFixture()
  zeroLength.timelines.find(timeline => timeline.id === 'segment')!.segments!.find(segment => segment.id === 'short')!.endMs = 1000
  flushSync(() => host.mount(zeroLength)); await probe.frames(5)
  const release = host.read().runtime.onEvent(event => {
    if (event.type === 'segmentStart' && event.segmentId === 'short') host.read().runtime.playSegment('segment', 'long', true)
  })
  host.read().runtime.playSegment('segment', 'short', false); await probe.frames(6)
  check('stale completion does not clear a listener-started replacement segment', host.read().runtime.segmentState?.segmentId === 'long',
    { segmentId: host.read().runtime.segmentState?.segmentId ?? null })
  release(); host.read().runtime.stopSegment(); await probe.frames(3)

  const pendingAfterUnmount: number[] = []
  for (let i = 0; i < 10; i++) {
    await mount()
    host.read().runtime.fireEvent({ type: 'customEvent', refId: 'set' })
    flushSync(() => host.unmount()); await probe.frames(2)
    pendingAfterUnmount.push(probe.read().active)
  }
  check('ten unmount cycles cancel pending input tasks', pendingAfterUnmount.every(count => count === 0), { pendingAfterUnmount })
  return { passed: results.every(result => result.passed), results }
}
