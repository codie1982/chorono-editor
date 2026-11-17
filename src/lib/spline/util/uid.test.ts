import { expect, it, vi } from 'vitest'
import { createSplineIdAllocator, uid } from './uid'

it('reserves source/import IDs and newly generated IDs even with deterministic random collisions', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(.5)
  try {
    const seed = uid('pt'), counter = Number(seed.split('_')[1]), suffix = seed.split('_')[2]
    const reserved = [`pt_${counter + 1}_${suffix}`, `pt_${counter + 2}_${suffix}`]
    const allocate = createSplineIdAllocator(reserved), first = allocate('pt'), second = allocate('pt')
    expect(reserved).not.toContain(first); expect(reserved).not.toContain(second); expect(second).not.toBe(first)
    expect(first).toBe(`pt_${counter + 3}_${suffix}`)
  } finally { random.mockRestore() }
})
