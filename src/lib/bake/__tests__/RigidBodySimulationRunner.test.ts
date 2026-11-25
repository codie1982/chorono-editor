import { describe, expect, it } from 'vitest'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import { RigidBodySimulationRunner } from '../rigid/RigidBodySimulationRunner'
import { rigidBakeFixture } from './RigidBodyBakeFixture'

describe('RigidBodySimulationRunner', () => {
  it('captures sorted, fixed-tick Matter contact events with detached pose buffers', async () => {
    const { recipe } = rigidBakeFixture()
    const result = await new RigidBodySimulationRunner({ yieldEveryTicks: 32 }).simulate(recipe, {
      signal: new AbortController().signal,
      reportProgress: () => {},
    })
    const contacts = result.events.filter(event => event.kind === 'contact-start')
    const clock = new SimulationClock(recipe)

    expect(result.execution).toBe('inline')
    expect(result.sampleTimesMs).toHaveLength(clock.sampleCount)
    expect(result.poses).toHaveLength(clock.sampleCount * recipe.bodies.length * 3)
    expect(contacts.length).toBeGreaterThan(0)
    contacts.forEach(event => {
      expect(event.timeMs).toBeCloseTo(clock.timeMsForTick(event.tick), 7)
      expect(event.bodyIds).toEqual([...event.bodyIds].sort())
      expect(event.bodyIds).toEqual(['rigid:box', 'rigid:floor'])
    })
  })
})
