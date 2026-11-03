import { build } from 'esbuild'
await build({ entryPoints: ['src/mcp/server.ts'], outfile: 'dist/mcp/server.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node20', packages: 'external', sourcemap: true, logLevel: 'info' })
