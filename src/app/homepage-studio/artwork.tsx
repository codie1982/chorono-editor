import type { CSSProperties } from 'react'
import type { ArtKind } from '../homepage-mock/content'

function Sculpture() {
  const rings = Array.from({ length: 60 }, (_, i) => {
    const theta = i / 60 * Math.PI * 2
    const points = Array.from({ length: 65 }, (_, j) => {
      const phi = j / 64 * Math.PI * 2
      const radius = 145 + 52 * Math.cos(phi)
      const x = radius * Math.cos(theta)
      const y = radius * Math.sin(theta)
      const z = 52 * Math.sin(phi)
      return `${j ? 'L' : 'M'}${(250 + x * .88 - y * .34).toFixed(2)},${(230 + x * .34 + y * .49 - z * .88).toFixed(2)}`
    }).join(' ')
    return <path key={i} d={points} stroke={`hsl(${228 + Math.cos(theta) * 8} 86% ${72 + Math.sin(theta) * 12}%)`} />
  })
  return <svg className="cs-sculpture" viewBox="0 50 500 360" fill="none" strokeWidth="1.2" aria-hidden="true"><g>{rings}</g></svg>
}

export function StudioArtwork({ kind }: { kind: ArtKind }) {
  return <div className={`cs-art cs-art-${kind}`} aria-hidden="true">
    {kind === 'orbit' && <Sculpture />}
    {kind === 'type' && <div className="cs-type"><span>MAKE</span><span>YOUR<span className="cs-type-spark">✳</span></span><span>MOVE.</span></div>}
    {kind === 'success' && <div className="cs-confirm"><span className="cs-confirm-orbit" /><span className="cs-confirm-orbit" /><div className="cs-confirm-disc"><svg viewBox="0 0 100 100"><path d="m25 50 17 17 33-35" /></svg></div><span className="cs-art-caption">DONE. AND DONE WELL.</span></div>}
    {kind === 'loader' && <div className="cs-loading"><div>{[0, 1, 2, 3, 4].map(i => <span key={i} style={{ '--n': i } as CSSProperties} />)}</div><span className="cs-art-caption">SOMETHING IS TAKING SHAPE.</span></div>}
    {kind === 'chart' && <div className="cs-chart"><svg viewBox="0 0 420 240" fill="none"><path className="cs-chart-grid" d="M20 50h380M20 100h380M20 150h380M20 200h380M50 20v200M130 20v200M210 20v200M290 20v200M370 20v200" /><path className="cs-chart-fill" d="M25 180C70 180 65 115 115 115S160 155 205 120s50-95 95-80 50 30 95-10v185H25Z" /><path className="cs-chart-line" d="M25 180C70 180 65 115 115 115S160 155 205 120s50-95 95-80 50 30 95-10" /><circle className="cs-chart-point" cx="205" cy="120" r="8" /></svg><span className="cs-art-caption">EVERY NUMBER HAS A STORY.</span></div>}
    {kind === 'bell' && <div className="cs-bell"><span className="cs-bell-halo" /><svg viewBox="0 0 140 160" fill="none"><path d="M29 103V64a41 41 0 0 1 82 0v39l12 16H17Z" /><path d="M54 137a17 17 0 0 0 32 0M70 18V9" /><circle cx="111" cy="38" r="18" className="cs-bell-badge" /><path d="M111 30v16" className="cs-bell-one" /></svg><span className="cs-art-caption">A SIGNAL, NOT THE NOISE.</span></div>}
    {kind === 'character' && <div className="cs-mascot"><div className="cs-mascot-antenna" /><div className="cs-mascot-body"><span /><span /><i /></div><div className="cs-mascot-hand" /><div className="cs-mascot-legs"><span /><span /></div><span className="cs-art-caption">HELLO, POSSIBILITY.</span></div>}
    {kind === 'particles' && <div className="cs-particles">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ '--n': i } as CSSProperties} />)}<span className="cs-particles-core">✳</span></div>}
  </div>
}
