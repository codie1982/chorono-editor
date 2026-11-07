'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { categories, mockRoot, samples, type Sample } from './content'
import { Icon, Logo, SampleArt } from './visuals'

export function Header() {
  const [open, setOpen] = useState(false)
  return <header className="hm-header"><div className="hm-container hm-header-inner">
    <Link href={mockRoot} aria-label="Chorono ana sayfa"><Logo /></Link>
    <nav aria-label="Ana menü" className={`hm-navigation ${open ? 'hm-navigation-open' : ''}`} onClick={() => setOpen(false)}>
      <Link href={`${mockRoot}#ornekler`}>Animasyonları keşfet</Link>
      <Link href={`${mockRoot}#nasil-calisir`}>Nasıl çalışır?</Link>
      <Link href={`${mockRoot}#rehberler`}>Öğren <span className="hm-nav-dot" /></Link>
    </nav>
    <div className="hm-header-actions"><a className="hm-github-link" href="https://github.com/codie1982/chorono-editor" aria-label="Chorono GitHub deposu"><Icon name="github" /></a><a href="/" className="hm-button hm-button-dark hm-header-cta">Editörü aç <Icon name="arrow" size={16} /></a><button className="hm-menu-toggle hm-icon-button" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /></button></div>
  </div></header>
}

export function MotionCanvas({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(false)
  return <div className="hm-motion-root" data-paused={paused}><div className="hm-preview-toolbar"><span><span className="hm-status-dot" /> ANA SAYFA KONSEPTİ · v1</span><button onClick={() => setPaused(!paused)} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} size={14} />{paused ? 'Önizlemeleri oynat' : 'Hareketi durdur'}</button></div>{children}</div>
}

export function SampleCard({ sample, index }: { sample: Sample; index: number }) {
  return <article className="hm-sample-card"><Link href={`${mockRoot}/ornekler/${sample.slug}`} className={`hm-sample-visual hm-tone-${sample.tone}`} aria-label={`${sample.title} örneğini incele`}>
    <span className="hm-sample-number">{String(index + 1).padStart(2, '0')}</span>
    <SampleArt kind={sample.kind} />
    <span className="hm-sample-play"><Icon name="arrow" size={18} /></span>
    <span className="hm-sample-duration">{sample.duration} · döngü</span>
  </Link><div className="hm-sample-info"><div><h3><Link href={`${mockRoot}/ornekler/${sample.slug}`}>{sample.title}</Link></h3><p>{sample.category} <span>·</span> Görsel demo</p></div><Icon name="layers" size={17} /></div></article>
}

export function Gallery() {
  const [category, setCategory] = useState('Tümü')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('curated')
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        sectionRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
        inputRef.current?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  const filtered = samples.filter(sample => (category === 'Tümü' || sample.category === category) && `${sample.title} ${sample.category} ${sample.description}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
  if (sort === 'alphabetic') filtered.sort((a, b) => a.title.localeCompare(b.title, 'tr'))
  return <section id="ornekler" ref={sectionRef} className="hm-section hm-gallery hm-container" aria-labelledby="gallery-heading">
    <div className="hm-section-top"><div><span className="hm-eyebrow">BİRAZ İLHAM, BOLCA HAREKET</span><h2 id="gallery-heading">Bir örnekle başla.<br className="hm-mobile-break" /> Kendi fikrine dönüştür.</h2><p>Aradığın küçük detay, bir sonraki büyük fikrin olabilir.</p></div><a href="https://www.chorono.com/getting-started" className="hm-text-link">Chorono’yu kur <Icon name="arrow" size={17} /></a></div>
    <div className="hm-gallery-search"><Icon name="search" size={21} /><label htmlFor="hm-search" className="hm-sr-only">Animasyon örneklerinde ara</label><input ref={inputRef} id="hm-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Aklında ne var? Animasyonlarda ara…" autoComplete="off" /><kbd>⌘ K</kbd></div>
    <div className="hm-filter-row"><div className="hm-filters" role="group" aria-label="Animasyon kategorileri">{categories.map(item => <button key={item} aria-pressed={category === item} className={category === item ? 'hm-filter-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="hm-sort"><label htmlFor="hm-sort">Sıralama</label><select id="hm-sort" value={sort} onChange={e => setSort(e.target.value)}><option value="curated">Editörün seçkisi</option><option value="alphabetic">İsme göre A–Z</option></select></div></div>
    <p className="hm-sr-only" role="status" aria-atomic="true">{filtered.length} animasyon örneği gösteriliyor.</p>
    <div className="hm-sample-grid">{filtered.map((sample) => <SampleCard key={sample.slug} sample={sample} index={samples.indexOf(sample)} />)}</div>
    {filtered.length === 0 && <div className="hm-empty"><Icon name="search" size={32} /><h3>Bu aramada henüz bir örnek yok.</h3><p>Başka bir kelime dene veya tüm örneklere göz at.</p><button className="hm-button hm-button-dark" onClick={() => {setQuery(''); setCategory('Tümü')}}>Filtreleri temizle</button></div>}
    <div className="hm-gallery-foot"><span><Icon name="layers" size={16} /> 8 örnek fikir. Sonsuz olasılık.</span><span>Seç, incele, ilham al.</span></div>
  </section>
}

export function CodeDemo() {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText('npm run chorono -- setup')
      setCopied(true)
      setError(false)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2500)
    } catch { setError(true) }
  }
  return <div className="hm-code-demo"><div className="hm-code-title"><span><i /><i /><i /></span><span>terminal</span><button onClick={copy}>{copied ? 'Kopyalandı' : 'Komutu kopyala'}<Icon name={copied ? 'check' : 'code'} size={15} /></button></div><pre><span>$ </span>npm run chorono -- setup</pre><div className="hm-code-bottom"><Icon name="check" size={16} /><span>Chorono kaynak klasöründe çalıştır.</span></div><span className="hm-sr-only" role="status">{copied ? 'Kurulum komutu panoya kopyalandı.' : error ? 'Komut kopyalanamadı. Yukarıdaki komutu seçerek kopyalayabilirsin.' : ''}</span>{error && <p>Komut kopyalanamadı. Komutu seçerek kopyalayabilirsin.</p>}</div>
}

export function Footer() {
  return <footer className="hm-footer hm-container"><div className="hm-footer-top"><div><Link href={mockRoot} aria-label="Chorono ana sayfa"><Logo /></Link><p>Biraz fikir.<br />Biraz hareket. Tamamen senin.</p></div><div className="hm-footer-column"><span>Keşfet</span><Link href={`${mockRoot}#ornekler`}>Animasyon örnekleri</Link><Link href={`${mockRoot}#kullanim-alanlari`}>Kullanım alanları</Link><Link href={`${mockRoot}#nasil-calisir`}>Nasıl çalışır?</Link></div><div className="hm-footer-column"><span>Öğren</span><Link href={`${mockRoot}#rehberler`}>Rehberler</Link><a href="https://www.chorono.com/getting-started">Kurulum</a><a href="https://www.chorono.com/agent-skills">Ajan yetenekleri</a></div><div className="hm-footer-column"><span>Birlikte üret</span><a href="https://github.com/codie1982/chorono-editor">GitHub <Icon name="arrow" size={13} /></a><a href="/">Yerel editör <Icon name="arrow" size={13} /></a><Link href={`${mockRoot}#sorular`}>Sık sorulan sorular</Link></div></div><div className="hm-footer-bottom"><span>© {new Date().getFullYear()} Chorono</span><span className="hm-mock-label">Tasarım önizlemesi · Türkçe konsept</span><span>Made to move<span className="hm-footer-star">✳</span></span></div></footer>
}
