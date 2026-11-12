import { InteractionTrace } from './InteractionTrace'
import { createBrowserTracePersistence, createTraceBootId } from './persistence/browserTracePersistence'

/** Application-local diagnostic owner. Disabled until the user starts tracing;
 * records stay outside scene JSON/undo and are never uploaded automatically. */
export const interactionTrace = new InteractionTrace(300, Date.now, createTraceBootId())

/** Acquire best-effort tab storage in an always-mounted client editor effect.
 * First use is opt-in/off; a previously enabled same-tab collection survives
 * reload. Calling the returned cleanup flushes/releases the adapter lease. */
export const ensureInteractionTracePersistence = createBrowserTracePersistence(interactionTrace)

export { InteractionTrace } from './InteractionTrace'
export type { InteractionTraceContext, InteractionTraceDetails, InteractionTraceRecord, InteractionTraceRestoreState, InteractionTraceSession, InteractionTraceSnapshot } from './types'
