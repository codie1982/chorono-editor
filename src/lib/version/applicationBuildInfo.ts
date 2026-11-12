import { version } from '../../../package.json'
import { createBuildInfo } from './createBuildInfo'

/** Current application's frozen build identity, composed once from package.json.
 * NEXT_PUBLIC values are explicit build-time release inputs embedded by Next;
 * absent/invalid values identify a local build. This adapter does not discover
 * Git, filesystem, host, process IDs, credentials or installation identities.
 * Importing this module starts no collection, persistence or network activity.
 */
export const applicationBuildInfo = createBuildInfo(version, {
  buildId: process.env.NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_ID,
  channel: process.env.NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_CHANNEL,
})
