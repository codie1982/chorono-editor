import type { BuildInfo, OfficialReleaseConfiguration } from './types'

// SemVer 2.0.0 syntax only; this is not a version precedence comparator.
const numeric = '(?:0|[1-9]\\d*)'
const prereleaseIdentifier = `(?:${numeric}|\\d*[A-Za-z-][0-9A-Za-z-]*)`
const versionPattern = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-(${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`)
const officialBuildPattern = /^release-[a-f0-9]{12,40}$/

/** Construct a frozen build identity from the authoritative package version.
 *
 * `appVersion` must be bounded SemVer 2.0.0 syntax (up to 96 ASCII characters);
 * malformed trusted package metadata throws RangeError. `officialRelease` is
 * optional trusted build-time configuration, never inferred from Git, paths,
 * NODE_ENV, browser or installation metadata. Only a public `release-` ID with
 * 12–40 lowercase hexadecimal characters and a matching stable/prerelease
 * channel is accepted. Missing/malformed release configuration yields
 * `{ appVersion, buildId: 'local', channel: 'local' }` without retaining it.
 *
 * The input is borrowed, never mutated or retained. The returned value has no
 * clocks, environment, transport or resource ownership; equal inputs produce
 * equal records. It identifies application releases, not individual clients.
 * See https://semver.org/ for syntax; precedence comparison is a future concern.
 */
export function createBuildInfo(appVersion: string, officialRelease?: OfficialReleaseConfiguration): BuildInfo {
  const match = typeof appVersion === 'string' && appVersion.length <= 96 ? versionPattern.exec(appVersion) : null
  if (!match || match[0] !== appVersion) throw new RangeError('Application version must be bounded semantic version metadata.')
  const channel = match[1] ? 'prerelease' : 'stable'
  if (officialRelease?.channel === channel && typeof officialRelease.buildId === 'string'
    && officialBuildPattern.exec(officialRelease.buildId)?.[0] === officialRelease.buildId) {
    return Object.freeze({ appVersion, buildId: officialRelease.buildId, channel })
  }
  return Object.freeze({ appVersion, buildId: 'local', channel: 'local' })
}
