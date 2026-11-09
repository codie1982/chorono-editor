import { InteractionTrace } from './InteractionTrace'

/** Application-local diagnostic owner. Disabled until the user starts tracing;
 * records stay outside scene JSON/undo and are never uploaded automatically. */
export const interactionTrace = new InteractionTrace()

export { InteractionTrace } from './InteractionTrace'
export type { InteractionTraceContext, InteractionTraceDetails, InteractionTraceRecord, InteractionTraceSession, InteractionTraceSnapshot } from './types'
