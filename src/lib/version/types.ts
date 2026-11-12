/** Public application channel, distinct from MCP transport/schema versions. */
export type BuildChannel = 'local' | 'stable' | 'prerelease'

/** Immutable, content-free identity of an application build. `buildId` is
 * `local` unless trusted release composition supplied a validated public ID.
 * It never represents an installation, user, project or filesystem checkout. */
export interface BuildInfo {
  readonly appVersion: string
  readonly buildId: string
  readonly channel: BuildChannel
}

/** Explicit trusted release input, normally embedded by official build CI.
 * Unknown/malformed values deliberately fall back to local identity. */
export interface OfficialReleaseConfiguration {
  readonly buildId?: string
  readonly channel?: string
}
