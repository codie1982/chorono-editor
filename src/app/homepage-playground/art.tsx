import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { ArtKind } from '../homepage-mock/content'

export function PlaygroundArt({ kind }: { kind: ArtKind }) {
  return <div className={`pg-art pg-art-${kind}`} aria-hidden="true">
    {kind === 'orbit' && <Image src="/playground/chrome-ribbon-v1.png" alt="" fill sizes="(max-width: 767px) 100vw, 65vw" quality={85} className="pg-ribbon" />}
    {kind === 'type' && <div className="pg-kinetic"><span>MAKE</span><span>IT <i>↗</i></span><span>MOVE.</span><small>WORDS WITH A LITTLE MORE ENERGY.</small></div>}
    {kind === 'character' && <div className="pg-creature"><div className="pg-creature-arm" /><div className="pg-creature-body"><span className="pg-eye" /><span className="pg-eye" /><span className="pg-mouth" /></div><div className="pg-creature-feet"><span /><span /></div><span className="pg-creature-bubble">oh, hey!</span><div className="pg-creature-shadow" /></div>}
    {kind === 'success' && <div className="pg-done"><div className="pg-done-shine" /><span><svg viewBox="0 0 100 100" fill="none"><path d="m24 51 17 17 36-38" /></svg></span><strong>All good.</strong><small>ONE SMALL MOMENT. A BETTER FEELING.</small></div>}
    {kind === 'chart' && <div className="pg-data"><span>GOOD THINGS<br />ARE GOING UP.</span><div>{[30, 43, 36, 70, 55, 96].map((height, i) => <i key={i} style={{ height: `${height}%`, '--n': i } as CSSProperties} />)}</div><svg viewBox="0 0 260 130" fill="none"><path d="m6 116 49-42 35 14 59-56 35 15 62-37m-28 0h28v28" /></svg></div>}
    {kind === 'particles' && <div className="pg-flower">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ '--n': i } as CSSProperties} />)}<i /></div>}
    {kind === 'loader' && <div className="pg-loader"><div>{[0, 1, 2, 3].map(i => <span key={i} style={{ '--n': i } as CSSProperties} />)}</div><span>A LITTLE<br />ANTICIPATION.</span></div>}
    {kind === 'bell' && <div className="pg-bell"><div className="pg-bell-shell"><svg viewBox="0 0 120 145"><path d="M25 95V60a35 35 0 0 1 70 0v35l12 17H13Z" /><path d="M44 128a17 17 0 0 0 32 0M60 18V8" /></svg><span>1</span></div><strong>Something new.</strong></div>}
  </div>
}
