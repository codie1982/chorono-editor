// ── Chrono Player — React binding barrel ────────────────────────────────────────
// Separate from the core barrel so the framework-free player stays importable
// without pulling React in (mirrors @chorono/runtime vs @chorono/runtime/react).

export { ChoronoView } from './ChoronoView'
export type { ChoronoViewHandle, ChoronoViewProps } from './ChoronoView'
