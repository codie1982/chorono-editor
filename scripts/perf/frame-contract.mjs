import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {prepareNativeCheck} from './native-check.mjs'

/** Standalone native output proof; prepare only in a stopped source checkout.
 * It adds no editor route and never mutates an open document. */
const output=path.resolve(process.argv[2]??'artifacts/validation/pre3d-frame-contract/build')
const metadata=await prepareNativeCheck({entry:'src/lib/export/__tests__/browser-frame-contract.ts',output,name:'frame-contract',title:'Chorono pre-3D frame contract'})
await writeFile(path.join(output,'frame-contract-sources.json'),JSON.stringify(metadata,null,2))
console.log(JSON.stringify({output,bundleSha256:metadata.bundleSha256}))
