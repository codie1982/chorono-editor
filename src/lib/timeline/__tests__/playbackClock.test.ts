import { describe, expect, it } from 'vitest'
import { PlaybackClock, playbackWindow } from '../playbackClock'

const options = (patch: Partial<Parameters<typeof playbackWindow>[0]> = {}) => playbackWindow({ maxDuration: 5000, wrapAtEnd: false, ...patch })

describe('playback window changes', () => {
  it('preserves elapsed time when the work area changes during playback', () => {
    const clock = new PlaybackClock(options())
    clock.play(0)
    expect(clock.sample(1000)).toBe(1000)
    clock.configure(options({ workAreaInMs: 500, workAreaOutMs: 2500 }), 1200)
    expect(clock.timeMs).toBe(1200)
    expect(clock.sample(1300)).toBe(1300)
  })

  it('clamps to a later IN point and continues immediately from that point', () => {
    const clock = new PlaybackClock(options())
    clock.play(0)
    clock.configure(options({ workAreaInMs: 2000, workAreaOutMs: 4000 }), 1200)
    expect(clock.timeMs).toBe(2000)
    expect(clock.sample(1300)).toBe(2100)
  })

  it('pauses at a shortened end and replays from IN on the next Play', () => {
    const clock = new PlaybackClock(options())
    clock.play(0)
    clock.configure(options({ maxDuration: 1000 }), 1200)
    expect(clock.timeMs).toBe(1000)
    expect(clock.playing).toBe(false)
    clock.play(1500)
    expect(clock.sample(1600)).toBe(100)
  })

  it('preserves loop phase across speed/window changes', () => {
    const clock = new PlaybackClock(options({ workAreaInMs: 500, workAreaOutMs: 1000, wrapAtEnd: true }))
    clock.play(0)
    expect(clock.sample(1600)).toBe(600)
    clock.setSpeed(2, 1600)
    expect(clock.sample(1700)).toBe(800)
    clock.configure(options({ workAreaInMs: 700, workAreaOutMs: 2000, wrapAtEnd: true }), 1700)
    expect(clock.sample(1800)).toBe(1000)
  })

  it('freezes accurately between frames and resumes without a jump', () => {
    const clock = new PlaybackClock(options())
    clock.play(100)
    clock.sample(500)
    clock.pause(550)
    expect(clock.timeMs).toBe(450)
    expect(clock.sample(2000)).toBe(450)
    clock.play(2000)
    expect(clock.sample(2100)).toBe(550)
  })

  it('supports paused scrubbing outside work area and snaps into it on Play', () => {
    const clock = new PlaybackClock(options({ workAreaInMs: 500, workAreaOutMs: 1000 }))
    clock.seek(100, 0)
    expect(clock.timeMs).toBe(100)
    clock.play(100)
    expect(clock.sample(200)).toBe(600)
  })

  it('explicit pause remains stopped after natural end and repeated editing-tool transitions', () => {
    const clock = new PlaybackClock(options({ maxDuration: 1000 }))
    clock.play(0)
    clock.sample(1100)
    expect(clock.playing).toBe(false)
    clock.pause(1200)
    clock.pause(1300)
    expect(clock.playing).toBe(false)
    expect(clock.sample(2000)).toBe(1000)
    clock.seek(400, 2100)
    clock.pause(2200)
    expect(clock.sample(3000)).toBe(400)
  })

  it('normalizes invalid work areas and does not run an empty composition', () => {
    expect(options({ workAreaInMs: 6000, workAreaOutMs: 7000 })).toEqual({ durationMs: 5000, startMs: 0, endMs: 5000, wrapAtEnd: false })
    const clock = new PlaybackClock(options({ maxDuration: 0 }))
    clock.play(100)
    expect(clock.playing).toBe(false)
    expect(clock.sample(500)).toBe(0)
  })
})
