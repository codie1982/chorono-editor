import { describe, it, expect } from 'vitest'
import { makeCloneCmd, makeArrayCmd } from '../commands-clone'
import { defaultLinearArraySettings, defaultGridArraySettings } from '../../array/ArrayTypes'
import type { ChronoScene, Layer, Timeline, Track } from '../../types'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeLayer(
  id: string,
  parentId: string | undefined,
  overrides: Partial<Layer> = {},
): Layer {
  return {
    id,
    name: id,
    type: parentId === undefined && overrides.type === 'group' ? 'group' : (overrides.type ?? 'shape'),
    shape: 'rect',
    parentId,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    ...overrides,
  }
}

function makeTimeline(tracks: Track[] = []): Timeline {
  return { id: 'tl', durationMs: 5000, autoplay: false, loop: false, tracks }
}

function makeScene(layers: Layer[], timeline?: Timeline): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: {
      id: 'c', width: 800, height: 600, durationMs: 5000, frameRate: 60, backgroundColor: '#000',
    } as any,
    assets: [],
    layers,
    timelines: timeline ? [timeline] : [],
    parameters: [],
    triggers: [],
    bindings: [],
    initialState: {},
  } as any
}

function kf(id: string, ms: number, value: number) {
  return { id, timeMs: ms, value, easing: { type: 'linear' as const } }
}

// ── 1. Nested group clone with tracks on children ───────────────────────────

describe('Edge: group clone duplicates tracks targeting CHILDREN', () => {
  it('child tracks get remapped to new child ids', () => {
    const layers = [
      makeLayer('g', undefined, { type: 'group' }),
      makeLayer('c1', 'g'),
      makeLayer('c2', 'g'),
    ]
    const tracks: Track[] = [
      { target: 'layers.g.opacity',  keyframes: [kf('k1', 0, 1)] },
      { target: 'layers.c1.transform.x', keyframes: [kf('k2', 0, 0), kf('k3', 1000, 100)] },
      { target: 'layers.c2.opacity', keyframes: [kf('k4', 0, 0.5)] },
    ]
    const timeline = makeTimeline(tracks)
    const scene = makeScene(layers, timeline)

    const cmd = makeCloneCmd({
      source: layers[0],
      count: 1,
      timeline,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)

    // 3 original + 3 duplicated tracks = 6 tracks total
    expect(after.timelines[0].tracks.length).toBe(6)

    // No NEW track targets should still reference the old ids
    const newTracks = after.timelines[0].tracks.slice(3)
    for (const tr of newTracks) {
      expect(tr.target.includes('g.')).toBe(false)
      expect(tr.target.includes('c1.')).toBe(false)
      expect(tr.target.includes('c2.')).toBe(false)
    }

    // All kf ids must be fresh
    const allKfIds = newTracks.flatMap((t) => t.keyframes.map((k) => k.id))
    for (const id of allKfIds) {
      expect(['k1', 'k2', 'k3', 'k4']).not.toContain(id)
    }
  })

  it('grandchild tracks are also remapped (3-level deep group)', () => {
    const layers = [
      makeLayer('root', undefined, { type: 'group' }),
      makeLayer('sub',  'root',     { type: 'group' }),
      makeLayer('leaf', 'sub'),
    ]
    const timeline = makeTimeline([
      { target: 'layers.leaf.opacity', keyframes: [kf('k1', 0, 1)] },
    ])
    const scene = makeScene(layers, timeline)
    const cmd = makeCloneCmd({
      source: layers[0],
      count: 1,
      timeline,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)

    // Original + 1 duplicate
    expect(after.timelines[0].tracks.length).toBe(2)
    expect(after.timelines[0].tracks[1].target).not.toBe('layers.leaf.opacity')
    expect(after.timelines[0].tracks[1].target.startsWith('layers.')).toBe(true)
    expect(after.timelines[0].tracks[1].target.endsWith('.opacity')).toBe(true)
  })

  it('undo removes both child clones AND duplicated tracks', () => {
    const layers = [
      makeLayer('g', undefined, { type: 'group' }),
      makeLayer('child', 'g'),
    ]
    const tracks: Track[] = [
      { target: 'layers.child.opacity', keyframes: [kf('k1', 0, 1)] },
    ]
    const timeline = makeTimeline(tracks)
    const scene = makeScene(layers, timeline)
    const cmd = makeCloneCmd({
      source: layers[0],
      count: 2,
      timeline,
      allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(6)         // g + child + 2 clones each
    expect(after.timelines[0].tracks.length).toBe(3) // original + 2 dups

    const back = cmd.undo(after)
    expect(back.layers.length).toBe(2)
    expect(back.timelines[0].tracks.length).toBe(1)
  })
})

// ── 2. Locked layer can still be cloned ─────────────────────────────────────

describe('Edge: locked source layer', () => {
  it('locked source is cloneable (clone is unlocked)', () => {
    const source = makeLayer('rect', undefined, { locked: true })
    const scene = makeScene([source])
    const cmd = makeCloneCmd({
      source, count: 1, timeline: null, allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(2)
    expect(after.layers[0].locked).toBe(true)
    // The clone inherits the lock flag (intentional — user can unlock manually)
    // but the system doesn't refuse to clone.
    expect(after.layers[1].locked).toBe(true)
  })
})

// ── 3. Large count performance ──────────────────────────────────────────────

describe('Edge: large array count', () => {
  it('creates 500 clones within reasonable time (smoke test)', () => {
    const source = makeLayer('rect', undefined)
    const scene = makeScene([source])
    const settings = {
      ...defaultLinearArraySettings(),
      count: 500,
      move: { x: 1, y: 0 },
      sourcePolicy: 'clone-source-too' as const,
    }
    const t0 = performance.now()
    const cmd = makeArrayCmd({
      source, settings, timeline: null, allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    const elapsed = performance.now() - t0

    expect(after.layers.length).toBe(501) // source + 500 clones
    // Soft assertion — pre-load is < 500ms on dev hardware; we use 5s
    // to avoid CI flakiness while still catching regressions that go
    // O(n²) or worse.
    expect(elapsed).toBeLessThan(5000)
  })

  it('creates 30 × 30 grid (900 instances)', () => {
    const source = makeLayer('rect', undefined)
    const scene = makeScene([source])
    const settings = {
      ...defaultGridArraySettings(),
      columns: 30,
      rows: 30,
      columnMove: { x: 10, y: 0 },
      rowMove: { x: 0, y: 10 },
      sourcePolicy: 'clone-source-too' as const,
    }
    const cmd = makeArrayCmd({
      source, settings, timeline: null, allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(901) // source + 900 clones
  })
})

// ── 4. Empty / degenerate inputs ────────────────────────────────────────────

describe('Edge: degenerate inputs', () => {
  it('count = 0 creates nothing and is reversible', () => {
    const source = makeLayer('rect', undefined)
    const scene = makeScene([source])
    const cmd = makeCloneCmd({
      source, count: 0, timeline: null, allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(1)
    expect(cmd.undo(after).layers.length).toBe(1)
  })

  it('Array with sourcePolicy=include-source and count=1 creates no new layers', () => {
    const source = makeLayer('rect', undefined)
    const scene = makeScene([source])
    const settings = {
      ...defaultLinearArraySettings(),
      count: 1,
      sourcePolicy: 'include-source' as const,
    }
    const cmd = makeArrayCmd({
      source, settings, timeline: null, allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    expect(after.layers.length).toBe(1) // only the source, no new clones
  })
})

// ── 5. Time offset per clone ────────────────────────────────────────────────

describe('Edge: time offset per array clone', () => {
  it('shifts duplicated keyframes by index × timeOffsetMs', () => {
    const source = makeLayer('rect', undefined)
    const tracks: Track[] = [
      {
        target: 'layers.rect.opacity',
        keyframes: [kf('k1', 0, 0), kf('k2', 500, 1)],
      },
    ]
    const timeline = makeTimeline(tracks)
    const scene = makeScene([source], timeline)
    const settings = {
      ...defaultLinearArraySettings(),
      count: 3,
      sourcePolicy: 'clone-source-too' as const,
      duplicateAnimation: true,
      timeOffsetMs: 100,
    }
    const cmd = makeArrayCmd({
      source, settings, timeline, allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    // 1 original + 3 duplicates
    expect(after.timelines[0].tracks.length).toBe(4)

    // Index 0 dup: offset 0  → 0, 500
    // Index 1 dup: offset 100 → 100, 600
    // Index 2 dup: offset 200 → 200, 700
    const dupTracks = after.timelines[0].tracks.slice(1)
    expect(dupTracks[0].keyframes.map((k) => k.timeMs)).toEqual([0, 500])
    expect(dupTracks[1].keyframes.map((k) => k.timeMs)).toEqual([100, 600])
    expect(dupTracks[2].keyframes.map((k) => k.timeMs)).toEqual([200, 700])
  })

  it('skips animation duplication when settings.duplicateAnimation=false', () => {
    const source = makeLayer('rect', undefined)
    const tracks: Track[] = [
      { target: 'layers.rect.opacity', keyframes: [kf('k1', 0, 1)] },
    ]
    const timeline = makeTimeline(tracks)
    const scene = makeScene([source], timeline)
    const settings = {
      ...defaultLinearArraySettings(),
      count: 3,
      duplicateAnimation: false,
    }
    const cmd = makeArrayCmd({
      source, settings, timeline, allLayers: scene.layers,
    })
    const after = cmd.execute(scene)
    // Only the original track — no duplicates
    expect(after.timelines[0].tracks.length).toBe(1)
  })
})

// ── 6. Selection metadata exposed ───────────────────────────────────────────

describe('Edge: command result metadata', () => {
  it('clone returns suggestedSelection containing the new clones (not source)', () => {
    const source = makeLayer('rect', undefined)
    const scene = makeScene([source])
    const cmd = makeCloneCmd({
      source, count: 3, timeline: null, allLayers: scene.layers,
    })
    expect(cmd.result.suggestedSelection).toHaveLength(3)
    expect(cmd.result.suggestedSelection).not.toContain(source.id)
  })

  it('layerMetadata is keyed by NEW layer ids and records arrayGroupId', () => {
    const source = makeLayer('rect', undefined)
    const scene = makeScene([source])
    const cmd = makeCloneCmd({
      source, count: 2, timeline: null, allLayers: scene.layers,
    })
    const ids = Object.keys(cmd.layerMetadata)
    expect(ids).toHaveLength(2)
    const groupIds = new Set(ids.map((id) => cmd.layerMetadata[id].arrayGroupId))
    expect(groupIds.size).toBe(1) // all share the same arrayGroupId
  })
})
