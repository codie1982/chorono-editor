'use client'
import { ICON_MAP, CELL_SIZE, iconToBgPos } from '@/lib/icons/iconMap'

interface ChoronoIconProps {
  /** Semantic icon name — must exist in ICON_MAP */
  name: string
  /** Override size (default: 30) */
  size?: number
  /** Extra Tailwind / CSS classes */
  className?: string
  /** Accessible label */
  title?: string
}

/**
 * Renders a single icon from the Chorono sprite sheet.
 *
 * The active theme is detected from the nearest ancestor that carries
 * `data-theme="light"` or `data-theme="dark"`.  If none is set the
 * component falls back to the dark sprite (Chorono's default theme).
 *
 * Usage:
 *   <ChoronoIcon name="star" />
 *   <ChoronoIcon name="bezierPath" size={24} />
 */
export default function ChoronoIcon({ name, size = CELL_SIZE, className = '', title }: ChoronoIconProps) {
  const pos = ICON_MAP[name]

  if (!pos) {
    // Unknown icon — render an empty placeholder so layout is not broken
    return (
      <span
        className={`ch-icon-placeholder ${className}`}
        style={{ width: size, height: size, display: 'inline-block' }}
        title={title ?? name}
      />
    )
  }

  const bgPos = iconToBgPos(pos)

  // When the display size differs from the native cell size (30px), we scale
  // the background-size proportionally so the sprite still aligns correctly.
  const scale      = size / CELL_SIZE
  // Sprite sheet is 10 columns wide — native width = 10 * 30 = 300px
  const nativeCols = 10
  const bgW        = nativeCols * CELL_SIZE * scale
  // We don't know the total row count at compile time; use 'auto' for height
  // so the browser keeps the sprite's aspect ratio.

  // Re-scale the background-position for non-30px sizes
  const scaledX = pos.col * CELL_SIZE * scale
  const scaledY = pos.row * CELL_SIZE * scale
  const scaledBgPos =
    `${scaledX === 0 ? '0' : `-${scaledX}px`} ${scaledY === 0 ? '0' : `-${scaledY}px`}`

  return (
    <span
      role="img"
      aria-label={title ?? name}
      title={title ?? name}
      className={`ch-icon ${className}`}
      style={{
        width:              size,
        height:             size,
        backgroundPosition: size === CELL_SIZE ? bgPos : scaledBgPos,
        backgroundSize:     size === CELL_SIZE ? 'auto' : `${bgW}px auto`,
        flexShrink:         0,
      }}
    />
  )
}

// ── Convenience wrapper used in buttons ──────────────────────────────────────

interface SpriteIconProps {
  /** [row, col] tuple — useful when you already have the coordinates */
  pos: [number, number]
  size?: number
  className?: string
  title?: string
}

export function SpriteIcon({ pos: [row, col], size = CELL_SIZE, className = '', title }: SpriteIconProps) {
  return (
    <ChoronoIcon
      name={Object.keys(ICON_MAP).find(k => ICON_MAP[k].row === row && ICON_MAP[k].col === col) ?? ''}
      size={size}
      className={className}
      title={title}
    />
  )
}
