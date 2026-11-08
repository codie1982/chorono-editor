'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { categories, samples } from '../homepage-mock/content'
import { Icon } from '../homepage-mock/visuals'
import { PlaygroundArt } from './art'

const root = '/homepage-playground'

function Brand() {
  return <span className="pg-brand">chorono<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M16 0 20 12 32 16 20 20 16 32 12 20 0 16 12 12Z" fill="currentColor" /></svg></span>
}

export function PlaygroundShell({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(false)
  const [menu, setMenu] = useState(false)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return <div className="pg-site" data-paused={paused || hidden}><a className="pg-skip" href="#pg-main">İçeriğe geç</a><header className="pg-header"><Link href={root} aria-label="Chorono Playground ana sayfa"><Brand /></Link><nav className={menu ? 'pg-nav pg-nav-open' : 'pg-nav'} aria-label="Ana menü" onClick={() => setMenu(false)}><Link href={`${root}#koleksiyon`}>Playground <span>08</span></Link><Link href={`${root}#yarat`}>Birlikte üret</Link><Link href={`${root}#oku`}>Okuma odası</Link></nav><div className="pg-header-end"><button className="pg-motion" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'Önizlemeleri oynat' : 'Önizlemeleri durdur'}><Icon name={paused ? 'play' : 'pause'} size={15} /><span>Hareket {paused ? 'kapalı' : 'açık'}</span></button><a href="/" className="pg-button pg-button-ink">Editörü aç <Icon name="arrow" size={17} /></a><button className="pg-menu" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={menu ? 'Menüyü kapat' : 'Menüyü aç'}><Icon name={menu ? 'close' : 'menu'} /></button></div></header>{children}<footer className="pg-footer"><div className="pg-frame pg-footer-top"><div><Link href={root} aria-label="Chorono Playground ana sayfa"><Brand /></Link><p>Merakla başlar.<br />Hareketle devam eder.</p></div><div><span>ÜRETMEYE DEVAM ET</span><a href="https://www.chorono.com/getting-started">Başlangıç rehberi <Icon name="arrow" size={14} /></a><a href="https://www.chorono.com/agent-skills">Ajan yetenekleri <Icon name="arrow" size={14} /></a><a href="https://github.com/codie1982/chorono-editor">GitHub <Icon name="arrow" size={14} /></a></div><div><span>DİĞER YÖNLER</span><Link href="/homepage-mock">01 / İlk konsept <Icon name="arrow" size={14} /></Link><Link href="/homepage-studio">02 / Studio <Icon name="arrow" size={14} /></Link><a href="/">Yerel editör <Icon name="arrow" size={14} /></a></div></div><div className="pg-frame pg-footer-bottom"><span>© {new Date().getFullYear()} CHORONO</span><span>PLAYGROUND / DIRECTION 03 · TASARIM MOCK’U</span><span>MADE FOR YOUR NEXT IDEA.</span></div></footer></div>
}

export function Collection() {
  const [category, setCategory] = useState('Tümü')
  const [query, setQuery] = useState('')
  const items = samples.filter(sample => (category === 'Tümü' || category === sample.category) && `${sample.title} ${sample.category} ${sample.description}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
  const full = category === 'Tümü' && !query
  const order = ['orbital-dongu', 'kinetik-tipografi', 'merhaba-karakter', 'buyume-grafigi', 'basarili-islem', 'parcacik-oyunu', 'nokta-yukleyici', 'bildirim-zili']
  const ordered = [...items].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug))
  return <section className="pg-collection pg-frame" id="koleksiyon" aria-labelledby="pg-collection-title"><div className="pg-section-label"><span>01 / A LITTLE INSPIRATION</span><span>FİKİRLER SERBEST. HAREKETLER DE.</span></div><div className="pg-collection-heading"><h2 id="pg-collection-title">Biraz kurcala.<br /><em>Bir şeye dönüşür.</em></h2><p>Hazır bir cevaptan çok,<br />yeni bir fikrin başlangıcı.<br /><span>Bir çalışma seç. İçine bak.</span></p><span className="pg-heading-arrow" aria-hidden="true">↙</span></div><div className="pg-collection-tools"><div role="group" aria-label="Örnek kategorileri" className="pg-filters">{categories.map(item => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={category === item ? 'pg-filter-active' : ''}>{item}{item === 'Tümü' && <span>08</span>}</button>)}</div><label className="pg-search"><span className="pg-sr">Örneklerde ara</span><Icon name="search" size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Bir fikir ara…" /></label></div><p className="pg-sr" role="status" aria-atomic="true">{ordered.length} örnek gösteriliyor.</p><div className={full ? 'pg-work-grid' : 'pg-work-grid pg-work-grid-filtered'}>{ordered.map(sample => <article key={sample.slug} className={`pg-work pg-work-${sample.kind}`}><Link href={`${root}/ornekler/${sample.slug}`} aria-label={`${sample.title} örneğini incele`}><div className="pg-work-top"><span>EXP. {String(samples.indexOf(sample) + 1).padStart(2, '0')}</span><span>{sample.category.toLocaleUpperCase('tr')}</span></div><PlaygroundArt kind={sample.kind} /><div className="pg-work-bottom"><div><h3>{sample.title}</h3><span>{sample.duration} / Görsel demo</span></div><span className="pg-work-link"><Icon name="arrow" size={21} /></span></div></Link></article>)}</div>{!ordered.length && <div className="pg-empty"><h3>Bu fikir henüz burada yok.</h3><p>Başka bir kelimeyle yeniden dene.</p><button className="pg-button pg-button-ink" onClick={() => {setCategory('Tümü');setQuery('')}}>Aramayı temizle <Icon name="arrow" size={18} /></button></div>}<div className="pg-collection-foot"><span>08 ÇALIŞMA / BOLCA OLASILIK</span><p>Buradaki görseller bir başlangıç. Sonraki hâli senin.</p><a href="/">Kendi sahneni oluştur <Icon name="arrow" size={16} /></a></div></section>
}
