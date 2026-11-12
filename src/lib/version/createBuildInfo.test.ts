import { afterEach, describe, expect, it, vi } from 'vitest'
import { version } from '../../../package.json'
import { createBuildInfo } from './createBuildInfo'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('application build identity', () => {
  it('defaults to a frozen local identity with no caller metadata retained', () => {
    const metadata = createBuildInfo('0.2.0')
    expect(metadata).toEqual({ appVersion: '0.2.0', buildId: 'local', channel: 'local' })
    expect(Object.isFrozen(metadata)).toBe(true)
  })

  it('accepts explicit public release metadata and preserves semantic package version', () => {
    const input = { buildId: 'release-0123456789abcdef', channel: 'stable' }
    const metadata = createBuildInfo('0.2.0+public.3', input)
    input.buildId = 'release-ffffffffffff'
    expect(metadata).toEqual({ appVersion: '0.2.0+public.3', buildId: 'release-0123456789abcdef', channel: 'stable' })
    expect(Object.isFrozen(metadata)).toBe(true)
    expect(createBuildInfo('0.3.0-beta.1', { buildId: 'release-0123456789ab', channel: 'prerelease' }).channel).toBe('prerelease')
  })

  it.each([
    {},
    { buildId: 'release-0123456789abcdef' },
    { buildId: 'release-0123456789ab', channel: 'prerelease' },
    { buildId: '/Users/private/project', channel: 'stable' },
    { buildId: 'release-person@example.com', channel: 'stable' },
    { buildId: 'release-0123456789AABB', channel: 'stable' },
    { buildId: 'release-0123456789ab\n', channel: 'stable' },
    { buildId: 'release-0123456789ab', channel: 'production' },
    { buildId: `release-${'a'.repeat(41)}`, channel: 'stable' },
  ])('discards incomplete or unsafe official-release configuration: %j', input => {
    expect(createBuildInfo('0.2.0', input)).toEqual({ appVersion: '0.2.0', buildId: 'local', channel: 'local' })
  })

  it('does not label a prerelease version as a stable release', () => {
    expect(createBuildInfo('0.3.0-beta', { buildId: 'release-0123456789ab', channel: 'stable' }).channel).toBe('local')
  })

  it.each(['0.2', 'v0.2.0', '01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-beta..1', '1.2.3+', '1.2.3\n', `1.2.3+${'a'.repeat(100)}`])(
    'rejects malformed or unbounded trusted package version: %s', appVersion => {
      expect(() => createBuildInfo(appVersion)).toThrow(RangeError)
    })

  it('composes current metadata from package version rather than MCP protocol or NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_ID', '')
    vi.stubEnv('NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_CHANNEL', '')
    const { applicationBuildInfo } = await import('./applicationBuildInfo')
    expect(applicationBuildInfo).toEqual({ appVersion: version, buildId: 'local', channel: 'local' })
  })

  it('uses only explicitly configured public release inputs in the current adapter', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_ID', 'release-0123456789abcdef')
    vi.stubEnv('NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_CHANNEL', 'stable')
    const { applicationBuildInfo } = await import('./applicationBuildInfo')
    expect(applicationBuildInfo).toEqual({ appVersion: version, buildId: 'release-0123456789abcdef', channel: 'stable' })
  })
})
