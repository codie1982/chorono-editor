/** Shared composition-pixel limits for viewport drawing and grid snapping. */
export const GRID_SPACING_MIN = 1
export const GRID_SPACING_MAX = 10000

/** Accept finite pixel spacing only; invalid input leaves the owning setting
 * unchanged. Fractional pixels are supported, with a minimum of one pixel. */
export function validGridSpacing(value: number): boolean {
  return Number.isFinite(value) && value >= GRID_SPACING_MIN && value <= GRID_SPACING_MAX
}

/** Grid acquisition follows the displayed viewport grid, independently of
 * angle/scale snapping. Omitted visibility preserves legacy engine-only hosts;
 * editor settings always supply it. This never clears the stored preference. */
export function gridSnappingEnabled(settings: { enabled: boolean; targets: { grid: boolean }; grid: { visible?: boolean } }): boolean {
  return settings.enabled && settings.targets.grid && settings.grid.visible !== false
}
