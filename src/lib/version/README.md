# Application build identity

Public entry: `src/lib/version/index.ts`. `applicationBuildInfo` is composed once
from the root `package.json` version. It is separate from MCP protocol and future
report-schema versions. Importing it performs no collection or network request.

```ts
import { applicationBuildInfo, createBuildInfo } from '@/lib/version'

applicationBuildInfo.appVersion // package version, currently 0.2.0
createBuildInfo('0.2.0') // frozen local identity; no process/Git discovery
```

Official build composition may explicitly set
`NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_ID=release-<12..40 lowercase public hex>` and
`NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_CHANNEL=stable` (or `prerelease` for a SemVer
prerelease). These values become public application metadata: do not supply
private revisions or any user/project/installation identifier. Missing, invalid
or channel-inconsistent release configuration safely yields `buildId: 'local'`
and `channel: 'local'`. NODE_ENV does not imply an official build.

`createBuildInfo` is pure and immutable. It validates bounded SemVer syntax but
does not compare release precedence, query a manifest or install updates.
There are no resource handles or cleanup operations. Future release checking
belongs to a separate caller/adapter rather than this data contract.
