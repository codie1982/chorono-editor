// ── Shared AI action helpers ──────────────────────────────────────────────────
// Single source for tiny utilities reused across action modules.

/** No-op command surfacing an AI error in the undo history label. */
export function errorCmd(message: string) {
  return {
    label: `AI ERROR: ${message}`,
    execute: <S,>(s: S): S => s,
    undo:    <S,>(s: S): S => s,
  }
}
