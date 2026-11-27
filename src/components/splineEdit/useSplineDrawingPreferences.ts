'use client'
import { useEffect, useState } from 'react'
const key = 'chorono.spline-drawing.v1'
/** Browser-only Auto Close preference. Loaded after hydration, persisted on
 * explicit changes; denied/corrupt storage falls back to true. Never stored in
 * scene/history or sent over MCP. No timer or other native resource is owned. */
export function useSplineDrawingPreferences() {
  const [autoClose, setValue] = useState(true)
  useEffect(() => { try { const data = JSON.parse(localStorage.getItem(key) ?? 'null'); if (data?.version === 1 && typeof data.autoClose === 'boolean') setValue(data.autoClose) } catch { /* Optional preference. */ } }, [])
  const setAutoClose = (value: boolean) => { setValue(value); try { localStorage.setItem(key, JSON.stringify({ version: 1, autoClose: value })) } catch { /* Editing works without storage. */ } }
  return { autoClose, setAutoClose }
}
