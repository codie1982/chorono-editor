'use client'
import type { SnapSettingsHook } from '@/app/hooks/useSnapSettings'
import { SnapMenu } from './SnapMenu'

/** Single settings adapter for viewport and documentation hosts. All controls
 * borrow the same hook; opening/closing the menu changes no scene or history.
 * Spline vertices are acquired by drawing; segment/subdivision stay reserved. */
export function SnapSettingsMenu({ snap }: { snap: SnapSettingsHook }) {
  const s = snap.settings
  return <SnapMenu enabled={s.enabled} onToggleEnabled={() => snap.setEnabled(!s.enabled)}
    toObjects={s.targets.objects} onToggleObjects={() => snap.setTarget('objects', !s.targets.objects)}
    toPoints={s.targets.points} onTogglePoints={() => snap.setTarget('points', !s.targets.points)}
    toParent={s.targets.parent} onToggleParent={() => snap.setTarget('parent', !s.targets.parent)}
    toGuides={s.targets.guides} onToggleGuides={() => snap.setTarget('guides', !s.targets.guides)}
    toGrid={s.targets.grid} onToggleGrid={() => snap.setTarget('grid', !s.targets.grid)}
    toPixel={s.targets.pixel} onTogglePixel={() => snap.setTarget('pixel', !s.targets.pixel)}
    toVertex={s.targets.vertex} onToggleVertex={() => snap.setTarget('vertex', !s.targets.vertex)}
    gridSize={s.grid.sizePx} onGridSizeChange={snap.setGridSize} gridVisible={s.grid.visible} onGridVisible={snap.setGridVisible}
    gridInFront={s.grid.inFront} onGridInFront={snap.setGridInFront}
    radiusPx={s.radiusPx} onRadiusChange={snap.setRadiusPx} onClearTargets={snap.clearTargets} onResetSettings={snap.resetDefaults}
    angleEnabled={s.angle.enabled} angleStep={s.angle.stepDeg} onAngleEnabled={snap.setAngleEnabled} onAngleStep={snap.setAngleStep}
    scaleEnabled={s.scale.enabled} scaleStep={s.scale.stepPercent} onScaleEnabled={snap.setScaleEnabled} onScaleStep={snap.setScaleStep} />
}
