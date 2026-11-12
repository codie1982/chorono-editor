import { interactionTrace, type InteractionTraceContext, type InteractionTraceDetails, type InteractionTraceSession } from './diagnostics'

/** Client-space pointer state. Missing/nonfinite `buttons` preserves legacy
 * adapters which do not report a button mask; native PointerEvents report it. */
export interface PointerGestureSample {
  pointerId: number
  clientX: number
  clientY: number
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  buttons?: number
  pointerType?: string
}

/** A stable native capture element borrowed for this gesture. Mouse button
 * numbers follow PointerEvent.button; omitted/unknown buttons mean primary. */
export interface PointerGestureStart {
  pointerId: number
  currentTarget: Element
  button?: number
  pointerType?: string
}

export type PointerGestureCancelReason =
  | 'pointercancel' | 'lostpointercapture' | 'blur' | 'escape' | 'buttonsReleased' | 'error'

/** Platform owner callbacks. Domain/source/history policy belongs to the host.
 * `up` receives actual release coordinates, or the last pressed movement when
 * recovering a missed release. Callbacks may dispose their own session safely.
 * Callback failures report `error`, then cancel with reason `error`; teardown
 * cannot be prevented by a throwing diagnostic or cancellation callback. */
export interface PointerGestureHost {
  eventTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  move(sample: PointerGestureSample): void
  up(sample: PointerGestureSample): void
  cancel(reason: PointerGestureCancelReason): void
  error?(error: unknown): void
  diagnostics?: InteractionTraceContext
}

/** Owns one native pointer's listeners, button state and borrowed capture.
 *
 * This mutable, single-use owner has no editor, React or scene dependency.
 * Window down/move/up/cancel listeners use capture phase so target/bubble handlers
 * cannot consume the terminal event. Pointer identity is pinned by `start`, or
 * learned from the first accepted sample for legacy callers without a start.
 *
 * If a move reports that the initiating button is no longer held, the gesture
 * ends at its LAST pressed sample. The new hover point must never move content.
 * A new down from the same pointer also closes a stranded prior gesture when
 * the old button is released or that same button starts again. Genuine chord
 * presses retaining the old button do not interrupt it. The initial down
 * has passed window capture before construction and cannot end its own session.
 * With no pressed movement it cancels instead of inventing a click/drag. Normal
 * up still resamples its actual coordinates, even with no preceding move.
 * Losing element capture is not a pointer cancellation: while the borrowed
 * element remains connected, the pinned window listeners keep ownership until
 * an actual up/recovery or explicit cancel. A lost-capture event's button state
 * never commits a gesture by itself. A disconnected capture target does cancel;
 * the host still disposes/cancels on unmount, source or editing-scope changes.
 * Every terminal path removes listeners and attempts capture release once.
 */
export class PointerGestureSession {
  private pointerId?: number
  private readonly capture?: Element
  private readonly buttonMask: number
  private readonly button: number
  private readonly pointerType?: string
  private lastPressed?: PointerGestureSample
  private disposed = false
  private terminating = false
  private readonly trace?: InteractionTraceSession
  private moves = 0
  private rejected = 0

  /** Attach listeners immediately. Failed native capture is tolerated because
   * window listeners remain the fallback; no ownership of the element is taken. */
  constructor(private readonly host: PointerGestureHost, start?: PointerGestureStart) {
    this.pointerId = start?.pointerId
    this.capture = start?.currentTarget
    this.pointerType = start?.pointerType
    const masks = [1, 4, 2, 8, 16, 32]
    const button = start?.button ?? 0
    this.button = masks[button] === undefined ? 0 : button
    this.buttonMask = masks[this.button]
    this.trace = interactionTrace.begin(host.diagnostics?.owner ?? 'native-pointer', host.diagnostics?.details)
    this.trace?.record('native-start', { pointerId: this.pointerId ?? null,
      pointerType: this.pointerType ?? 'unknown', button: this.button, buttonMask: this.buttonMask,
      captureElement: Boolean(this.capture) })
    const target = host.eventTarget
    target.addEventListener('pointerdown', this.onDown, true)
    target.addEventListener('pointermove', this.onMove, true)
    target.addEventListener('pointerup', this.onUp, true)
    target.addEventListener('pointercancel', this.onCancel, true)
    target.addEventListener('blur', this.onBlur)
    target.addEventListener('keydown', this.onKey)
    this.capture?.addEventListener('lostpointercapture', this.onLostCapture)
    try {
      if (this.pointerId !== undefined) this.capture?.setPointerCapture?.(this.pointerId)
      this.trace?.record('native-capture', { attempted: this.pointerId !== undefined && Boolean(this.capture?.setPointerCapture) })
    } catch { this.trace?.record('native-capture-failed', { reason: 'capture-unavailable' }) }
  }

  /** Check/pin identity without consuming a sample. It remains valid while a
   * terminal callback runs, unless that callback explicitly disposes the owner. */
  accepts(sample: PointerGestureSample): boolean {
    if (this.disposed) return false
    if (!Number.isFinite(sample.pointerId)) { this.reject('invalid-pointer', sample); return false }
    if (this.pointerId === undefined) this.pointerId = sample.pointerId
    if (sample.pointerId !== this.pointerId) { this.reject('foreign-pointer', sample); return false }
    return true
  }

  /** Cancel once and detach, preserving the reason for the domain adapter.
   * Reentrant cancellation during another terminal callback is ignored. */
  cancel(reason: PointerGestureCancelReason): void {
    if (this.disposed || this.terminating) return
    this.trace?.record('native-cancel', { reason, ...this.summary() })
    this.terminate(() => this.host.cancel(reason), false)
  }

  /** Detach/release without a cancellation callback, for host completion or
   * unmount. Idempotent and safe from inside move/up/cancel callbacks. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.trace?.record('native-dispose', { reason: this.terminating ? 'terminal' : 'host-dispose', ...this.summary() })
    const target = this.host.eventTarget
    target.removeEventListener('pointerdown', this.onDown, true)
    target.removeEventListener('pointermove', this.onMove, true)
    target.removeEventListener('pointerup', this.onUp, true)
    target.removeEventListener('pointercancel', this.onCancel, true)
    target.removeEventListener('blur', this.onBlur)
    target.removeEventListener('keydown', this.onKey)
    this.capture?.removeEventListener('lostpointercapture', this.onLostCapture)
    try { if (this.pointerId !== undefined) this.capture?.releasePointerCapture?.(this.pointerId) }
    catch { this.trace?.record('native-release-failed', { reason: 'capture-unavailable' }) }
  }

  private readonly onMove = (event: PointerEvent) => {
    if (this.terminating || !this.accepts(event)) return
    if (Number.isFinite(event.buttons) && (event.buttons & this.buttonMask) === 0) {
      this.recoverRelease('released-buttons-move')
      return
    }
    this.lastPressed = this.copy(event)
    this.moves++
    if (this.moves === 1) this.trace?.record('native-first-move', this.summary())
    try { this.host.move(this.copy(event)) }
    catch (error) { this.report(error); this.cancel('error') }
  }

  private readonly onDown = (event: PointerEvent) => {
    if (this.terminating || !this.accepts(event)) return
    const previousReleased = Number.isFinite(event.buttons) && (event.buttons & this.buttonMask) === 0
    if (event.button !== this.button && !previousReleased) return
    this.recoverRelease('new-pointer-down')
  }

  private readonly onUp = (event: PointerEvent) => { this.finish(event) }
  private readonly onCancel = (event: PointerEvent) => {
    if (this.accepts(event)) this.cancel('pointercancel')
  }
  /** Element capture can disappear immediately before its native up arrives.
   * Keep the window fallback instead of rolling back a valid source preview.
   * Explicit browser cancellation, blur, Escape and host teardown remain terminal.
   * Never reacquire capture here: doing so could steal another native owner's
   * capture. Foreign/late notifications cannot affect this gesture. */
  private readonly onLostCapture = (event: Event) => {
    const sample = event as PointerEvent
    if (this.terminating || !this.accepts(sample)) return
    const connected = this.capture?.isConnected !== false
    this.trace?.record('native-capture-lost', { reason: connected ? 'window-fallback' : 'capture-disconnected',
      captureConnected: connected, eventButtons: Number.isFinite(sample.buttons) ? sample.buttons : null, ...this.summary() })
    if (!connected) this.cancel('lostpointercapture')
  }
  private readonly onBlur = () => { this.cancel('blur') }
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !this.disposed && !this.terminating) {
      event.preventDefault(); this.cancel('escape')
    }
  }

  /** A missing terminal event cannot turn the next hover/down into geometry. */
  private recoverRelease(reason: string): void {
    this.trace?.record('native-recovery', { reason, ...this.summary(), hasPressedSample: Boolean(this.lastPressed) })
    if (this.lastPressed) this.finish(this.lastPressed)
    else this.cancel('buttonsReleased')
  }

  /** Only genuine up or button-state recovery reaches this terminal dispatch. */
  private finish(sample: PointerGestureSample): void {
    if (this.terminating || !this.accepts(sample)) return
    this.trace?.record('native-up', { ...this.summary(), clientX: sample.clientX, clientY: sample.clientY,
      buttons: Number.isFinite(sample.buttons) ? sample.buttons! : null })
    this.terminate(() => this.host.up(this.copy(sample)), true)
  }

  /** Keep identity valid during callbacks; prevent reentrant terminal events.
   * A failed completion is cancelled before unconditional platform teardown. */
  private terminate(action: () => void, cancelOnError: boolean): void {
    this.terminating = true
    try { action() }
    catch (error) {
      this.report(error)
      if (cancelOnError) {
        try { this.host.cancel('error') } catch (failure) { this.report(failure) }
      }
    } finally { this.dispose() }
  }

  /** Detach event data so later mutation/reuse cannot alter recovery geometry. */
  private copy(sample: PointerGestureSample): PointerGestureSample {
    return { pointerId: sample.pointerId, clientX: sample.clientX, clientY: sample.clientY,
      shiftKey: sample.shiftKey, metaKey: sample.metaKey, ctrlKey: sample.ctrlKey,
      buttons: sample.buttons, pointerType: sample.pointerType ?? this.pointerType }
  }

  /** Diagnostics are optional and cannot prevent capture/listener cleanup. */
  private report(error: unknown): void {
    this.trace?.record('native-error', { reason: 'callback-error', errorType: error instanceof Error ? error.name : typeof error })
    try { this.host.error?.(error) } catch { /* Diagnostic sink failed. */ }
  }

  /** First foreign sample is enough for diagnosis; retain only a total thereafter. */
  private reject(reason: string, sample: PointerGestureSample): void {
    this.rejected++
    if (this.rejected === 1) this.trace?.record('native-rejected', { reason, pointerId: Number.isFinite(sample.pointerId) ? sample.pointerId : null })
  }

  /** Terminal movement summary uses CSS px and retains no native event object. */
  private summary(): InteractionTraceDetails {
    return { moves: this.moves, rejectedSamples: this.rejected, pointerId: this.pointerId ?? null,
      clientX: this.lastPressed?.clientX ?? null, clientY: this.lastPressed?.clientY ?? null,
      buttons: Number.isFinite(this.lastPressed?.buttons) ? this.lastPressed!.buttons! : null }
  }
}
