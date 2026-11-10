import { DIAGNOSTIC_MAX_REPORT_BYTES } from '@/lib/diagnostics'
import { BoundedBinaryReader, BoundedTextReader } from '@/lib/resources/io'

/** Consume actual streaming request bytes through existing finite input owners.
 * Both Content-Length and actual bytes are capped; rejected/aborted streams are
 * cancelled and all temporary leases release after parse. Input never escapes
 * as a raw string or buffer. Caller owns timeout/admission/JSON error response. */
export async function readDiagnosticBody(request: Request, signal: AbortSignal): Promise<unknown> {
  if (!request.body) throw new SyntaxError('missing-body')
  const binary = new BoundedBinaryReader({ maxBytes: DIAGNOSTIC_MAX_REPORT_BYTES })
  const input = await binary.readResponse(new Response(request.body, { headers: {
    'content-length': request.headers.get('content-length') ?? '',
  } }), { signal })
  try {
    return await new BoundedTextReader({ maxInputBytes: DIAGNOSTIC_MAX_REPORT_BYTES })
      .withBytes(new Uint8Array(input.buffer), text => JSON.parse(text), { signal })
  } finally { input.release() }
}
