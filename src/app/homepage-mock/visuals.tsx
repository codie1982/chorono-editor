import type { CSSProperties } from 'react'
import type { ArtKind } from './content'

export function Icon({ name, size = 20 }: { name: 'arrow' | 'search' | 'play' | 'pause' | 'menu' | 'close' | 'github' | 'code' | 'layers' | 'spark' | 'check' | 'chevron'; size?: number }) {
  const paths = {
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    github: <><path d="M9 20c-4 1-4-2-6-2m12 4v-4a3.5 3.5 0 0 0-1-2.5c3-.4 6-1.5 6-6.5a5 5 0 0 0-1.5-3.5A4.6 4.6 0 0 0 18 2s-1.5-.5-4 1a13 13 0 0 0-6 0C5.5 1.5 4 2 4 2a4.6 4.6 0 0 0-.5 3.5A5 5 0 0 0 2 9c0 5 3 6.1 6 6.5A3.5 3.5 0 0 0 7 18v4" /></>,
    code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>,
    layers: <><path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5" /></>,
    spark: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function Logo() {
  return <span className="hm-logo"><svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect width="36" height="36" rx="11" fill="currentColor" /><path d="M25 10a11 11 0 1 0 0 16" stroke="var(--hm-accent)" strokeWidth="4" strokeLinecap="round" /><circle cx="25" cy="18" r="3" fill="var(--hm-accent)" /></svg><span>chorono<span className="hm-logo-dot">.</span></span></span>
}

export function SampleArt({ kind, compact = false }: { kind: ArtKind; compact?: boolean }) {
  return <div className={`hm-art hm-art-${kind} ${compact ? 'hm-art-compact' : ''}`} aria-hidden="true">
    {kind === 'orbit' && <div className="hm-orbit-world"><div className="hm-orbit-ring hm-ring-one" /><div className="hm-orbit-ring hm-ring-two" /><div className="hm-orbit-ring hm-ring-three" /><div className="hm-orbit-core" /><div className="hm-orbit-arm"><span /></div><div className="hm-orbit-arm hm-arm-two"><span /></div><span className="hm-orbit-star">✳</span><span className="hm-orbit-caption">a little out of the ordinary.</span></div>}
    {kind === 'success' && <div className="hm-success-world"><span className="hm-confetti hm-confetti-one" /><span className="hm-confetti hm-confetti-two" /><span className="hm-confetti hm-confetti-three" /><div className="hm-success-ring"><div className="hm-success-check"><Icon name="check" size={56} /></div></div><span className="hm-art-label">Nicely done!</span></div>}
    {kind === 'type' && <div className="hm-type-world"><span className="hm-type-top">make it</span><strong>move<span>↗</span></strong><span className="hm-type-line" /><span className="hm-type-bottom">less static. more magic.</span></div>}
    {kind === 'loader' && <div className="hm-loader-world"><div className="hm-loader-dots">{[0, 1, 2, 3].map(i => <span key={i} style={{ '--i': i } as CSSProperties} />)}</div><span className="hm-art-label">good things take a moment.</span></div>}
    {kind === 'chart' && <div className="hm-chart-world"><span className="hm-chart-heading">Looking up.</span><div className="hm-bars">{[35, 55, 42, 72, 95].map((h, i) => <span key={i} style={{ height: `${h}%`, '--i': i } as CSSProperties} />)}</div><svg viewBox="0 0 200 85" className="hm-chart-arrow"><path d="M5 75 55 50l35 10 50-35 45-15m-25 0h25v25" /></svg></div>}
    {kind === 'bell' && <div className="hm-bell-world"><div className="hm-bell-orbit" /><div className="hm-bell"><svg viewBox="0 0 100 120" fill="none"><path d="M19 77V49a31 31 0 0 1 62 0v28l10 13H9Z" fill="currentColor" /><path d="M38 104a12 12 0 0 0 24 0" stroke="currentColor" strokeWidth="9" strokeLinecap="round" /><path d="M50 10V5" stroke="currentColor" strokeWidth="9" strokeLinecap="round" /></svg><span>1</span></div><span className="hm-art-label">a little heads-up.</span></div>}
    {kind === 'character' && <div className="hm-character-world"><span className="hm-character-speech">hey, you!</span><div className="hm-character-hand" /><div className="hm-character-body"><div className="hm-character-eyes"><span /><span /></div><div className="hm-character-smile" /></div><div className="hm-character-feet"><span /><span /></div><div className="hm-character-shadow" /></div>}
    {kind === 'particles' && <div className="hm-particle-world">{Array.from({ length: 8 }, (_, i) => <span key={i} className={`hm-particle hm-particle-${i}`} style={{ '--i': i } as CSSProperties} />)}<span className="hm-particle-center">✳</span></div>}
  </div>
}
