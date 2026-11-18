import { validGridSpacing } from './gridSettings'

/** Small browser preference, independent of projects, sessions and Undo data. */
export interface ViewportGridPreferences { visible: boolean; inFront: boolean; sizePx: number }
export interface GridPreferencesStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const VIEWPORT_GRID_STORAGE_KEY = 'chorono.viewport-grid.v1'
export const DEFAULT_VIEWPORT_GRID: Readonly<ViewportGridPreferences> = { visible: false, inFront: false, sizePx: 20 }

/** Decode versioned, untrusted browser JSON. Unsupported/corrupt records use
 * defaults; each known field is independently validated without coercion. */
export function decodeViewportGrid(raw: string | null): ViewportGridPreferences {
  const defaults = { ...DEFAULT_VIEWPORT_GRID }
  try {
    const value = raw ? JSON.parse(raw) : null
    if (!value || value.version !== 1) return defaults
    return { visible: typeof value.visible === 'boolean' ? value.visible : defaults.visible,
      inFront: typeof value.inFront === 'boolean' ? value.inFront : defaults.inFront,
      sizePx: typeof value.sizePx === 'number' && validGridSpacing(value.sizePx) ? value.sizePx : defaults.sizePx }
  } catch { return defaults }
}

/** Read once after browser hydration. Denied/unavailable storage is a no-op
 * fallback; source documents and ordinary editor operations remain usable. */
export function readViewportGrid(storage: GridPreferencesStorage, key = VIEWPORT_GRID_STORAGE_KEY): ViewportGridPreferences {
  try { return decodeViewportGrid(storage.getItem(key)) } catch { return { ...DEFAULT_VIEWPORT_GRID } }
}

/** Persist only the three explicit grid preferences. Synchronous storage errors
 * are contained and reported as false; no retry, telemetry or timer is owned. */
export function writeViewportGrid(storage: GridPreferencesStorage, value: ViewportGridPreferences, key = VIEWPORT_GRID_STORAGE_KEY): boolean {
  try { storage.setItem(key, JSON.stringify({ version: 1, visible: value.visible, inFront: value.inFront, sizePx: value.sizePx })); return true }
  catch { return false }
}
