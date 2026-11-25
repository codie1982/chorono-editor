import { describe, expect, it } from 'vitest'
import { RigidBodyBakeAdapter } from '@/lib/bake/adapters/RigidBodyBakeAdapter'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import {
  makeApplyRigidBodyBakeCmd,
  makeReplaceRigidBodyBakeCmd,
} from '@/lib/editor/commands-rigid-body-bake'
import { makeClearRigidBakeCmd } from '@/lib/editor/commands-rigid-bake-lifecycle'
import { ResourceBudget } from '@/lib/resources/budget'
import type { ChronoScene, Track } from '@/lib/types'
import { RigidBakeOwnershipInspector } from '../RigidBakeOwnership'
import { RigidBakeOwnershipConflictError } from '../RigidBakeSceneMutation'

describe('rigid bake lifecycle ownership', () => {
  it('clears only verified generated tracks and restores the exact bake with undo', async () => {
    const fixture = rigidBakeFixture()
    const scene = withUnrelatedTrack(fixture.scene)
    const preview = await prepare(fixture.recipe)
    const apply = makeApplyRigidBodyBakeCmd({
      recipe: fixture.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: 'rigid-lifecycle-v1',
    })
    const baked = apply.execute(scene)
    const inspection = new RigidBakeOwnershipInspector().inspect(baked, 'rigid-lifecycle-v1')
    expect(inspection).toMatchObject({ ownershipState: 'current', sourceState: 'current', canSafelyMutate: true })
    expect(baked.physics?.rigidBakes[0].timelineLayerIdsAdded).toEqual(['box'])

    const clear = makeClearRigidBakeCmd({ recordId: 'rigid-lifecycle-v1' })
    const cleared = clear.execute(baked)
    expect(cleared.physics).toBeUndefined()
    expect(cleared.timelines[0].tracks).toEqual([unrelatedTrack])
    expect(cleared.timelines[0].layerIds).toEqual(['floor'])
    expect(clear.undo(cleared)).toBe(baked)
    preview.release()
  })

  it('refuses edited and ambiguous output unless one explicit replace is safe', async () => {
    const fixture = rigidBakeFixture()
    const preview = await prepare(fixture.recipe)
    const baked = makeApplyRigidBodyBakeCmd({
      recipe: fixture.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: 'rigid-edited-v1',
    }).execute(fixture.scene)
    const edited = editFirstGeneratedKey(baked)
    const inspection = new RigidBakeOwnershipInspector().inspect(edited, 'rigid-edited-v1')
    expect(inspection.ownershipState).toBe('edited')
    expect(inspection.issues[0]).toMatchObject({ kind: 'modified-track' })

    const safeReplace = makeReplaceRigidBodyBakeCmd({
      existingRecordId: 'rigid-edited-v1',
      recipe: fixture.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
    })
    expect(() => safeReplace.execute(edited)).toThrow(RigidBakeOwnershipConflictError)

    const explicitReplace = makeReplaceRigidBodyBakeCmd({
      existingRecordId: 'rigid-edited-v1',
      recipe: fixture.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      conflictPolicy: 'discard-edits',
    })
    const replaced = explicitReplace.execute(edited)
    expect(new RigidBakeOwnershipInspector().inspect(replaced, 'rigid-edited-v1').ownershipState).toBe('current')
    expect(replaced.physics?.rigidBakes).toHaveLength(1)
    expect(explicitReplace.undo(replaced)).toBe(edited)

    const duplicated: ChronoScene = {
      ...edited,
      timelines: edited.timelines.map(timeline => timeline.id === 'main'
        ? { ...timeline, tracks: [...timeline.tracks, structuredClone(timeline.tracks[0])] }
        : timeline),
    }
    const ambiguousClear = makeClearRigidBakeCmd({ recordId: 'rigid-edited-v1', conflictPolicy: 'discard-edits' })
    expect(() => ambiguousClear.execute(duplicated)).toThrow(RigidBakeOwnershipConflictError)
    preview.release()
  })
})

const unrelatedTrack: Track = {
  target: 'layers.floor.opacity',
  kind: 'property',
  label: 'Unrelated user track',
  keyframes: [
    { id: 'unrelated-0', timeMs: 0, value: 1, easing: { type: 'linear' } },
    { id: 'unrelated-1', timeMs: 3000, value: .75, easing: { type: 'linear' } },
  ],
}

function withUnrelatedTrack(scene: ChronoScene): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map(timeline => timeline.id === 'main'
      ? { ...timeline, tracks: [unrelatedTrack], layerIds: ['floor'] }
      : timeline),
  }
}

function editFirstGeneratedKey(scene: ChronoScene): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map(timeline => timeline.id === 'main'
      ? { ...timeline, tracks: timeline.tracks.map((track, index) => index === 0
        ? { ...track, keyframes: track.keyframes.map((key, keyIndex) => keyIndex === 0
          ? { ...key, value: Number(key.value) + 1 }
          : key) }
        : track) }
      : timeline),
  }
}

async function prepare(recipe: ReturnType<typeof rigidBakeFixture>['recipe']) {
  return new RigidBodyBakeAdapter({ allocator: new ResourceBudget({ maxBytes: 8 * 1024 ** 2 }) })
    .prepare(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
}
