import { describe, expect, it } from 'vitest'
import { emptyScene, newTimeline } from '../../defaults'
import { keyframePlaybackRange } from '../keyframePlaybackRange'
import { PlaybackClock, playbackWindow, type PlaybackRange } from '../playbackClock'
import { exportToRuntime } from '../../export/runtimeExport'

const windowFor = (patch: Partial<PlaybackRange> = {}) => playbackWindow({ maxDuration: 5000, wrapAtEnd: false,
  workAreaInMs: 2000, workAreaOutMs: 4000, range: { startMs: 100.25, endMs: 400.75, loop: false, ...patch } })

describe('first-to-last-key editor playback', () => {
  it('uses all finite, in-duration track keys without sorting/mutating or changing Work Area', () => {
    const timeline = { ...newTimeline(), durationMs: 1000, workAreaInMs: 0, workAreaOutMs: 50,
      tracks: [900.75, -1, NaN, Infinity, 1001, 123.25].map((timeMs, i) => ({ target: `layers.${i}.opacity`,
        keyframes: [{ id: String(i), timeMs, value: 1, easing: { type: 'linear' as const } }] })) }
    const before = structuredClone(timeline)
    expect(keyframePlaybackRange(timeline)).toMatchObject({ startMs: 123.25, endMs: 900.75 })
    expect(timeline).toEqual(before)
    expect(keyframePlaybackRange({ ...timeline, tracks: [] })).toBeNull()
    expect(keyframePlaybackRange(null)).toBeNull()
  })
  it('starts from first key, stops exactly on last key, and leaves paused editing unrestricted', () => {
    const clock = new PlaybackClock(windowFor())
    clock.seek(0, 0); expect(clock.timeMs).toBe(0)
    clock.play(50); expect(clock.timeMs).toBe(100.25)
    expect(clock.sample(250)).toBe(300.25)
    expect(clock.sample(9999)).toBe(400.75); expect(clock.playing).toBe(false)
    clock.play(10000); expect(clock.sample(10100)).toBe(200.25)
    clock.pause(10100); clock.seek(4500, 10200); expect(clock.timeMs).toBe(4500)
  })
  it('loops and honors bounded repeats independently of the composition and Work Area', () => {
    const clock = new PlaybackClock(windowFor({ loop: true, loopCount: 2 }))
    clock.play(0)
    expect(clock.sample(400)).toBe(199.75)
    expect(clock.sample(601)).toBe(400.75); expect(clock.playing).toBe(false)
    const infinite = new PlaybackClock(windowFor({ loop: true }))
    infinite.play(0); expect(infinite.sample(601)).toBe(100.25); expect(infinite.playing).toBe(true)
  })
  it('ping-pongs within the key span, preserves reverse direction on pause/speed changes and stops at first key', () => {
    const clock = new PlaybackClock(windowFor({ pingPong: true, loopCount: 1 }))
    clock.play(0); expect(clock.sample(400)).toBe(301.25)
    clock.pause(450); expect(clock.timeMs).toBe(251.25)
    clock.play(1000); clock.setSpeed(2, 1050); expect(clock.sample(1100)).toBe(101.25)
    expect(clock.sample(1101)).toBe(100.25); expect(clock.playing).toBe(false)
    clock.play(1200); expect(clock.timeMs).toBe(100.25); expect(clock.sample(1250)).toBe(200.25)
  })
  it('recomputes edited bounds during playback and a single-key range shows a pose without spinning', () => {
    const clock = new PlaybackClock(windowFor({ pingPong: true }))
    clock.play(0); clock.sample(400)
    clock.configure(windowFor({ startMs: 200, endMs: 600, pingPong: true }), 400)
    expect(clock.sample(450)).toBe(251.25)
    const pose = new PlaybackClock(windowFor({ startMs: 275.5, endMs: 275.5, loop: true }))
    pose.seek(0, 0); pose.play(100); expect(pose.timeMs).toBe(275.5); expect(pose.playing).toBe(false)
  })
  it('persists the preference in source JSON but excludes it from basic runtime without altering key data', () => {
    const scene = emptyScene(); scene.timelines = [{ ...newTimeline(), playKeyRange: true, durationMs: 1000,
      tracks: [{ target: 'layers.hero.opacity', keyframes: [{ id: 'key', timeMs: 375.25, value: 1, easing: { type: 'linear' } }] }] }]
    const restored = JSON.parse(JSON.stringify(scene))
    expect(restored.timelines[0].playKeyRange).toBe(true)
    const output = exportToRuntime(scene, { snapKeyframesToFrames: false, collapseIdenticalKeyframes: false })
    expect(output.timelines[0]).not.toHaveProperty('playKeyRange')
    expect(output.timelines[0].durationMs).toBe(1000)
    expect(output.timelines[0].tracks).toEqual(scene.timelines[0].tracks)
    expect(scene.timelines[0].playKeyRange).toBe(true)
  })
})
