import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
if (!args[0] || args.length > 2) throw new Error('Usage: npm run perf:serve -- output-directory [port]')
const directory = path.resolve(args[0])
const port = Number(args[1] ?? 4319)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local benchmark port')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.woff': 'font/woff',
  '.webm': 'video/webm', '.wav': 'audio/wav' }

/** Loopback-only static test host. Allows prepared flat artifacts, never arbitrary paths or writes. */
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const file = pathname === '/' ? 'index.html' : pathname.slice(1)
  if (request.method !== 'GET' || !/^[a-zA-Z0-9._-]+$/.test(file) || !mime[path.extname(file)]) {
    response.writeHead(404); response.end(); return
  }
  try {
    const target = path.join(directory, file)
    if (!(await stat(target)).isFile()) throw new Error('Not a file')
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-store' })
    createReadStream(target).pipe(response)
  } catch { response.writeHead(404); response.end() }
})
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${port}`, directory })))
