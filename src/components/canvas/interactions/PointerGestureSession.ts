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
    const target = host.eventTarget
    target.addEventListener('pointerdown', this.onDown, true)
    target.addEventListener('pointermove', this.onMove, true)
    target.addEventListener('pointerup', this.onUp, true)
    target.addEventListener('pointercancel', this.onCancel, true)
    target.addEventListener('blur', this.onBlur)
    target.addEventListener('keydown', this.onKey)
    this.capture?.addEventListener('lostpointercapture', this.onLostCapture)
    try { if (this.pointerId !== undefined) this.capture?.setPointerCapture?.(this.pointerId) }
    catch { /* Capture can fail outside the active pointer's native element. */ }
  }

  /** Check/pin identity without consuming a sample. It remains valid while a
   * terminal callback runs, unless that callback explicitly disposes the owner. */
  accepts(sample: PointerGestureSample): boolean {
    if (this.disposed || !Number.isFinite(sample.pointerId)) return false
    if (this.pointerId === undefined) this.pointerId = sample.pointerId
    return sample.pointerId === this.pointerId
  }

  /** Cancel once and detach, preserving the reason for the domain adapter.
   * Reentrant cancellation during another terminal callback is ignored. */
  cancel(reason: PointerGestureCancelReason): void {
    if (this.disposed || this.terminating) return
    this.terminate(() => this.host.cancel(reason), false)
  }

  /** Detach/release without a cancellation callback, for host completion or
   * unmount. Idempotent and safe from inside move/up/cancel callbacks. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const target = this.host.eventTarget
    target.removeEventListener('pointerdown', this.onDown, true)
    target.removeEventListener('pointermove', this.onMove, true)
    target.removeEventListener('pointerup', this.onUp, true)
    target.removeEventListener('pointercancel', this.onCancel, true)
    target.removeEventListener('blur', this.onBlur)
    target.removeEventListener('keydown', this.onKey)
    this.capture?.removeEventListener('lostpointercapture', this.onLostCapture)
    try { if (this.pointerId !== undefined) this.capture?.releasePointerCapture?.(this.pointerId) }
    catch { /* Capture may have failed or already been released by the browser. */ }
  }

  private readonly onMove = (event: PointerEvent) => {
    if (this.terminating || !this.accepts(event)) return
    if (Number.isFinite(event.buttons) && (event.buttons & this.buttonMask) === 0) {
      this.recoverRelease()
      return
    }
    this.lastPressed = this.copy(event)
    try { this.host.move(this.copy(event)) }
    catch (error) { this.report(error); this.cancel('error') }
  }

  private readonly onDown = (event: PointerEvent) => {
    if (this.terminating || !this.accepts(event)) return
    const previousReleased = Number.isFinite(event.buttons) && (event.buttons & this.buttonMask) === 0
    if (event.button !== this.button && !previousReleased) return
    this.recoverRelease()
  }

  private readonly onUp = (event: PointerEvent) => { this.finish(event) }
  private readonly onCancel = (event: PointerEvent) => {
    if (this.accepts(event)) this.cancel('pointercancel')
  }
  private readonly onLostCapture = (event: Event) => {
    if (this.accepts(event as PointerEvent)) this.cancel('lostpointercapture')
  }
  private readonly onBlur = () => { this.cancel('blur') }
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !this.disposed && !this.terminating) {
      event.preventDefault(); this.cancel('escape')
    }
  }

  /** A missing terminal event cannot turn the next hover/down into geometry. */
  private recoverRelease(): void {
    if (this.lastPressed) this.finish(this.lastPressed)
    else this.cancel('buttonsReleased')
  }

  /** Only genuine up or button-state recovery reaches this terminal dispatch. */
  private finish(sample: PointerGestureSample): void {
    if (this.terminating || !this.accepts(sample)) return
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
  private report(error: unknown): void { try { this.host.error?.(error) } catch { /* Diagnostic sink failed. */ } }
}
