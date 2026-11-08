/** Expected platform/font compatibility failure. Import may keep an asset with
 * a warning for this error only; budget, transport, cancellation and malformed
 * container errors retain their own fatal semantics. */
export class FontRegistrationUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'FontRegistrationUnavailable' }
}
