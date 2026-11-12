import { MAX_GUIDE_POSITION } from '@/lib/geometry/guides/sceneGuideData'

/** Convert a numeric inspector draft to composition pixels. Blank, nonfinite
 * and out-of-budget values are explicit errors, including Enter submissions;
 * an empty input must never silently turn into a guide at zero. */
export function guidePositionInput(text: string): number {
  const value = Number(text)
  if (!text.trim() || !Number.isFinite(value) || Math.abs(value) > MAX_GUIDE_POSITION) {
    throw new Error(`Enter a finite guide position between −${MAX_GUIDE_POSITION} and ${MAX_GUIDE_POSITION} px.`)
  }
  return value
}
