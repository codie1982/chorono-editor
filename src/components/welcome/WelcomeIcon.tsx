import type { CSSProperties } from 'react'

const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  folder: 'M3 7V5h6l2 2h10v12H3V7Zm0 0h18',
  plus: 'M12 5v14M5 12h14',
  play: 'm9 5 10 7-10 7V5Z',
  layers: 'm12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  key: 'm14 5 5 5m-6 6-2-2m-3 3-2-2m-3 6 8-8a5 5 0 1 0-2-2l-8 8v2h2Z',
} as const

/** Small, decorative startup action icons; accessible names belong to their buttons. */
export function WelcomeIcon({ name, size = 20, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>
    <path d={paths[name]} />
  </svg>
}
